-- PM scheduling + background jobs suite (0061). Every check states the
-- intended behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test'),
  ('00000000-0000-0000-0000-0000000000f0', 'ops@platform.test');
\set admin  '00000000-0000-0000-0000-00000000000a'
\set adminB '00000000-0000-0000-0000-00000000000b'
\set ops    '00000000-0000-0000-0000-0000000000f0'
insert into fp_platform_admins (user_id) values (:'ops');

select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org VN')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org UK')$q$);
select id as "org"  from fp_organizations where name = 'Org VN' \gset
select id as "orgB" from fp_organizations where name = 'Org UK' \gset
update fp_organizations set settings = '{"timezone":"Europe/London"}' where id = :'orgB';

insert into fp_locations (id, org_id, name_i18n, kind) values
  ('80000000-0000-0000-0000-000000000001', :'org', '{"en":"Plant room"}', 'room');
insert into fp_assets (id, org_id, name_i18n, location_id) values
  ('20000000-0000-0000-0000-000000000001', :'org', '{"en":"Chiller"}', '80000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', :'org', '{"en":"Old pump"}', null),
  ('20000000-0000-0000-0000-000000000003', :'org', '{"en":"Spare fan"}', null);
insert into fp_meters (id, org_id, asset_id, name_i18n) values
  ('50000000-0000-0000-0000-000000000001', :'org', '20000000-0000-0000-0000-000000000001', '{"en":"Run hours"}');

create function t.pm_wos(p_name text) returns bigint language sql as
  $$ select count(*) from fp_work_orders w join fp_pm_schedules s on s.id = w.pm_schedule_id where s.name_i18n->>'en' = p_name $$;
create function t.gen() returns text language sql as
  $$ select t.run('service_role', null, 'select fp_generate_due_pm()') $$;

-- Schedules. "Weekly" was due 3 days ago; "Missed" 30 days ago (4 cycles
-- missed); "Lead" is due in 2 days with 3 days' lead time.
insert into fp_pm_schedules (id, org_id, asset_id, name_i18n, interval_days, next_due_at, lead_time_days) values
  ('70000000-0000-0000-0000-000000000001', :'org', '20000000-0000-0000-0000-000000000001', '{"en":"Weekly"}', 7, date_trunc('minute', now()) - interval '3 days', 0),
  ('70000000-0000-0000-0000-000000000002', :'org', null, '{"en":"Missed"}', 7, date_trunc('minute', now()) - interval '30 days', 0),
  ('70000000-0000-0000-0000-000000000003', :'org', null, '{"en":"Lead"}',   7, date_trunc('minute', now()) + interval '2 days', 3),
  ('70000000-0000-0000-0000-000000000004', :'org', '20000000-0000-0000-0000-000000000002', '{"en":"Retired asset"}', 7, now() - interval '1 day', 0),
  ('70000000-0000-0000-0000-000000000005', :'org', '20000000-0000-0000-0000-000000000003', '{"en":"Inactive asset"}', 7, now() - interval '1 day', 0);
select next_due_at as "weekly_due" from fp_pm_schedules where id = '70000000-0000-0000-0000-000000000001' \gset
select next_due_at as "missed_due" from fp_pm_schedules where id = '70000000-0000-0000-0000-000000000002' \gset

-- ===========================================================================
-- Retired / inactive assets
-- ===========================================================================
select t.run('authenticated', :'admin', $q$update fp_assets set status = 'retired' where id = '20000000-0000-0000-0000-000000000002'$q$);
select t.check('retiring an asset pauses its PM schedules',
  (select not active from fp_pm_schedules where id = '70000000-0000-0000-0000-000000000004'));
update fp_assets set status = 'inactive' where id = '20000000-0000-0000-0000-000000000003';

select t.gen() as r \gset
select t.check('generator runs as the scheduler', :'r' like 'ok:%');

select t.check('no work order for a schedule whose asset is inactive',
  t.pm_wos('Inactive asset') = 0
  and (select active from fp_pm_schedules where id = '70000000-0000-0000-0000-000000000005'));
select t.check('no work order for a retired asset''s (paused) schedule', t.pm_wos('Retired asset') = 0);

-- ===========================================================================
-- Calendar anchoring, missed cycles, lead time
-- ===========================================================================
select t.check('due schedule generates one work order at its due date',
  t.pm_wos('Weekly') = 1
  and (select due_at from fp_work_orders where pm_schedule_id = '70000000-0000-0000-0000-000000000001') = :'weekly_due'::timestamptz);
