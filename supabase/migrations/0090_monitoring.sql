-- 0090_monitoring.sql
-- Admin panel: Monitoring (/admin/monitoring). Covered by
-- supabase/security-tests/monitoring.sql.
--
--   * App errors: the web app reports unexpected errors (render crashes,
--     failed requests, unhandled promise rejections) to fp_log_client_error.
--     They are grouped by fingerprint (same message + same code location), so
--     one bug is one row with a count, not thousands. A resolved error that
--     happens again reopens. Anonymous callers can report (sign-in pages
--     crash too) but inputs are capped and new groups are rate-limited.
--   * Status: one call returns every health check (jobs, email queue,
--     workflows, payment webhooks, app errors, scheduler set-up), database
--     size and 24-hour email / job activity.
--   * Background jobs: schedule, recent runs, success rate, "Run now".
--   * Email queue: counts, failures by reason, retry or cancel messages.
--     Message bodies are never shown to staff (they can hold tenant data).
--   * Webhooks: Stripe / PayPal deliveries and failures.
--   * Failed payment webhooks join the hourly health check, and alert emails
--     now point to Admin → Monitoring.

-- ===========================================================================
-- App errors
-- ===========================================================================
create table if not exists fp_app_errors (
  id            bigint generated always as identity primary key,
  fingerprint   text not null unique,
  source        text not null check (source in ('web', 'admin', 'edge', 'other')),
  message       text not null,
  location      text,                       -- top stack frame (first seen)
  sample        jsonb not null default '{}'::jsonb,  -- last stack, url, release, context
  occurrences   int not null default 1,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  last_user_id  uuid,
  last_org_id   uuid,
  status        text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  resolved_at   timestamptz,
  resolved_by   uuid,
  reopened      int not null default 0
);
create index if not exists fp_app_errors_seen_idx on fp_app_errors (last_seen desc);
create index if not exists fp_app_errors_first_idx on fp_app_errors (first_seen desc);

alter table fp_app_errors enable row level security;
drop policy if exists admin_read on fp_app_errors;
create policy admin_read on fp_app_errors for select to authenticated using ( fp_admin_can('monitoring.view') );
revoke all on fp_app_errors from anon;
revoke insert, update, delete on fp_app_errors from authenticated;

-- Same bug, same group: ids, numbers and bundle hashes don't split it.
create or replace function fp_error_normalise(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''),
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi'),
    '-[A-Za-z0-9_]{8}\.js', '.js', 'g'),          -- vite chunk hashes
    ':\d+(:\d+)?', '', 'g'),                        -- line:column
    '\d+', 'N', 'g');
$$;

-- Strip the query string and fragment: they can carry tokens.
create or replace function fp_error_clean_url(p text)
returns text
language sql
immutable
as $$
  select nullif(left(split_part(split_part(coalesce(p, ''), '#', 1), '?', 1), 300), '');
$$;

