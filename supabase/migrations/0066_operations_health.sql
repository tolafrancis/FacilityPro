-- 0066_operations_health.sql
-- Audit finding S7-H2: beyond the job heartbeat (0061), nothing noticed that
-- emails were failing or piling up, or that workflows were erroring.
-- Covered by supabase/security-tests/operations_health.sql.
--
--   * fp_system_checks(): outbox failures, outbox backlog, workflow failures.
--   * fp_check_job_health() (hourly) now also emails platform admins about
--     those, at most every 6 hours per problem.
--   * fp_system_health(): the same checks for the Billing → Background jobs
--     panel (platform admins).
--   * fp_system_status(): one JSON verdict for the `health` Edge Function, so
--     an external uptime monitor can alert even when email itself is broken.

create table if not exists fp_health_alerts (
  check_name      text primary key,
  last_alerted_at timestamptz not null
);
alter table fp_health_alerts enable row level security;  -- no policies: internal

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
  ), backlog as (
    select count(*) filter (where created_at < now() - interval '30 minutes') as stale,
           min(created_at) as oldest
    from fp_notification_outbox
    where status in ('pending', 'sending')
  ), wf as (
    select count(*) as n, count(distinct w.org_id) as orgs, max(r.error) as sample
    from fp_workflow_runs r join fp_workflows w on w.id = r.workflow_id
    where r.status = 'failed' and r.started_at > now() - interval '24 hours'
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
  from wf w;
$$;

create or replace function fp_system_health()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fp_is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query select * from fp_system_checks();
end;
$$;

-- For the `health` Edge Function (service role).
create or replace function fp_system_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with jobs as (
    select f.job,
           coalesce(lr.ok, false) and lo.finished_at >= now() - f.max_silence as healthy
    from fp_jobs f
    left join lateral (select r.ok from fp_job_runs r where r.job = f.job
                       order by r.started_at desc limit 1) lr on true
    left join lateral (select max(r.finished_at) as finished_at from fp_job_runs r
                       where r.job = f.job and r.ok) lo on true
  ), problems as (
    select 'job:' || job as name from jobs where not healthy
    union all
    select check_name from fp_system_checks() where not ok
  )
  select jsonb_build_object(
    'ok', not exists (select 1 from problems),
    'problems', coalesce((select jsonb_agg(name order by name) from problems), '[]'::jsonb),
    'checked_at', now()
  );
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
        select u.email from fp_platform_admins p join auth.users u on u.id = p.user_id where u.email is not null
      loop
        insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
        values (null, 'email', admin.email,
                'FacilitySpace: background job "' || j.job || '" needs attention',
                j.description || ' — ' || v_reason || '.' || E'\n\n'
                  || 'Check Billing → Background jobs, or: select * from fp_job_runs where job = '''
                  || j.job || ''' order by started_at desc limit 20;');
      end loop;
      update fp_jobs set last_alerted_at = now() where job = j.job;
    end if;
  end loop;

  -- Delivery and workflow problems (0066).
  for c in select * from fp_system_checks() where not ok loop
    bad := bad + 1;
    if exists (select 1 from fp_health_alerts a
               where a.check_name = c.check_name and a.last_alerted_at > now() - interval '6 hours') then
      continue;
    end if;
    for admin in
      select u.email from fp_platform_admins p join auth.users u on u.id = p.user_id where u.email is not null
    loop
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (null, 'email', admin.email,
              'FacilitySpace: ' || replace(c.check_name, '_', ' ') || ' needs attention',
              c.detail || '.' || E'\n\n' || case c.check_name
                when 'workflow_failures' then 'See: select * from fp_workflow_runs where status = ''failed'' order by started_at desc limit 50;'
                else 'See: select status, error, count(*) from fp_notification_outbox where created_at > now() - interval ''24 hours'' group by 1, 2;'
              end);
    end loop;
    insert into fp_health_alerts (check_name, last_alerted_at) values (c.check_name, now())
      on conflict (check_name) do update set last_alerted_at = excluded.last_alerted_at;
  end loop;

  return bad;
end;
$$;

-- EXECUTE is an allow-list since 0059.
revoke execute on function fp_system_checks(), fp_system_status() from public, anon, authenticated;
grant execute on function fp_system_status() to service_role;
grant execute on function fp_system_health() to authenticated;
