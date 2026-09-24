-- IoT, retention and audit suite (0067). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@a.test');
\set admin '00000000-0000-0000-0000-00000000000a'
\set tech  '00000000-0000-0000-0000-0000000000a1'
select t.run('authenticated', :'admin', $q$select fp_create_organization('Org A')$q$);
select id as "org" from fp_organizations where name = 'Org A' \gset
insert into fp_invites (org_id, email, role, token) values (:'org', 'tech@a.test', 'manager', '10000000-0000-0000-0000-000000000001');
select t.run('authenticated', :'tech', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);

select t.run('authenticated', :'admin', format(
  $q$insert into fp_devices (id, org_id, name, device_key) values ('d0000000-0000-0000-0000-000000000001', %L, 'Chiller 1', 'secret-key-1')$q$, :'org'));
select t.run('authenticated', :'admin', format(
  $q$insert into fp_device_rules (org_id, device_id, metric, op, threshold, action) values (%L, 'd0000000-0000-0000-0000-000000000001', 'temp', 'gt', 30, 'notify')$q$, :'org'));

-- ===========================================================================
-- Duplicate readings
-- ===========================================================================
select t.run('anon', null, $q$select fp_device_ingest('secret-key-1', 'temp', 35, 'C', '2026-01-01 10:00+00')$q$);
select t.run('anon', null, $q$select fp_device_ingest('secret-key-1', 'temp', 35, 'C', '2026-01-01 10:00+00')$q$) as r \gset
select t.check('a redelivered reading is accepted but stored once',
  :'r' = 'ok:1' and (select count(*) from fp_telemetry where ts = '2026-01-01 10:00+00') = 1);
select t.check('the database refuses a duplicate reading outright',
  t.run('service_role', null, format(
    $q$insert into fp_telemetry (org_id, device_id, metric, value, ts) values (%L, 'd0000000-0000-0000-0000-000000000001', 'temp', 1, '2026-01-01 10:00+00')$q$, :'org')) like 'err:%duplicate%');
select t.check('a redelivered alarm reading notifies once',
  (select count(*) from fp_notifications where kind = 'device_alert') = 2);  -- admin + manager

-- ===========================================================================
-- Audit log
-- ===========================================================================
select t.check('the audit log never stores the device key',
  not exists (select 1 from fp_audit_log where diff::text like '%secret-key-1%'));
select t.check('heartbeat updates (last_seen_at) are not audited',
  (select count(*) from fp_audit_log where entity_type = 'fp_devices') = 1);  -- only the insert
select t.run('authenticated', :'admin', $q$update fp_devices set name = 'Chiller 1A'$q$);
select t.check('real changes to a device are still audited',
  (select count(*) from fp_audit_log where entity_type = 'fp_devices' and action = 'UPDATE') = 1);
insert into fp_audit_log (org_id, entity_type, action, diff, at)
  values (:'org', 'fp_devices', 'UPDATE', '{"name":"old"}', now() - interval '3 years'),
         (:'org', 'fp_devices', 'UPDATE', '{"name":"recent"}', now() - interval '1 year');
select t.run('service_role', null, $q$select fp_run_job('prune_audit_log')$q$);
select t.check('audit entries older than the retention period (2 years) are deleted; newer ones kept',
  not exists (select 1 from fp_audit_log where diff->>'name' = 'old')
  and exists (select 1 from fp_audit_log where diff->>'name' = 'recent'));

-- ===========================================================================
-- Offline detection
-- ===========================================================================
update fp_devices set offline_after_minutes = 30, last_seen_at = now() - interval '2 hours';
select t.run('service_role', null, $q$select fp_run_job('offline_devices')$q$);
select t.run('service_role', null, $q$select fp_run_job('offline_devices')$q$);
select t.check('a quiet device raises one offline notification to admins and managers',
  (select count(*) from fp_notifications where kind = 'device_offline') = 2);
select t.run('anon', null, $q$select fp_device_ingest('secret-key-1', 'temp', 20)$q$);
select t.check('reporting again re-arms the offline alert',
  (select offline_alerted_at from fp_devices) is null);

-- ===========================================================================
-- Telemetry retention
-- ===========================================================================
insert into fp_telemetry (org_id, device_id, metric, value, ts)
  select :'org', 'd0000000-0000-0000-0000-000000000001', 'temp', g, '2025-01-01 08:00+00'::timestamptz + g * interval '1 minute'
  from generate_series(1, 10) g;
select t.run('service_role', null, $q$select fp_run_job('prune_telemetry')$q$) as r \gset
select t.check('readings past retention (90 days) are deleted',
  :'r' = 'ok:1'
  and not exists (select 1 from fp_telemetry where ts < now() - interval '90 days')
  and exists (select 1 from fp_telemetry where ts > now() - interval '1 day'));
select t.check('...and kept as hourly rollups (count/min/max/avg)',
  (select n = 10 and min_value = 1 and max_value = 10 and avg_value = 5.5
   from fp_telemetry_hourly where hour = '2025-01-01 08:00+00'));
select t.check('org members can read the hourly rollups',
  t.run('authenticated', :'tech', $q$select * from fp_telemetry_hourly$q$) <> 'ok:0'
  and t.run('authenticated', :'tech', $q$select * from fp_telemetry_hourly$q$) not like 'err:%');

select t.check('scheduled jobs cannot be run by members',
  t.run('authenticated', :'tech', $q$select fp_run_job('prune_telemetry')$q$) like 'err:%'
  and t.run('authenticated', :'tech', $q$select fp_prune_telemetry()$q$) like 'err:%');

\ir _report.sql
