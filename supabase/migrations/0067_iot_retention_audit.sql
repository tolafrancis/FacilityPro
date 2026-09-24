-- 0067_iot_retention_audit.sql
-- Audit findings S1-H7 (IoT), S6-H2 (unbounded telemetry/audit growth),
-- S2-M3 (secrets in the audit log) and S3-M4 (audit coverage).
-- Covered by supabase/security-tests/iot_retention_audit.sql.
--
--   * Duplicate readings (same device, metric, timestamp) are stored once,
--     even when two deliveries race: unique index + ON CONFLICT.
--   * Offline detection: a device with offline_after_minutes set raises one
--     notification to admins/managers when it goes quiet that long, and
--     re-arms when it reports again. Checked every 15 minutes.
--   * Telemetry retention: raw readings older than the org's
--     settings.telemetry_retention_days (default 90) are rolled up into
--     fp_telemetry_hourly (count/min/max/avg per device, metric and hour,
--     kept indefinitely), then deleted. Daily.
--   * Audit log: no longer stores device keys, broker passwords or invite
--     tokens (existing entries are scrubbed); skips the heartbeat-only
--     updates (last_seen_at, last_fired_at…) that wrote one row per reading;
--     entries older than settings.audit_retention_days (default 730) are
--     deleted daily. Work-order parts and media are now audited.
--   * fp_run_job dispatches through fp_jobs.run_sql, so adding a job no
--     longer means redefining fp_run_job.

-- ===========================================================================
-- Duplicate readings
-- ===========================================================================
do $$
declare n bigint;
begin
  delete from fp_telemetry t
    using fp_telemetry d
    where d.device_id = t.device_id and d.metric = t.metric and d.ts = t.ts
      and (d.created_at, d.id) < (t.created_at, t.id);
  get diagnostics n = row_count;
  if n > 0 then
    raise warning '0067: removed % duplicate telemetry reading(s) (same device, metric and timestamp).', n;
  end if;
end $$;
create unique index if not exists fp_telemetry_reading_uk on fp_telemetry (device_id, metric, ts);
drop index if exists fp_telemetry_device_idx;  -- covered by the unique index

-- ===========================================================================
-- Offline detection
-- ===========================================================================
alter table fp_devices
  add column if not exists offline_after_minutes int check (offline_after_minutes between 5 and 10080),
  add column if not exists offline_alerted_at   timestamptz;

