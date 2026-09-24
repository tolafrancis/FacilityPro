-- 0061_pm_scheduling_and_jobs.sql
-- Audit findings S1-H4 (PM scheduling) and S1-H5 / S7-H2 (scheduled jobs are
-- never actually scheduled, and nothing notices when they stop).
-- Covered by supabase/security-tests/pm_and_jobs.sql.
--
-- PM generation:
--   * Calendar schedules keep their anchor: the next due date is the previous
--     due date + interval (in the org's time zone), not "whenever the job ran"
--     + interval, so a late run no longer shifts every future due date.
--   * If cycles were missed (scheduler down), one work order is created for
--     the most recent occurrence and notes how many were skipped, instead of
--     a burst of stale work orders or silently losing them.
--   * One work order per schedule occurrence (unique index), so overlapping
--     runs or retries can't duplicate.
--   * Schedules on retired/disposed/inactive assets don't generate; retiring
--     or disposing an asset pauses its schedules.
--   * Meter schedules start from the meter's current reading (no instant work
--     order on a 10,000-hour meter), treat a lower reading as a meter reset,
--     and ignore readings timestamped in the future.
--   * Generated work orders take the asset's location (site scoping, routing).
--
-- Jobs:
--   * fp_run_job() runs a named job and records it in fp_job_runs.
--   * fp_jobs lists each job with how long it may stay silent; a health check
--     emails platform admins when a job is late or failing.
--   * pg_cron schedules everything when available (Supabase: yes). The email
--     outbox is an Edge Function, dispatched via pg_net with the project URL
--     and service key stored in Supabase Vault (see README).
--   * Outbox rows are claimed atomically so overlapping deliveries can't send
--     the same message twice.

-- ===========================================================================
-- Org time zone (Settings → Time zone; Vietnam by default)
-- ===========================================================================
create or replace function fp_org_timezone(p_org uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select tz from (select nullif(btrim(settings->>'timezone'), '') as tz from fp_organizations where id = p_org) o
      where exists (select 1 from pg_timezone_names where name = o.tz)),
    'Asia/Ho_Chi_Minh');
$$;

-- ===========================================================================
-- One work order per schedule occurrence
-- ===========================================================================
do $$
begin
  if exists (select 1 from fp_work_orders where pm_schedule_id is not null
             group by pm_schedule_id, due_at having count(*) > 1) then
    raise warning 'Some PM schedules already generated duplicate work orders for the same due date, so the one-per-occurrence index was not created. Find them with: select pm_schedule_id, due_at, array_agg(id) from fp_work_orders where pm_schedule_id is not null group by 1, 2 having count(*) > 1;  Then run: create unique index fp_work_orders_pm_occurrence_uk on fp_work_orders (pm_schedule_id, due_at) where pm_schedule_id is not null;';
  else
    create unique index if not exists fp_work_orders_pm_occurrence_uk
      on fp_work_orders (pm_schedule_id, due_at) where pm_schedule_id is not null;
  end if;
end $$;

-- ===========================================================================
-- Meter schedules start from the meter's current reading
-- ===========================================================================
create or replace function fp_pm_meter_latest(p_meter uuid)
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  -- Readings stamped in the future (bad device clock) must not win.
  select value from fp_meter_readings
  where meter_id = p_meter and read_at <= now() + interval '5 minutes'
  order by read_at desc
  limit 1;
$$;