select t.check('next due date = previous due + interval (no drift from run time)',
  (select next_due_at from fp_pm_schedules where id = '70000000-0000-0000-0000-000000000001')
    = :'weekly_due'::timestamptz + interval '7 days');
select t.check('generated work order takes the asset''s location',
  (select location_id from fp_work_orders where pm_schedule_id = '70000000-0000-0000-0000-000000000001')
    = '80000000-0000-0000-0000-000000000001');

select t.check('missed cycles: one work order for the latest occurrence, noting the skipped ones',
  t.pm_wos('Missed') = 1
  and (select due_at = :'missed_due'::timestamptz + interval '28 days'
              and instructions like '4 earlier occurrence(s)%'
       from fp_work_orders where pm_schedule_id = '70000000-0000-0000-0000-000000000002'));
select t.check('missed cycles: next due date stays on the schedule''s anchor',
  (select next_due_at from fp_pm_schedules where id = '70000000-0000-0000-0000-000000000002')
    = :'missed_due'::timestamptz + interval '35 days');

select t.check('lead time: generated early, due date unchanged',
  t.pm_wos('Lead') = 1
  and (select due_at > now() from fp_work_orders w join fp_pm_schedules s on s.id = w.pm_schedule_id where s.name_i18n->>'en' = 'Lead'));

-- ===========================================================================
-- Duplicates (retries, overlapping runs)
-- ===========================================================================
select t.gen();
select t.check('running again creates nothing new', t.pm_wos('Weekly') = 1 and t.pm_wos('Missed') = 1);

-- Simulate an overlapping run that saw the schedule before it advanced.
update fp_pm_schedules set next_due_at = :'weekly_due' where id = '70000000-0000-0000-0000-000000000001';
select t.gen();
select t.check('an overlapping run cannot duplicate the same occurrence', t.pm_wos('Weekly') = 1);
select t.check('a second work order for the same occurrence is rejected',
  t.run('authenticated', :'admin', format(
    $q$insert into fp_work_orders (org_id, title, pm_schedule_id, due_at) values (%L, 'dup', '70000000-0000-0000-0000-000000000001', %L)$q$,
    :'org', :'weekly_due')) like 'err:%');

-- ===========================================================================
-- Time zone: 09:00 stays 09:00 local time across DST
-- ===========================================================================
insert into fp_pm_schedules (id, org_id, name_i18n, interval_days, next_due_at) values
  ('70000000-0000-0000-0000-0000000000b1', :'orgB', '{"en":"UK weekly"}', 7, '2025-01-08 09:00 Europe/London'),
  ('70000000-0000-0000-0000-0000000000a1', :'org',  '{"en":"VN weekly"}', 7, '2025-01-08 09:00 Asia/Ho_Chi_Minh');
select t.gen();
select t.check('UK org: next due still 09:00 London time after crossing DST',
  (select extract(hour from next_due_at at time zone 'Europe/London') = 9
          and extract(minute from next_due_at at time zone 'Europe/London') = 0
   from fp_pm_schedules where id = '70000000-0000-0000-0000-0000000000b1'));
select t.check('VN org (default time zone): next due still 09:00 Vietnam time',
  (select extract(hour from next_due_at at time zone 'Asia/Ho_Chi_Minh') = 9
   from fp_pm_schedules where id = '70000000-0000-0000-0000-0000000000a1'));

-- ===========================================================================
-- Meter schedules
-- ===========================================================================
insert into fp_meter_readings (org_id, meter_id, value, read_at) values
  (:'org', '50000000-0000-0000-0000-000000000001', 10000, now() - interval '1 hour');
insert into fp_pm_schedules (id, org_id, asset_id, name_i18n, trigger_type, meter_id, meter_threshold) values
  ('70000000-0000-0000-0000-000000000006', :'org', '20000000-0000-0000-0000-000000000001', '{"en":"Every 500h"}', 'meter',
   '50000000-0000-0000-0000-000000000001', 500);
select t.check('new meter schedule starts from the current reading',
  (select last_meter_value from fp_pm_schedules where id = '70000000-0000-0000-0000-000000000006') = 10000);
select t.gen();
select t.check('no instant work order on a meter already at 10,000', t.pm_wos('Every 500h') = 0);

insert into fp_meter_readings (org_id, meter_id, value, read_at) values (:'org', '50000000-0000-0000-0000-000000000001', 10400, now() - interval '50 minutes');
select t.gen();
select t.check('below threshold: nothing yet', t.pm_wos('Every 500h') = 0);
insert into fp_meter_readings (org_id, meter_id, value, read_at) values (:'org', '50000000-0000-0000-0000-000000000001', 10500, now() - interval '40 minutes');
select t.gen();
select t.check('threshold reached: one work order', t.pm_wos('Every 500h') = 1);

