-- Public endpoint limits suite (0063): QR fault reporting and device ingest.
-- Every check states the intended behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'admin@a.test');
\set admin '00000000-0000-0000-0000-00000000000a'
select t.run('authenticated', :'admin', $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'admin', $q$select fp_create_organization('Org B')$q$);
select id as "org"  from fp_organizations where name = 'Org A' \gset
select id as "orgB" from fp_organizations where name = 'Org B' \gset
update fp_organizations set allow_public_requests = true;

insert into fp_assets (id, org_id, name_i18n) values
  ('20000000-0000-0000-0000-000000000001', :'org',  '{"en":"Chiller"}'),
  ('20000000-0000-0000-0000-000000000002', :'org',  '{"en":"Lift"}'),
  ('20000000-0000-0000-0000-00000000000b', :'orgB', '{"en":"Other org pump"}');

-- A public report as an anonymous caller from a given client IP.
create function t.report(p_ip text, p_title text, p_asset text default null, p_extra text default '') returns text
language sql as $fn$
  select t.run('anon', null, format(
    $f$do $d$ begin
         perform set_config('request.headers', %L, true);
         perform fp_public_report(%L, %L, null, 'high', 'vi', %s %s);
       end $d$$f$,
    json_build_object('x-forwarded-for', p_ip || ', 10.0.0.1')::text,
    (select id from fp_organizations where name = 'Org A'), p_title,
    coalesce(quote_literal(p_asset) || '::uuid', 'null'), p_extra))
$fn$;
create function t.qr_count() returns bigint language sql as
  $$ select count(*) from fp_requests where channel = 'qr' $$;

-- ===========================================================================
-- Public reports
-- ===========================================================================
select t.report('1.1.1.1', 'Chiller noisy', '20000000-0000-0000-0000-000000000001') as r \gset
select t.check('anonymous report accepted',
  :'r' like 'ok:%' and (select count(*) from fp_requests where title = 'Chiller noisy') = 1);
select t.check('title over 200 characters is refused',
  t.report('1.1.1.1', repeat('x', 201)) like 'err:report_too_long%');
select t.check('another org''s asset is refused with a clear error',
  t.report('1.1.1.1', 'Pump', '20000000-0000-0000-0000-00000000000b') like 'err:report_invalid_asset%');

select t.report('2.2.2.2', 'Chiller noisy', '20000000-0000-0000-0000-000000000001');
select t.check('the same problem reported again soon returns the existing request',
  (select count(*) from fp_requests where title = 'Chiller noisy') = 1);

-- One client IP: 5 new reports per 10 minutes.
select t.report('3.3.3.3', 'Issue ' || g) from generate_series(1, 5) g;
select t.check('a 6th report from the same client within 10 minutes is refused',
  t.report('3.3.3.3', 'Issue 6') like 'err:rate_limited%');
select t.check('a different client can still report', t.report('4.4.4.4', 'Door stuck') like 'ok:%');
select t.check('an anonymous caller cannot pick a different client IP to dodge the limit',
  t.report('3.3.3.3', 'Issue 7', null, ', null, null, ''9.9.9.9''') like 'err:rate_limited%');
select t.run('service_role', null, format(
    $q$select fp_public_report(%L, 'Relayed report', null, 'low', 'en', null, null, null, '5.5.5.5')$q$, :'org')) as r \gset
select t.check('the trusted CAPTCHA relay (service role) can pass the client IP',
  :'r' like 'ok:%'
  and exists (select 1 from fp_public_report_log where client_key = md5(:'org' || ':5.5.5.5')));

-- One asset: 10 per hour.
select t.report('6.6.6.' || g, 'Lift fault ' || g, '20000000-0000-0000-0000-000000000002') from generate_series(1, 10) g;
select t.check('an 11th report for the same asset within an hour is refused',
  t.report('7.7.7.7', 'Lift fault 11', '20000000-0000-0000-0000-000000000002') like 'err:rate_limited%');

-- Whole org: 60 per hour.
insert into fp_public_report_log (org_id, client_key) select :'org', 'k' || g from generate_series(1, 60) g;
select t.check('the org-wide hourly cap stops a distributed flood',
  t.report('8.8.8.8', 'Flood') like 'err:rate_limited%');
select t.check('other orgs are unaffected by this org''s limits',
  t.run('anon', null, format($q$select fp_public_report(%L, 'Hello')$q$, :'orgB')) like 'ok:%');

-- ===========================================================================
-- Device ingest
-- ===========================================================================
insert into fp_devices (id, org_id, name, device_key) values
  ('60000000-0000-0000-0000-000000000001', :'org', 'Sensor', 'devkey1');
insert into fp_device_rules (org_id, device_id, metric, op, threshold, action, cooldown_minutes) values
  (:'org', '60000000-0000-0000-0000-000000000001', 'temp', 'gt', 30, 'work_order', 60);

select t.check('a reading is accepted', t.run('anon', null, $q$select fp_device_ingest('devkey1', 'temp', 21)$q$) = 'ok:1');
select t.check('a metric name over 64 characters is refused',
  t.run('anon', null, format($q$select fp_device_ingest('devkey1', %L, 1)$q$, repeat('m', 65))) like 'err:reading_invalid%');
select t.check('oversized meta is refused',
  t.run('anon', null, format($q$select fp_device_ingest('devkey1', 'temp', 1, null, now(), %L::jsonb)$q$,
    json_build_object('blob', repeat('x', 5000))::text)) like 'err:reading_invalid%');

select t.run('anon', null, $q$select fp_device_ingest('devkey1', 'hum', 50, null, now() + interval '2 days')$q$);
select t.check('a future timestamp is clamped to now',
  (select ts <= now() + interval '1 second' from fp_telemetry where metric = 'hum'));

select t.run('anon', null, $q$select fp_device_ingest('devkey1', 'press', 1, null, '2026-01-01 00:00+00')$q$);
select t.run('anon', null, $q$select fp_device_ingest('devkey1', 'press', 1, null, '2026-01-01 00:00+00')$q$);
select t.check('the same reading delivered twice is stored once',
  (select count(*) from fp_telemetry where metric = 'press') = 1);

select t.run('anon', null, $q$select fp_device_ingest('devkey1', 'temp', 35, null, now() - interval '2 seconds')$q$);
select t.run('anon', null, $q$select fp_device_ingest('devkey1', 'temp', 36, null, now() - interval '1 second')$q$);
select t.check('a threshold rule fires once per cooldown',
  (select count(*) from fp_requests where title like 'Sensor:%') = 1);

select t.check('last_seen_at is not rewritten (and audited) on every reading',
  (select count(*) from fp_audit_log where entity_type = 'fp_devices' and action = 'UPDATE') = 1);

insert into fp_telemetry (org_id, device_id, metric, value, ts)
  select :'org', '60000000-0000-0000-0000-000000000001', 'bulk', g, now() - make_interval(secs => g)
  from generate_series(1, 600) g;
select t.check('more than 600 readings a minute from one device is refused',
  t.run('anon', null, $q$select fp_device_ingest('devkey1', 'temp', 22)$q$) like 'err:rate_limited%');

\ir _report.sql