create or replace function fp_pm_schedule_baseline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.trigger_type = 'meter' and new.meter_id is not null
     and (tg_op = 'INSERT' or new.meter_id is distinct from old.meter_id
          or new.trigger_type is distinct from old.trigger_type) then
    new.last_meter_value := fp_pm_meter_latest(new.meter_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_pm_schedule_baseline on fp_pm_schedules;
create trigger trg_fp_pm_schedule_baseline
  before insert or update of meter_id, trigger_type on fp_pm_schedules
  for each row execute function fp_pm_schedule_baseline();

-- ===========================================================================
-- Retiring / disposing an asset pauses its PM schedules
-- ===========================================================================
create or replace function fp_asset_retired()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('retired', 'disposed') and old.status is distinct from new.status then
    update fp_pm_schedules set active = false where asset_id = new.id and active;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_asset_retired on fp_assets;
create trigger trg_fp_asset_retired
  after update of status on fp_assets
  for each row execute function fp_asset_retired();

-- ===========================================================================
-- PM generator
-- ===========================================================================
create or replace function fp_generate_due_pm(p_org uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  n        int := 0;
  v        numeric;
  tz       text;
  lead_iv  interval;
  step     interval;
  v_due    timestamptz;
  v_next   timestamptz;
  skipped  int;
  inserted int;
  v_loc    uuid;
  v_note   text;
begin
  perform fp_assert_scheduler_or_manager(p_org);

  for r in
    select * from fp_pm_schedules
    where active and (p_org is null or org_id = p_org)
    for update skip locked
  loop
    -- Nothing is generated for equipment that's out of service.
    if r.asset_id is not null and exists (
      select 1 from fp_assets where id = r.asset_id and status in ('retired', 'disposed', 'inactive')
    ) then
      continue;
    end if;

    select location_id into v_loc from fp_assets where id = r.asset_id;
    v_note := null;

    if r.trigger_type = 'calendar' then
      if r.next_due_at is null then
        continue;
      end if;
      lead_iv := make_interval(days => coalesce(r.lead_time_days, 0));
      if r.next_due_at - lead_iv > now() then
        continue;
      end if;

      -- Step in the org's local calendar so "every 30 days at 09:00" stays at
      -- 09:00 local time across DST changes.
      tz := fp_org_timezone(r.org_id);
      step := make_interval(days => r.interval_days);
      v_due := r.next_due_at;
      skipped := 0;
      loop
        v_next := ((v_due at time zone tz) + step) at time zone tz;
        exit when v_next - lead_iv > now();
        -- The following occurrence is already due too: this one was missed.
        v_due := v_next;
        skipped := skipped + 1;
      end loop;
      if skipped > 0 then
        v_note := format('%s earlier occurrence(s) of this schedule were missed and skipped.', skipped);
      end if;

      insert into fp_work_orders
        (org_id, asset_id, location_id, title, instructions, priority, status, assigned_to, due_at,
         pm_schedule_id, checklist_template_id)
      values
        (r.org_id, r.asset_id, v_loc,
         coalesce(r.name_i18n->>'en', r.name_i18n->>'vi', 'Preventive maintenance'),
         v_note, r.priority, 'assigned', r.assigned_to, v_due,
         r.id, r.checklist_template_id)
      on conflict do nothing;
      get diagnostics inserted = row_count;

      update fp_pm_schedules
        set last_run_at = now(), next_due_at = v_next
        where id = r.id;
      n := n + inserted;

    elsif r.trigger_type = 'meter' and r.meter_id is not null and r.meter_threshold is not null then
      v := fp_pm_meter_latest(r.meter_id);
      if v is null then
        continue;
      end if;
      if r.last_meter_value is null or v < r.last_meter_value then
        -- First reading, or the meter was reset/replaced: start counting here.
        update fp_pm_schedules set last_meter_value = v where id = r.id;
        continue;
      end if;
      if v - r.last_meter_value < r.meter_threshold then
        continue;
      end if;

      insert into fp_work_orders
        (org_id, asset_id, location_id, title, priority, status, assigned_to, due_at,
         pm_schedule_id, checklist_template_id)
      values
        (r.org_id, r.asset_id, v_loc,
         coalesce(r.name_i18n->>'en', r.name_i18n->>'vi', 'Preventive maintenance'),
         r.priority, 'assigned', r.assigned_to, now(),
         r.id, r.checklist_template_id)
      on conflict do nothing;
      get diagnostics inserted = row_count;

      update fp_pm_schedules
        set last_run_at = now(), last_meter_value = v
        where id = r.id;
      n := n + inserted;
    end if;
  end loop;

  return n;
end;
$$;

-- ===========================================================================
-- Job runs + health
-- ===========================================================================
create table if not exists fp_jobs (
  job             text primary key,
  description     text not null,
  max_silence     interval not null,       -- alert when no successful run for this long
  last_alerted_at timestamptz
);

insert into fp_jobs (job, description, max_silence) values
  ('generate_due_pm',     'Generate due preventive-maintenance work orders', interval '2 hours'),
  ('escalate_overdue',    'Flag overdue work orders and notify managers',    interval '1 hour'),
  ('expiry_reminders',    'Contract / license expiry reminders',             interval '26 hours'),
  ('scheduled_workflows', 'Time-based workflow triggers',                    interval '1 hour'),
  ('process_outbox',      'Deliver queued email / SMS / push',               interval '30 minutes'),
  ('check_job_health',    'Alert platform admins about late or failing jobs', interval '2 hours')
on conflict (job) do update set description = excluded.description, max_silence = excluded.max_silence;

create table if not exists fp_job_runs (
  id          bigint generated always as identity primary key,
  job         text not null references fp_jobs(job) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  processed   int,
  error       text
);
create index if not exists fp_job_runs_job_idx on fp_job_runs (job, started_at desc);

alter table fp_jobs     enable row level security;
alter table fp_job_runs enable row level security;
drop policy if exists jobs_platform_select on fp_jobs;
create policy jobs_platform_select on fp_jobs for select to authenticated using (fp_is_platform_admin());
drop policy if exists job_runs_platform_select on fp_job_runs;
create policy job_runs_platform_select on fp_job_runs for select to authenticated using (fp_is_platform_admin());

-- Record a run from outside the database (Edge Functions, service role).
create or replace function fp_record_job_run(p_job text, p_ok boolean, p_processed int default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_assert_scheduler_or_manager(null);
  insert into fp_job_runs (job, started_at, finished_at, ok, processed, error)
  values (p_job, now(), now(), p_ok, p_processed, left(p_error, 2000));
end;
$$;

-- Late or failing jobs: emails every platform admin, at most every 6 hours
-- per job. Returns how many jobs are unhealthy.
create or replace function fp_check_job_health()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  j        record;
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

  return bad;
end;
$$;

-- Run a named job and record the outcome. A failing job is rolled back and
-- recorded, never left half-done.
create or replace function fp_run_job(p_job text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_n  int;
begin
  perform fp_assert_scheduler_or_manager(null);
  if not exists (select 1 from fp_jobs where job = p_job) then
    raise exception 'Unknown job %', p_job;
  end if;

  insert into fp_job_runs (job) values (p_job) returning id into v_id;
  begin
    v_n := case p_job
      when 'generate_due_pm'     then fp_generate_due_pm(null)
      when 'escalate_overdue'    then fp_escalate_overdue(null)
      when 'expiry_reminders'    then fp_send_expiry_reminders(null)
      when 'scheduled_workflows' then fp_run_scheduled_workflows()
      when 'check_job_health'    then fp_check_job_health()
      else null
    end;
    if v_n is null then
      raise exception 'Job % cannot run inside the database', p_job;
    end if;
    update fp_job_runs set finished_at = now(), ok = true, processed = v_n where id = v_id;
  exception when others then
    update fp_job_runs set finished_at = now(), ok = false, error = left(sqlerrm, 2000) where id = v_id;
  end;
  return v_n;
end;
$$;

-- Platform admins: one row per job for the health panel.
create or replace function fp_job_health()
returns table (
  job text, description text, max_silence_minutes int,
  last_run_at timestamptz, last_ok_at timestamptz, last_ok boolean, last_error text, healthy boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not fp_is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select f.job, f.description, (extract(epoch from f.max_silence) / 60)::int,
           lr.started_at, lo.finished_at, lr.ok, lr.error,
           coalesce(lr.ok, false) and lo.finished_at >= now() - f.max_silence
    from fp_jobs f
    left join lateral (select r.started_at, r.ok, r.error from fp_job_runs r
                       where r.job = f.job order by r.started_at desc limit 1) lr on true
    left join lateral (select max(r.finished_at) as finished_at from fp_job_runs r
                       where r.job = f.job and r.ok) lo on true
    order by f.job;
end;
$$;

-- Keep job history bounded (runs every few minutes, forever otherwise).
create or replace function fp_prune_job_runs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from fp_job_runs where started_at < now() - interval '30 days';
$$;

-- ===========================================================================
-- Outbox: claim rows atomically (no double delivery from overlapping runs)
-- ===========================================================================
alter table fp_notification_outbox drop constraint if exists fp_notification_outbox_status_check;
alter table fp_notification_outbox add constraint fp_notification_outbox_status_check
  check (status in ('pending', 'sending', 'sent', 'failed'));
alter table fp_notification_outbox add column if not exists claimed_at timestamptz;
alter table fp_notification_outbox add column if not exists attempts int not null default 0;

-- Hands out up to p_limit pending rows to exactly one caller. Rows stuck in
-- 'sending' for 15 minutes (the sender crashed) are handed out again, and a
-- row is abandoned after 5 attempts.
create or replace function fp_claim_outbox(p_limit int default 50)
returns setof fp_notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_assert_scheduler_or_manager(null);

  update fp_notification_outbox
    set status = 'failed', error = coalesce(error, 'gave up after 5 attempts')
    where status = 'sending' and claimed_at < now() - interval '15 minutes' and attempts >= 5;

  return query
    update fp_notification_outbox o
      set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
      where o.id in (
        select id from fp_notification_outbox
        where status = 'pending'
           or (status = 'sending' and claimed_at < now() - interval '15 minutes')
        order by created_at
        limit greatest(1, least(p_limit, 500))
        for update skip locked
      )
      returning o.*;
end;
$$;

-- ===========================================================================
-- Edge Function dispatch (pg_net + Vault)
-- ===========================================================================
-- Needs two Vault secrets (Dashboard → Project Settings → Vault, or SQL):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role key>', 'service_role_key');
create or replace function fp_dispatch_edge_function(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  perform fp_assert_scheduler_or_manager(null);
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

-- A dispatch that can't even start (no Vault secrets, no pg_net) is recorded
-- as a failed run of that job, so the health check reports it.
create or replace function fp_dispatch_job(p_job text, p_function text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_dispatch_edge_function(p_function);
exception when others then
  insert into fp_job_runs (job, finished_at, ok, error) values (p_job, now(), false, left(sqlerrm, 2000));
end;
$$;

-- ===========================================================================
-- Schedules (pg_cron). Times are UTC; 00:00 UTC = 07:00 in Vietnam.
-- ===========================================================================
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise warning 'pg_cron is not available (%). Scheduled jobs were NOT created — enable pg_cron (Supabase: Database → Extensions) and re-run this block from 0061_pm_scheduling_and_jobs.sql.', sqlerrm;
    return;
  end;

  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    raise warning 'pg_net is not available (%): the email/SMS/push outbox will not be sent automatically until it is enabled.', sqlerrm;
  end;

  perform cron.schedule('fp-generate-due-pm',     '5 * * * *',    $job$select fp_run_job('generate_due_pm')$job$);
  perform cron.schedule('fp-escalate-overdue',    '*/15 * * * *', $job$select fp_run_job('escalate_overdue')$job$);
  perform cron.schedule('fp-expiry-reminders',    '0 0 * * *',    $job$select fp_run_job('expiry_reminders')$job$);
  perform cron.schedule('fp-scheduled-workflows', '*/15 * * * *', $job$select fp_run_job('scheduled_workflows')$job$);
  perform cron.schedule('fp-process-outbox',      '*/5 * * * *',  $job$select fp_dispatch_job('process_outbox', 'process-outbox')$job$);
  perform cron.schedule('fp-check-job-health',    '20 * * * *',   $job$select fp_run_job('check_job_health')$job$);
  perform cron.schedule('fp-prune-job-runs',      '30 3 * * *',   $job$select fp_prune_job_runs()$job$);
end $$;

-- ===========================================================================
-- Grants (0059 made EXECUTE an allow-list; service_role gets fp_* by default)
-- ===========================================================================
revoke execute on function fp_org_timezone(uuid), fp_pm_meter_latest(uuid), fp_record_job_run(text, boolean, int, text),
  fp_check_job_health(), fp_run_job(text), fp_prune_job_runs(), fp_claim_outbox(int),
  fp_dispatch_edge_function(text), fp_dispatch_job(text, text)
  from public, anon, authenticated;
grant execute on function fp_record_job_run(text, boolean, int, text), fp_claim_outbox(int), fp_run_job(text)
  to service_role;
grant execute on function fp_job_health() to authenticated;