insert into fp_meter_readings (org_id, meter_id, value, read_at) values (:'org', '50000000-0000-0000-0000-000000000001', 50, now() - interval '30 minutes');
select t.gen();
select t.check('meter reset: treated as a new baseline, no work order',
  t.pm_wos('Every 500h') = 1
  and (select last_meter_value from fp_pm_schedules where id = '70000000-0000-0000-0000-000000000006') = 50);
insert into fp_meter_readings (org_id, meter_id, value, read_at) values (:'org', '50000000-0000-0000-0000-000000000001', 560, now() - interval '20 minutes');
select t.gen();
select t.check('500 units after the reset: next work order', t.pm_wos('Every 500h') = 2);

insert into fp_meter_readings (org_id, meter_id, value, read_at) values (:'org', '50000000-0000-0000-0000-000000000001', 99999, now() + interval '1 day');
select t.gen();
select t.check('a reading stamped in the future is ignored', t.pm_wos('Every 500h') = 2);

-- ===========================================================================
-- Jobs: runner, recording, health alerts
-- ===========================================================================
select t.check('anon cannot run jobs', t.run('anon', null, $q$select fp_run_job('generate_due_pm')$q$) like 'err:%');
select t.check('an org admin cannot run jobs across all orgs',
  t.run('authenticated', :'admin', $q$select fp_run_job('generate_due_pm')$q$) like 'err:%');

select t.run('service_role', null, $q$select fp_run_job('generate_due_pm')$q$) as r \gset
select t.check('scheduler runs a job and it is recorded as successful',
  :'r' like 'ok:%'
  and exists (select 1 from fp_job_runs where job = 'generate_due_pm' and ok and finished_at is not null));

select t.run('service_role', null, $q$select fp_run_job('expiry_reminders')$q$);
select t.run('service_role', null, $q$select fp_run_job('escalate_overdue')$q$);
select t.run('service_role', null, $q$select fp_run_job('scheduled_workflows')$q$);
select t.check('every in-database job runs cleanly through the runner',
  (select count(distinct job) from fp_job_runs where ok) = 4
  and not exists (select 1 from fp_job_runs where not ok));

select t.run('service_role', null, $q$select fp_record_job_run('process_outbox', false, 0, 'Resend 401: bad key')$q$);
select t.run('service_role', null, $q$select fp_run_job('check_job_health')$q$) as r \gset
select t.check('health check emails platform admins about a failing job',
  :'r' like 'ok:%'
  and exists (select 1 from fp_notification_outbox
              where to_address = 'ops@platform.test' and subject like '%process_outbox%' and body like '%Resend 401%'));
select t.run('service_role', null, $q$select fp_run_job('check_job_health')$q$);
select t.check('health alerts are not repeated every run',
  (select count(*) from fp_notification_outbox where to_address = 'ops@platform.test' and subject like '%process_outbox%') = 1);

select t.check('platform admin sees job health',
  t.run('authenticated', :'ops', $q$select * from fp_job_health()$q$) = 'ok:6');
select t.check('org admin cannot see job health',
  t.run('authenticated', :'admin', $q$select * from fp_job_health()$q$) like 'err:%');

-- ===========================================================================
-- Outbox claiming
-- ===========================================================================
update fp_notification_outbox set status = 'sent';
insert into fp_notification_outbox (channel, to_address, subject)
  select 'email', 'x' || g || '@a.test', 'm' || g from generate_series(1, 3) g;
select t.check('outbox claims hand each message to exactly one sender',
  t.run('service_role', null, $q$select * from fp_claim_outbox(2)$q$) = 'ok:2'
  and t.run('service_role', null, $q$select * from fp_claim_outbox(2)$q$) = 'ok:1'
  and t.run('service_role', null, $q$select * from fp_claim_outbox(2)$q$) = 'ok:0');
update fp_notification_outbox set claimed_at = now() - interval '20 minutes' where to_address = 'x1@a.test';
select t.check('a message stuck in sending (crashed sender) is handed out again',
  t.run('service_role', null, $q$select * from fp_claim_outbox(10)$q$) = 'ok:1');
select t.check('clients cannot claim outbox rows',
  t.run('authenticated', :'admin', $q$select * from fp_claim_outbox(10)$q$) like 'err:%'
  and t.run('anon', null, $q$select * from fp_claim_outbox(10)$q$) like 'err:%');

\ir _report.sql