create or replace function fp_record_app_error(
  p_source text, p_message text, p_stack text, p_url text, p_release text, p_context jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source  text := case when p_source in ('web', 'admin', 'edge') then p_source else 'other' end;
  v_msg     text := left(btrim(coalesce(p_message, '')), 500);
  v_stack   text := left(coalesce(p_stack, ''), 4000);
  v_loc     text;
  v_fp      text;
  v_org     uuid;
begin
  if v_msg = '' then
    return;
  end if;
  -- First frame that isn't the message line: "at fn (url:1:2)" or "fn@url:1:2".
  select left(regexp_replace(btrim(l), '\?[^):\s]*', '', 'g'), 300) into v_loc
    from unnest(string_to_array(v_stack, E'\n')) with ordinality s(l, n)
   where l ~ '(^\s*at\s|@)' and l !~ '(chrome|moz|safari)-extension://'
   order by n limit 1;
  v_fp := md5(v_source || '|' || fp_error_normalise(v_msg) || '|' || fp_error_normalise(v_loc));

  if auth.uid() is not null then
    select org_id into v_org from fp_users_orgs where user_id = auth.uid() order by created_at limit 1;
  end if;

  update fp_app_errors
     set occurrences = occurrences + 1,
         last_seen = now(),
         last_user_id = coalesce(auth.uid(), last_user_id),
         last_org_id = coalesce(v_org, last_org_id),
         sample = jsonb_strip_nulls(jsonb_build_object('stack', nullif(v_stack, ''), 'url', fp_error_clean_url(p_url),
                    'release', left(p_release, 60), 'context', p_context)),
         -- It came back: a fix didn't hold.
         reopened = reopened + (status = 'resolved')::int,
         status = case when status = 'resolved' then 'open' else status end,
         resolved_at = case when status = 'resolved' then null else resolved_at end,
         resolved_by = case when status = 'resolved' then null else resolved_by end
   where fingerprint = v_fp;
  if found then
    return;
  end if;

  -- A flood of distinct errors (or someone scripting the endpoint) can't
  -- fill the table: at most 300 new groups an hour.
  if (select count(*) from fp_app_errors where first_seen > now() - interval '1 hour') >= 300 then
    return;
  end if;

  insert into fp_app_errors (fingerprint, source, message, location, sample, last_user_id, last_org_id)
  values (v_fp, v_source, v_msg, v_loc,
          jsonb_strip_nulls(jsonb_build_object('stack', nullif(v_stack, ''), 'url', fp_error_clean_url(p_url),
            'release', left(p_release, 60), 'context', p_context)),
          auth.uid(), v_org)
  on conflict (fingerprint) do update set occurrences = fp_app_errors.occurrences + 1, last_seen = now();
end;
$$;

-- Called by the web app (signed in or not).
create or replace function fp_log_client_error(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := p -> 'context';
begin
  if jsonb_typeof(v_ctx) is distinct from 'object' or length(v_ctx::text) > 1000 then
    v_ctx := null;
  end if;
  perform fp_record_app_error(
    case when p ->> 'source' = 'admin' then 'admin' else 'web' end,
    p ->> 'message', p ->> 'stack', p ->> 'url', p ->> 'release', v_ctx);
end;
$$;

-- Called by Edge Functions (service role).
create or replace function fp_log_server_error(p_function text, p_message text, p_stack text default null, p_context jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_record_app_error('edge', '[' || left(coalesce(p_function, '?'), 60) || '] ' || coalesce(p_message, ''),
    p_stack, null, null, p_context);
end;
$$;

-- ===========================================================================
-- Jobs: one body shared by the scheduler and "Run now"
-- ===========================================================================
create or replace function fp_job_execute(p_job text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  bigint;
  v_n   int;
  v_sql text;
begin
  select run_sql into v_sql from fp_jobs where job = p_job;
  if not found then
    raise exception 'Unknown job %', p_job;
  end if;

  insert into fp_job_runs (job) values (p_job) returning id into v_id;
  begin
    if v_sql is null then
      raise exception 'Job % cannot run inside the database', p_job;
    end if;
    -- run_sql comes from fp_jobs, which only migrations write.
    execute v_sql into v_n;
    update fp_job_runs set finished_at = now(), ok = true, processed = coalesce(v_n, 0) where id = v_id;
  exception when others then
    update fp_job_runs set finished_at = now(), ok = false, error = left(sqlerrm, 2000) where id = v_id;
  end;
  return v_n;
end;
$$;

create or replace function fp_run_job(p_job text)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_assert_scheduler_or_manager(null);
  return fp_job_execute(p_job);
end;
$$;

-- Edge Function call without the caller check (callers check first).
create or replace function fp_dispatch_edge_function_unchecked(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    raise exception 'pg_net and Supabase Vault are required to call Edge Functions from the database';
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'project_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'service_role_key';
  if v_url is null or v_key is null then
    raise exception 'Vault secrets project_url / service_role_key are not set (see README)';
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3)'
    using rtrim(v_url, '/') || '/functions/v1/' || p_name,
          jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
          '{}'::jsonb;
end;
$$;

create or replace function fp_dispatch_edge_function(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_assert_scheduler_or_manager(null);
  perform fp_dispatch_edge_function_unchecked(p_name);
end;
$$;

-- Jobs that run in an Edge Function rather than in SQL.
create or replace function fp_job_edge_function(p_job text)
returns text
language sql
immutable
as $$
  select case p_job when 'process_outbox' then 'process-outbox' end;
$$;

-- pg_cron's entry for a job (schedule + active), when pg_cron is installed.
create or replace function fp_job_schedules()
returns table (job text, schedule text, active boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  return query execute $q$
    select f.job, c.schedule::text, c.active
    from fp_jobs f
    join lateral (select schedule, active from cron.job c
                  where c.command like '%''' || f.job || '''%' order by c.jobid limit 1) c on true
  $q$;
exception when others then
  return;
end;
$$;

-- ===========================================================================
-- Health checks: payment webhooks join; alerts point to Admin → Monitoring
-- ===========================================================================
create or replace function fp_system_checks()
returns table (check_name text, ok boolean, detail text)
language sql
stable
security definer
set search_path = public
as $$
  with failed as (
    select count(*) as n
    from fp_notification_outbox
    where status = 'failed' and created_at > now() - interval '24 hours'
      and error is distinct from 'daily_quota_exceeded'
      and error is distinct from 'cancelled by staff'
  ), backlog as (
    select count(*) filter (where created_at < now() - interval '30 minutes') as stale,
           min(created_at) as oldest
    from fp_notification_outbox
    where status in ('pending', 'sending')
  ), wf as (
    select count(*) as n, count(distinct w.org_id) as orgs, max(r.error) as sample
    from fp_workflow_runs r join fp_workflows w on w.id = r.workflow_id
    where r.status = 'failed' and r.started_at > now() - interval '24 hours'
  ), hooks as (
    select count(*) as n, max(error) as sample
    from fp_billing_events
    where status = 'failed' and received_at > now() - interval '24 hours'
  )
  select 'outbox_failed', f.n < 5,
         f.n || ' message(s) failed to send in the last 24 hours'
  from failed f
  union all
  select 'outbox_backlog',
         b.stale < 100 and (b.oldest is null or b.oldest > now() - interval '2 hours'),
         b.stale || ' message(s) waiting over 30 minutes'
           || coalesce('; oldest queued ' || to_char(b.oldest at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), '')
  from backlog b
  union all
  select 'workflow_failures', w.n = 0,
         w.n || ' failed workflow run(s) in the last 24 hours across ' || w.orgs || ' organisation(s)'
           || coalesce('; e.g. ' || left(w.sample, 200), '')
  from wf w
  union all
  select 'webhook_failures', h.n = 0,
         h.n || ' payment webhook(s) failed in the last 24 hours'
           || coalesce('; e.g. ' || left(h.sample, 200), '')
  from hooks h;
$$;

create or replace function fp_check_job_health()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  j        record;
  c        record;
  bad      int := 0;
  admin    record;
  v_reason text;
begin
  perform fp_assert_scheduler_or_manager(null);

  for j in
    select f.job, f.description, f.max_silence, f.last_alerted_at,
           (select max(finished_at) from fp_job_runs r where r.job = f.job and r.ok) as last_ok_at,
           (select r.ok from fp_job_runs r where r.job = f.job order by started_at desc limit 1) as last_ok,
           (select r.error from fp_job_runs r where r.job = f.job order by started_at desc limit 1) as last_error
    from fp_jobs f
    where f.job <> 'check_job_health'
    for update of f
  loop
    v_reason := case
      when j.last_ok is false then 'last run failed: ' || coalesce(j.last_error, 'unknown error')
      when j.last_ok_at is null then 'has never completed successfully'
      when j.last_ok_at < now() - j.max_silence then 'has not completed successfully since ' || to_char(j.last_ok_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')
    end;
    continue when v_reason is null;
    bad := bad + 1;

    if j.last_alerted_at is null or j.last_alerted_at < now() - interval '6 hours' then
      for admin in
        select u.email from fp_platform_admins p join auth.users u on u.id = p.user_id
        where u.email is not null and p.disabled_at is null and fp_admin_role_permissions(p.role) @> array['monitoring.view']
      loop
        insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
        values (null, 'email', admin.email,
                'FacilityPro: background job "' || j.job || '" needs attention',
                j.description || ' — ' || v_reason || '.' || E'\n\n'
                  || 'Open Admin → Monitoring → Background jobs to see its recent runs and run it again.');
      end loop;
      update fp_jobs set last_alerted_at = now() where job = j.job;
    end if;
  end loop;

  for c in select * from fp_system_checks() where not ok loop
    bad := bad + 1;
    if exists (select 1 from fp_health_alerts a
               where a.check_name = c.check_name and a.last_alerted_at > now() - interval '6 hours') then
      continue;
    end if;
    for admin in
      select u.email from fp_platform_admins p join auth.users u on u.id = p.user_id
      where u.email is not null and p.disabled_at is null and fp_admin_role_permissions(p.role) @> array['monitoring.view']
    loop
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (null, 'email', admin.email,
              'FacilityPro: ' || replace(c.check_name, '_', ' ') || ' needs attention',
              c.detail || '.' || E'\n\n' || 'Open Admin → Monitoring → ' || case c.check_name
                when 'workflow_failures' then 'Errors'
                when 'webhook_failures' then 'Webhooks'
                else 'Email queue'
              end || ' for details.');
    end loop;
    insert into fp_health_alerts (check_name, last_alerted_at) values (c.check_name, now())
      on conflict (check_name) do update set last_alerted_at = excluded.last_alerted_at;
  end loop;

  return bad;
end;
$$;

-- Job history and resolved/ignored errors are kept bounded.
create or replace function fp_prune_job_runs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from fp_job_runs where started_at < now() - interval '30 days';
  delete from fp_app_errors where last_seen < now() - interval '90 days';
$$;

-- ===========================================================================
-- Status
-- ===========================================================================
create or replace function fp_admin_monitoring_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cron    boolean := exists (select 1 from pg_extension where extname = 'pg_cron');
  v_net     boolean := exists (select 1 from pg_extension where extname = 'pg_net');
  v_vault   boolean;
  v_jobs    jsonb;
  v_checks  jsonb;
begin
  perform fp_admin_require('monitoring.view');

  -- Whether the two Vault secrets exist (names only; values are never read here).
  begin
    execute 'select count(*) = 2 from vault.secrets where name in (''project_url'', ''service_role_key'')' into v_vault;
  exception when others then
    v_vault := null;
  end;

  select jsonb_build_object(
    'total', count(*),
    'healthy', count(*) filter (where healthy),
    'late', coalesce(jsonb_agg(job order by job) filter (where not healthy), '[]'::jsonb))
    into v_jobs
  from (
    select f.job, coalesce(lr.ok, false) and lo.finished_at >= now() - f.max_silence as healthy
    from fp_jobs f
    left join lateral (select r.ok from fp_job_runs r where r.job = f.job order by r.started_at desc limit 1) lr on true
    left join lateral (select max(r.finished_at) as finished_at from fp_job_runs r where r.job = f.job and r.ok) lo on true
  ) x;

  select jsonb_agg(jsonb_build_object('name', check_name, 'ok', ok, 'detail', detail) order by check_name)
    into v_checks from fp_system_checks();

  return jsonb_build_object(
    'checked_at', now(),
    'jobs', v_jobs,
    'checks', coalesce(v_checks, '[]'::jsonb),
    'errors', jsonb_build_object(
      'open', (select count(*) from fp_app_errors where status = 'open'),
      'new_24h', (select count(*) from fp_app_errors where first_seen > now() - interval '24 hours' and status <> 'ignored'),
      'events_24h', (select coalesce(sum(occurrences), 0) from fp_app_errors where last_seen > now() - interval '24 hours' and status <> 'ignored')),
    'outbox', jsonb_build_object(
      'pending', (select count(*) from fp_notification_outbox where status in ('pending', 'sending')),
      'sent_24h', (select count(*) from fp_notification_outbox where status = 'sent' and sent_at > now() - interval '24 hours'),
      'failed_24h', (select count(*) from fp_notification_outbox where status = 'failed' and created_at > now() - interval '24 hours')),
    'webhooks', jsonb_build_object(
      'received_24h', (select count(*) from fp_billing_events where received_at > now() - interval '24 hours'),
      'failed_24h', (select count(*) from fp_billing_events where status = 'failed' and received_at > now() - interval '24 hours'),
      'last_at', (select max(received_at) from fp_billing_events)),
    'setup', jsonb_build_object('cron', v_cron, 'net', v_net, 'vault', v_vault),
    'database', jsonb_build_object(
      'size_bytes', pg_database_size(current_database()),
      'connections', (select count(*) from pg_stat_activity where datname = current_database()),
      'tables', (select jsonb_agg(t order by (t ->> 'bytes')::bigint desc) from (
                   select jsonb_build_object('name', c.relname, 'bytes', pg_total_relation_size(c.oid),
                                             'rows', greatest(c.reltuples, 0)::bigint) as t
                   from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind = 'r'
                   order by pg_total_relation_size(c.oid) desc limit 8) s)),
    -- Hour by hour for the last 24 hours (oldest first).
    'hourly', (select jsonb_agg(jsonb_build_object(
                 'hour', h,
                 'sent', (select count(*) from fp_notification_outbox o where o.status = 'sent' and o.sent_at >= h and o.sent_at < h + interval '1 hour'),
                 'failed', (select count(*) from fp_notification_outbox o where o.status = 'failed' and o.created_at >= h and o.created_at < h + interval '1 hour'),
                 'job_failures', (select count(*) from fp_job_runs r where not r.ok and r.started_at >= h and r.started_at < h + interval '1 hour'),
                 'errors', (select count(*) from fp_app_errors e where e.first_seen >= h and e.first_seen < h + interval '1 hour'))
                 order by h)
               from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h)
  );
end;
$$;

-- ===========================================================================
-- Background jobs
-- ===========================================================================
create or replace function fp_admin_jobs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('monitoring.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'job', f.job, 'description', f.description,
      'max_silence_minutes', (extract(epoch from f.max_silence) / 60)::int,
      'schedule', s.schedule, 'scheduled', s.active,
      'runnable', f.run_sql is not null or fp_job_edge_function(f.job) is not null,
      'runs_in', case when f.run_sql is not null then 'database' when fp_job_edge_function(f.job) is not null then 'edge' else 'external' end,
      'last_run_at', lr.started_at, 'last_ok', lr.ok, 'last_error', lr.error, 'last_processed', lr.processed,
      'last_ok_at', lo.finished_at, 'last_alerted_at', f.last_alerted_at,
      'healthy', coalesce(lr.ok, false) and lo.finished_at >= now() - f.max_silence,
      'running', lr.started_at is not null and lr.finished_at is null and lr.started_at > now() - interval '30 minutes',
      'runs_24h', st.runs, 'failures_24h', st.failures, 'avg_ms', st.avg_ms)
      order by f.job)
    from fp_jobs f
    left join fp_job_schedules() s on s.job = f.job
    left join lateral (select r.started_at, r.finished_at, r.ok, r.error, r.processed from fp_job_runs r
                       where r.job = f.job order by r.started_at desc limit 1) lr on true
    left join lateral (select max(r.finished_at) as finished_at from fp_job_runs r where r.job = f.job and r.ok) lo on true
    left join lateral (select count(*) as runs, count(*) filter (where r.ok is false) as failures,
                              round(avg(extract(epoch from (r.finished_at - r.started_at)) * 1000)) as avg_ms
                       from fp_job_runs r where r.job = f.job and r.started_at > now() - interval '24 hours') st on true
  ), '[]'::jsonb);
end;
$$;

create or replace function fp_admin_job_runs(p_job text, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('monitoring.view');
  return jsonb_build_object(
    'total', (select count(*) from fp_job_runs where job = p_job),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
               'id', r.id, 'started_at', r.started_at, 'finished_at', r.finished_at, 'ok', r.ok,
               'processed', r.processed, 'error', r.error,
               'ms', round(extract(epoch from (r.finished_at - r.started_at)) * 1000)) order by r.started_at desc)
             from (select * from fp_job_runs where job = p_job order by started_at desc
                   limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) r), '[]'::jsonb));
end;
$$;

-- "Run now": runs a database job straight away (or starts the Edge
-- Function), recorded like a scheduled run. Once a minute per job.
create or replace function fp_admin_run_job(p_job text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sql text;
  v_fn  text := fp_job_edge_function(p_job);
  v_n   int;
  v_run fp_job_runs;
  v_claims text;
  v_sub    text;
  v_role   text;
  v_err    text;
begin
  perform fp_admin_require('monitoring.view');
  select run_sql into v_sql from fp_jobs where job = p_job;
  if not found then
    raise exception 'Unknown job %', p_job using errcode = 'P0002';
  end if;
  if v_sql is null and v_fn is null then
    raise exception 'job_not_runnable';
  end if;
  if exists (select 1 from fp_job_runs where job = p_job and started_at > now() - interval '1 minute') then
    raise exception 'job_ran_recently';
  end if;

  if v_sql is not null then
    -- Jobs only accept the scheduler (no signed-in user). The permission
    -- check is done, and run_sql comes from fp_jobs (migrations only), so
    -- run it as the scheduler would, then restore the staff session.
    v_claims := current_setting('request.jwt.claims', true);
    v_sub    := current_setting('request.jwt.claim.sub', true);
    v_role   := current_setting('request.jwt.claim.role', true);
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', 'service_role', true);
    begin
      v_n := fp_job_execute(p_job);
    exception when others then
      v_err := sqlerrm;
    end;
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    perform set_config('request.jwt.claim.role', coalesce(v_role, ''), true);
    if v_err is not null then
      raise exception '%', v_err;
    end if;
    select * into v_run from fp_job_runs where job = p_job order by started_at desc, id desc limit 1;
  else
    begin
      perform fp_dispatch_edge_function_unchecked(v_fn);
    exception when others then
      insert into fp_job_runs (job, finished_at, ok, error) values (p_job, now(), false, left(sqlerrm, 2000))
        returning * into v_run;
    end;
  end if;

  perform fp_admin_log('job.run', 'fp_jobs', p_job, null, null,
    jsonb_build_object('ok', v_run.ok, 'processed', v_run.processed, 'error', v_run.error));
  return jsonb_build_object(
    'started', v_run.id is null,               -- Edge Function started; it records its own run
    'ok', v_run.ok, 'processed', v_run.processed, 'error', v_run.error);
end;
$$;

-- ===========================================================================
-- Email queue
-- ===========================================================================
create or replace function fp_admin_outbox(
  p_status text default null, p_channel text default null, p_search text default null,
  p_limit int default 50, p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform fp_admin_require('monitoring.view');
  return (
    with m as (
      select o.id, o.channel, o.to_address, o.subject, o.status, o.error, o.attempts, o.created_at, o.sent_at, o.claimed_at,
             o.org_id, g.name as org_name
      from fp_notification_outbox o
      left join fp_organizations g on g.id = o.org_id
      where (p_status is null or (p_status = 'pending' and o.status in ('pending', 'sending')) or o.status = p_status)
        and (p_channel is null or o.channel = p_channel)
        and (v_q is null or o.to_address ilike '%' || v_q || '%' or o.subject ilike '%' || v_q || '%' or o.error ilike '%' || v_q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from m),
      'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
                select * from m order by created_at desc
                limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb))
  );
end;
$$;

create or replace function fp_admin_outbox_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('monitoring.view');
  return jsonb_build_object(
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
                    select status, count(*) as n from fp_notification_outbox
                    where status in ('pending', 'sending') or created_at > now() - interval '7 days' group by status) s),
    'channels', (select coalesce(jsonb_agg(distinct channel), '[]'::jsonb) from fp_notification_outbox),
    'oldest_pending', (select min(created_at) from fp_notification_outbox where status in ('pending', 'sending')),
    'top_errors', (select coalesce(jsonb_agg(jsonb_build_object('error', error, 'count', n, 'last_at', last_at) order by n desc), '[]'::jsonb) from (
                     select left(error, 300) as error, count(*) as n, max(created_at) as last_at from fp_notification_outbox
                     where status = 'failed' and created_at > now() - interval '7 days'
                     group by left(error, 300) order by count(*) desc limit 8) e)
  );
end;
$$;

-- Send failed messages again. With no ids: every failure from the last
-- 24 hours (at most 500).
create or replace function fp_admin_outbox_retry(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform fp_admin_require('monitoring.view');
  update fp_notification_outbox
     set status = 'pending', attempts = 0, error = null, claimed_at = null
   where id in (
     select id from fp_notification_outbox
     where status = 'failed'
       and (case when p_ids is null then created_at > now() - interval '24 hours' else id = any(p_ids) end)
     order by created_at desc limit 500);
  get diagnostics n = row_count;
  perform fp_admin_log('outbox.retry', 'fp_notification_outbox', null, null, null,
    jsonb_build_object('count', n, 'ids', to_jsonb(p_ids)));
  return n;
end;
$$;

-- Stop queued messages from going out (e.g. a runaway notification loop).
create or replace function fp_admin_outbox_cancel(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform fp_admin_require('monitoring.view');
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;
  update fp_notification_outbox
     set status = 'failed', error = 'cancelled by staff'
   where id = any(p_ids[1:500]) and status = 'pending';
  get diagnostics n = row_count;
  perform fp_admin_log('outbox.cancel', 'fp_notification_outbox', null, null, null,
    jsonb_build_object('count', n, 'ids', to_jsonb(p_ids[1:500])));
  return n;
end;
$$;

-- ===========================================================================
-- App errors (staff)
-- ===========================================================================
create or replace function fp_admin_app_errors(
  p_status text default 'open', p_source text default null, p_search text default null,
  p_limit int default 50, p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform fp_admin_require('monitoring.view');
  return (
    with m as (
      select e.* from fp_app_errors e
      where (p_status is null or e.status = p_status)
        and (p_source is null or e.source = p_source)
        and (v_q is null or e.message ilike '%' || v_q || '%' or e.location ilike '%' || v_q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from m),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', x.id, 'source', x.source, 'message', x.message, 'location', x.location,
                 'occurrences', x.occurrences, 'first_seen', x.first_seen, 'last_seen', x.last_seen,
                 'status', x.status, 'reopened', x.reopened) order by x.last_seen desc)
               from (select * from m order by last_seen desc
                     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb))
  );
end;
$$;

create or replace function fp_admin_app_error(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform fp_admin_require('monitoring.view');
  select to_jsonb(e) - 'fingerprint'
         || jsonb_build_object(
              'last_user_email', (select email from auth.users where id = e.last_user_id),
              'last_org_name', (select name from fp_organizations where id = e.last_org_id),
              'resolved_by_email', (select email from auth.users where id = e.resolved_by))
    into v
  from fp_app_errors e where e.id = p_id;
  if v is null then
    raise exception 'Error not found' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

create or replace function fp_admin_app_errors_set(p_ids bigint[], p_status text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform fp_admin_require('monitoring.view');
  if p_status not in ('open', 'resolved', 'ignored') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update fp_app_errors
     set status = p_status,
         resolved_at = case when p_status = 'open' then null else now() end,
         resolved_by = case when p_status = 'open' then null else auth.uid() end
   where id = any(p_ids[1:500]) and status <> p_status;
  get diagnostics n = row_count;
  perform fp_admin_log('error.' || p_status, 'fp_app_errors', null, null, null,
    jsonb_build_object('count', n, 'ids', to_jsonb(p_ids[1:500])));
  return n;
end;
$$;

-- Failed workflow runs across tenants (the other kind of error).
create or replace function fp_admin_workflow_failures(p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('monitoring.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'at', r.started_at, 'error', left(r.error, 500), 'workflow', w.name,
      'org_id', w.org_id, 'org_name', o.name) order by r.started_at desc)
    from (select * from fp_workflow_runs where status = 'failed' and started_at > now() - interval '7 days'
          order by started_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) r
    join fp_workflows w on w.id = r.workflow_id
    left join fp_organizations o on o.id = w.org_id
  ), '[]'::jsonb);
end;
$$;

-- ===========================================================================
-- Webhooks
-- ===========================================================================
create or replace function fp_admin_webhooks(
  p_provider text default null, p_status text default null, p_limit int default 50, p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('monitoring.view');
  return (
    with m as (
      select e.*, o.name as org_name from fp_billing_events e left join fp_organizations o on o.id = e.org_id
      where (p_provider is null or e.provider = p_provider) and (p_status is null or e.status = p_status)
    )
    select jsonb_build_object(
      'total', (select count(*) from m),
      'stats', (select coalesce(jsonb_object_agg(provider || ':' || status, n), '{}'::jsonb) from (
                  select provider, status, count(*) as n from fp_billing_events
                  where received_at > now() - interval '7 days' group by 1, 2) s),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', x.id, 'provider', x.provider, 'event_id', x.event_id, 'type', x.type, 'object_id', x.object_id,
                 'org_id', x.org_id, 'org_name', x.org_name, 'status', x.status, 'error', x.error,
                 'received_at', x.received_at, 'processed_at', x.processed_at) order by x.received_at desc)
               from (select * from m order by received_at desc
                     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb))
  );
end;
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on function fp_error_normalise(text), fp_error_clean_url(text),
  fp_record_app_error(text, text, text, text, text, jsonb), fp_log_client_error(jsonb),
  fp_log_server_error(text, text, text, jsonb), fp_job_execute(text), fp_dispatch_edge_function_unchecked(text),
  fp_job_edge_function(text), fp_job_schedules(), fp_admin_monitoring_status(), fp_admin_jobs(),
  fp_admin_job_runs(text, int, int), fp_admin_run_job(text), fp_admin_outbox(text, text, text, int, int),
  fp_admin_outbox_stats(), fp_admin_outbox_retry(uuid[]), fp_admin_outbox_cancel(uuid[]),
  fp_admin_app_errors(text, text, text, int, int), fp_admin_app_error(bigint), fp_admin_app_errors_set(bigint[], text),
  fp_admin_workflow_failures(int), fp_admin_webhooks(text, text, int, int)
  from public, anon, authenticated;
grant execute on function fp_log_client_error(jsonb) to anon, authenticated;
grant execute on function fp_log_server_error(text, text, text, jsonb) to service_role;
grant execute on function fp_admin_monitoring_status(), fp_admin_jobs(), fp_admin_job_runs(text, int, int),
  fp_admin_run_job(text), fp_admin_outbox(text, text, text, int, int), fp_admin_outbox_stats(),
  fp_admin_outbox_retry(uuid[]), fp_admin_outbox_cancel(uuid[]), fp_admin_app_errors(text, text, text, int, int),
  fp_admin_app_error(bigint), fp_admin_app_errors_set(bigint[], text), fp_admin_workflow_failures(int),
  fp_admin_webhooks(text, text, int, int) to authenticated;