create or replace function fp_device_ingest(
  p_key    text,
  p_metric text,
  p_value  numeric default null,
  p_unit   text default null,
  p_ts     timestamptz default now(),
  p_meta   jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  dev record;
  tele_id uuid;
  target_meter uuid;
  r record;
  crossed boolean;
  u record;
  msg text;
  sym text;
  v_ts timestamptz;
  v_fired int;
begin
  select id, org_id, asset_id, name, meter_id, metric_map, active, last_seen_at, offline_alerted_at
    into dev
    from fp_devices
    where device_key = p_key;

  if dev.id is null or not dev.active then
    raise exception 'Invalid or inactive device key';
  end if;

  if p_metric is null or btrim(p_metric) = '' or length(p_metric) > 64
     or length(coalesce(p_unit, '')) > 16
     or (p_meta is not null and length(p_meta::text) > 4096) then
    raise exception 'reading_invalid' using errcode = 'P0001',
      detail = 'metric is required (max 64 chars); unit max 16 chars; meta max 4 KB.';
  end if;

  -- A device clock in the future must not produce "latest" readings.
  v_ts := least(coalesce(p_ts, now()), now());

  if (select count(*) from fp_telemetry
      where device_id = dev.id and created_at > now() - interval '1 minute') >= 600 then
    raise exception 'rate_limited' using errcode = 'P0001',
      detail = 'Device is sending more than 600 readings a minute.';
  end if;

  -- The same reading delivered twice (MQTT QoS 1 redelivery, retries, or
  -- two deliveries racing) is stored, and acted on, once (0067).
  insert into fp_telemetry (org_id, device_id, metric, value, unit, ts, meta)
  values (dev.org_id, dev.id, p_metric, p_value, p_unit, v_ts, p_meta)
  on conflict (device_id, metric, ts) do nothing
  returning id into tele_id;
  if tele_id is null then
    select id into tele_id from fp_telemetry
      where device_id = dev.id and metric = p_metric and ts = v_ts;
    return tele_id;
  end if;

  if dev.last_seen_at is null or dev.last_seen_at < now() - interval '1 minute' then
    update fp_devices set last_seen_at = now() where id = dev.id;
  end if;
  -- Back online after an offline alert (0067).
  if dev.offline_alerted_at is not null then
    update fp_devices set offline_alerted_at = null where id = dev.id;
  end if;

  -- Fire sensor_integration workflows (condition fields: sensor_score / metric).
  if p_value is not null then
    perform fp_run_workflows(dev.org_id, 'sensor_integration', dev.id::text,
      jsonb_build_object('sensor_score', p_value, 'metric', p_metric, 'device', dev.id));
  end if;

  -- Mirror into a meter when this metric (or the device default) maps to one.
  if p_value is not null then
    target_meter := nullif(dev.metric_map ->> p_metric, '')::uuid;
    if target_meter is null then
      target_meter := dev.meter_id;
    end if;
    if target_meter is not null then
      insert into fp_meter_readings (org_id, meter_id, value, read_at)
      values (dev.org_id, target_meter, p_value, v_ts);
    end if;
  end if;

  -- Evaluate threshold rules.
  if p_value is not null then
    for r in
      select * from fp_device_rules
      where device_id = dev.id and active
        and (metric is null or metric = p_metric)
    loop
      crossed := case r.op
        when 'gt'  then p_value >  r.threshold
        when 'gte' then p_value >= r.threshold
        when 'lt'  then p_value <  r.threshold
        when 'lte' then p_value <= r.threshold
        when 'eq'  then p_value =  r.threshold
        else false end;
      continue when not crossed;

      -- Claim the firing atomically: of several concurrent readings, exactly
      -- one gets past the cooldown.
      update fp_device_rules set last_fired_at = now()
        where id = r.id
          and (last_fired_at is null
               or now() - last_fired_at > make_interval(mins => cooldown_minutes));
      get diagnostics v_fired = row_count;
      continue when v_fired = 0;

      sym := case r.op when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<'
                       when 'lte' then '<=' else '=' end;
      msg := coalesce(nullif(r.message, ''),
                      p_metric || ' ' || sym || ' ' || r.threshold);

      if r.action in ('work_order','both') then
        insert into fp_requests
          (org_id, title, body_original, source_lng, asset_id, severity, priority, channel, created_by)
        values
          (dev.org_id, dev.name || ': ' || msg,
           'Automatic alert from device ' || dev.name || ' — ' || p_metric || ' = ' || p_value
             || coalesce(' ' || p_unit, ''),
           'en', dev.asset_id, r.severity, r.severity, 'web', null);
      end if;

      if r.action in ('notify','both') then
        for u in
          select user_id from fp_users_orgs
          where org_id = dev.org_id and role in ('org_admin','manager')
        loop
          insert into fp_notifications (org_id, user_id, kind, title, body, link)
          values (dev.org_id, u.user_id, 'device_alert',
                  dev.name, msg, '/devices/' || dev.id);
        end loop;
      end if;
    end loop;
  end if;

  return tele_id;
end;
$$;

create or replace function fp_check_offline_devices()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  n int := 0;
begin
  perform fp_assert_scheduler_or_manager(null);
  for d in
    select id, org_id, name, last_seen_at, offline_after_minutes
    from fp_devices
    where active and offline_after_minutes is not null and offline_alerted_at is null
      and coalesce(last_seen_at, created_at) < now() - make_interval(mins => offline_after_minutes)
    for update skip locked
  loop
    insert into fp_notifications (org_id, user_id, kind, title, body, link)
    select d.org_id, uo.user_id, 'device_offline', d.name,
           case when d.last_seen_at is null then 'Device has never reported.'
                else 'No data since ' || to_char(d.last_seen_at at time zone fp_org_timezone(d.org_id), 'YYYY-MM-DD HH24:MI') || '.' end,
           '/devices/' || d.id
    from fp_users_orgs uo
    where uo.org_id = d.org_id and uo.role in ('org_admin', 'manager');
    update fp_devices set offline_alerted_at = now() where id = d.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ===========================================================================
-- Telemetry retention with hourly rollups
-- ===========================================================================
create table if not exists fp_telemetry_hourly (
  org_id    uuid not null references fp_organizations(id) on delete cascade,
  device_id uuid not null references fp_devices(id) on delete cascade,
  metric    text not null,
  hour      timestamptz not null,
  n         int not null,
  min_value numeric,
  max_value numeric,
  avg_value numeric,
  primary key (device_id, metric, hour)
);
create index if not exists fp_telemetry_hourly_org_idx on fp_telemetry_hourly (org_id, hour desc);
alter table fp_telemetry_hourly enable row level security;
drop policy if exists tele_hourly_select on fp_telemetry_hourly;
create policy tele_hourly_select on fp_telemetry_hourly for select to authenticated
  using ( fp_is_member(org_id) );

create or replace function fp_org_retention_days(p_org uuid, p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(7, coalesce((select nullif(settings ->> p_key, '')::int from fp_organizations where id = p_org), p_default));
$$;

-- Rolls up and deletes at most 100k expired readings per run, so a backlog
-- is worked off over several days without long locks.
create or replace function fp_prune_telemetry()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform fp_assert_scheduler_or_manager(null);

  with expired as materialized (
    select t.id, t.org_id, t.device_id, t.metric, t.ts, t.value
    from fp_telemetry t
    where t.ts < now() - make_interval(days => fp_org_retention_days(t.org_id, 'telemetry_retention_days', 90))
    limit 100000
  ), rolled as (
    insert into fp_telemetry_hourly as h (org_id, device_id, metric, hour, n, min_value, max_value, avg_value)
      select org_id, device_id, metric, date_trunc('hour', ts), count(*), min(value), max(value), avg(value)
      from expired
      group by 1, 2, 3, 4
    on conflict (device_id, metric, hour) do update set
      avg_value = case when h.avg_value is null then excluded.avg_value
                       when excluded.avg_value is null then h.avg_value
                       else (h.avg_value * h.n + excluded.avg_value * excluded.n) / (h.n + excluded.n) end,
      n         = h.n + excluded.n,
      min_value = least(h.min_value, excluded.min_value),
      max_value = greatest(h.max_value, excluded.max_value)
    returning 1
  ), deleted as (
    delete from fp_telemetry where id in (select id from expired) returning 1
  )
  select count(*) into n from deleted;
  return n;
end;
$$;

-- ===========================================================================
-- Audit log: no secrets, no heartbeat noise, bounded, better coverage
-- ===========================================================================
create or replace function fp_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  jsonb;
  v_org  uuid;
  v_id   uuid;
  -- Bookkeeping columns: an update touching only these isn't worth a row.
  v_noise constant text[] := array['updated_at', 'last_seen_at', 'offline_alerted_at', 'last_fired_at', 'last_run_at', 'run_count'];
  -- Never copied into the log (readable by managers).
  v_secret constant text[] := array['device_key', 'password', 'token', 'secret'];
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - v_noise) = (to_jsonb(old) - v_noise) then
    return new;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org := (v_row ->> 'org_id')::uuid;
  v_id  := (v_row ->> 'id')::uuid;
  -- Tables without an org_id column (fp_organizations) log their own id.
  if v_org is null and tg_table_name = 'fp_organizations' then
    v_org := v_id;
  end if;

  insert into fp_audit_log (org_id, actor, entity_type, entity_id, action, diff)
  values (v_org, auth.uid(), tg_table_name, v_id, tg_op, v_row - v_secret);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Scrub what earlier versions logged.
update fp_audit_log set diff = diff - array['device_key', 'password', 'token', 'secret']
  where diff ?| array['device_key', 'password', 'token', 'secret'];

drop trigger if exists trg_audit_wo_parts on fp_wo_parts;
create trigger trg_audit_wo_parts after insert or update or delete
  on fp_wo_parts for each row execute function fp_audit();
drop trigger if exists trg_audit_media on fp_media;
create trigger trg_audit_media after insert or update or delete
  on fp_media for each row execute function fp_audit();

create or replace function fp_prune_audit_log()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform fp_assert_scheduler_or_manager(null);
  delete from fp_audit_log a
    where a.id in (
      select id from fp_audit_log l
      where l.at < now() - make_interval(days => fp_org_retention_days(l.org_id, 'audit_retention_days', 730))
      limit 100000);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ===========================================================================
-- Jobs: table-driven dispatch
-- ===========================================================================
alter table fp_jobs add column if not exists run_sql text;
update fp_jobs set run_sql = case job
  when 'generate_due_pm'     then 'select fp_generate_due_pm(null)'
  when 'escalate_overdue'    then 'select fp_escalate_overdue(null)'
  when 'expiry_reminders'    then 'select fp_send_expiry_reminders(null)'
  when 'scheduled_workflows' then 'select fp_run_scheduled_workflows()'
  when 'check_job_health'    then 'select fp_check_job_health()'
  else run_sql end;
insert into fp_jobs (job, description, max_silence, run_sql) values
  ('offline_devices',  'Alert when IoT devices stop reporting',          interval '1 hour',   'select fp_check_offline_devices()'),
  ('prune_telemetry',  'Roll up and delete expired IoT readings',        interval '26 hours', 'select fp_prune_telemetry()'),
  ('prune_audit_log',  'Delete audit entries past the retention period', interval '26 hours', 'select fp_prune_audit_log()')
on conflict (job) do update set description = excluded.description, max_silence = excluded.max_silence, run_sql = excluded.run_sql;

create or replace function fp_run_job(p_job text)
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
  perform fp_assert_scheduler_or_manager(null);
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

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fp-offline-devices', '*/15 * * * *', $job$select fp_run_job('offline_devices')$job$);
    perform cron.schedule('fp-prune-telemetry', '40 19 * * *',  $job$select fp_run_job('prune_telemetry')$job$);
    perform cron.schedule('fp-prune-audit-log', '50 19 * * *',  $job$select fp_run_job('prune_audit_log')$job$);
  else
    raise warning '0067: pg_cron is not enabled, so the offline-device and retention jobs were NOT scheduled. Enable pg_cron and re-run this block.';
  end if;
end $$;

-- ===========================================================================
-- Grants (0059 allow-list)
-- ===========================================================================
revoke execute on function fp_check_offline_devices(), fp_prune_telemetry(), fp_prune_audit_log(),
  fp_org_retention_days(uuid, text, int), fp_audit()
  from public, anon, authenticated;
grant execute on function fp_device_ingest(text, text, numeric, text, timestamptz, jsonb) to anon, authenticated, service_role;
