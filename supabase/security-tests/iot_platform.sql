-- IoT platform suite (0077). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'mgr@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'tech@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'tech2@a.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'occ@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test');
\set admin  '00000000-0000-0000-0000-00000000000a'
\set mgr    '00000000-0000-0000-0000-0000000000a1'
\set tech   '00000000-0000-0000-0000-0000000000a2'
\set tech2  '00000000-0000-0000-0000-0000000000a3'
\set occ    '00000000-0000-0000-0000-0000000000a4'
\set adminB '00000000-0000-0000-0000-00000000000b'

select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$);
select id as "org"  from fp_organizations where name = 'Org A' \gset
select id as "orgB" from fp_organizations where name = 'Org B' \gset
insert into fp_invites (org_id, email, role, token) values
  (:'org', 'mgr@a.test',   'manager',    '10000000-0000-0000-0000-000000000001'),
  (:'org', 'tech@a.test',  'technician', '10000000-0000-0000-0000-000000000002'),
  (:'org', 'tech2@a.test', 'technician', '10000000-0000-0000-0000-000000000003'),
  (:'org', 'occ@a.test',   'occupant',   '10000000-0000-0000-0000-000000000004');
select t.run('authenticated', :'mgr',   $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);
select t.run('authenticated', :'tech',  $q$select fp_accept_invite('10000000-0000-0000-0000-000000000002')$q$);
select t.run('authenticated', :'tech2', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000003')$q$);
select t.run('authenticated', :'occ',   $q$select fp_accept_invite('10000000-0000-0000-0000-000000000004')$q$);

-- Sites and a building → floor in site 1; tech2 only works at site 2.
insert into fp_sites (id, org_id, name_i18n) values
  ('51000000-0000-0000-0000-000000000001', :'org', '{"en":"HQ"}'),
  ('51000000-0000-0000-0000-000000000002', :'org', '{"en":"Plant"}'),
  ('51000000-0000-0000-0000-00000000000b', :'orgB', '{"en":"B HQ"}');
insert into fp_locations (id, org_id, site_id, parent_id, name_i18n, kind) values
  ('10c00000-0000-0000-0000-000000000001', :'org', '51000000-0000-0000-0000-000000000001', null, '{"en":"Tower A"}', 'building'),
  ('10c00000-0000-0000-0000-000000000002', :'org', null, '10c00000-0000-0000-0000-000000000001', '{"en":"Floor 2"}', 'floor'),
  ('10c00000-0000-0000-0000-00000000000b', :'orgB', '51000000-0000-0000-0000-00000000000b', null, '{"en":"B Tower"}', 'building');
insert into fp_user_sites (user_id, org_id, site_id) values (:'tech2', :'org', '51000000-0000-0000-0000-000000000002');

-- ===========================================================================
-- Catalog & unit conversion
-- ===========================================================================
select t.check('the global device taxonomy is seeded and readable by members',
  t.run('authenticated', :'tech', $q$select * from fp_iot_device_types where org_id is null$q$) ~ '^ok:[3-9][0-9]$');
select t.check('units convert: °F→°C, kW→W, MWh→kWh, bar→kPa',
  fp_iot_convert(212, '°F', '°C') = 100 and fp_iot_convert(1.5, 'kW', 'W') = 1500
  and fp_iot_convert(2, 'MWh', 'kWh') = 2000 and fp_iot_convert(1, 'bar', 'kPa') = 100
  and fp_iot_convert(1, 'bar', 'W') is null);
select t.check('an org admin cannot edit the global catalog',
  t.run('authenticated', :'admin', $q$update fp_iot_device_types set code = 'x' where org_id is null$q$) = 'ok:0');
select t.check('an org admin can add a model for their own org',
  t.run('authenticated', :'admin', format(
    $q$insert into fp_iot_device_models (org_id, manufacturer_id, model) select %L, id, 'Custom meter' from fp_iot_manufacturers where name = 'EPCB'$q$, :'org')) = 'ok:1');
select t.check('another org cannot see that model',
  t.run('authenticated', :'adminB', $q$select * from fp_iot_device_models where model = 'Custom meter'$q$) = 'ok:0');

-- ===========================================================================
-- Devices: location → site, cross-org references refused
-- ===========================================================================
select t.run('authenticated', :'admin', format(
  $q$insert into fp_devices (id, org_id, name, device_key, location_id, protocol, external_id, model_id)
     select 'de000000-0000-0000-0000-000000000001', %L, 'FCU 201', 'fcu-key', '10c00000-0000-0000-0000-000000000002', 'mqtt', 'FCU-201', id
     from fp_iot_device_models where model = 'MQTT thermostat / FCU controller'$q$, :'org')) as r \gset
select t.check('a device placed on a floor inherits the building''s site',
  :'r' = 'ok:1'
  and (select site_id from fp_devices where id = 'de000000-0000-0000-0000-000000000001') = '51000000-0000-0000-0000-000000000001');
select t.check('a device cannot be placed in another org''s building',
  t.run('authenticated', :'admin', format(
    $q$insert into fp_devices (org_id, name, location_id) values (%L, 'x', '10c00000-0000-0000-0000-00000000000b')$q$, :'org')) like 'err:%another organisation%');
select id as "customModel" from fp_iot_device_models where model = 'Custom meter' \gset
select t.check('a device cannot use another org''s model',
  t.run('authenticated', :'adminB', format(
    $q$insert into fp_devices (org_id, name, model_id) values (%L, 'x', %L)$q$, :'orgB', :'customModel')) like 'err:%another organisation%');
select t.run('authenticated', :'admin', $q$select fp_device_apply_model('de000000-0000-0000-0000-000000000001')$q$) as r \gset
select t.check('applying the model creates its data points',
  :'r' = 'ok:1' and (select count(*) from fp_device_data_points where device_id = 'de000000-0000-0000-0000-000000000001') = 4
  and (select writable from fp_device_data_points where key = 'setpoint'));
select t.check('a manager cannot apply a model',
  t.run('authenticated', :'mgr', $q$select fp_device_apply_model('de000000-0000-0000-0000-000000000001')$q$) like 'err:%not_allowed%');

-- ===========================================================================
-- Normalisation
-- ===========================================================================
-- This thermostat reports temperature in °F under the key "t".
select t.run('authenticated', :'admin', format(
  $q$insert into fp_device_data_points (org_id, device_id, key, metric, unit) values (%L, 'de000000-0000-0000-0000-000000000001', 't', 'temperature', '°F')$q$, :'org'));
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 't', 212)$q$);
select t.check('a mapped reading is stored as the canonical metric in the canonical unit, raw kept in meta',
  exists (select 1 from fp_telemetry where metric = 'temperature' and value = 100 and unit = '°C'
          and meta -> 'raw' ->> 'metric' = 't'));
select t.check('the latest value is available for live data',
  (select value from fp_device_latest where device_id = 'de000000-0000-0000-0000-000000000001' and metric = 'temperature') = 100);
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'power_kw', 1.5, 'kW')$q$);
select t.check('an unknown key is recorded as a discovered data point for mapping',
  exists (select 1 from fp_device_data_points where key = 'power_kw' and discovered));
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'energy', 2, 'MWh')$q$);
select t.check('a known quantity is converted even without a mapping (MWh → kWh)',
  (select value from fp_device_latest where device_id = 'de000000-0000-0000-0000-000000000001' and metric = 'energy') = 2000);
update fp_device_data_points set active = false where key = 'power_kw';
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'power_kw', 9, 'kW', now() + interval '1 second')$q$);
select t.check('a muted data point is ignored',
  (select count(*) from fp_telemetry where meta -> 'raw' ->> 'metric' = 'power_kw' or metric = 'power_kw') = 1);
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'battery', 15)$q$);

-- ===========================================================================
-- Who sees what
-- ===========================================================================
select t.check('technicians see devices in the directory, with health and status, but no key',
  t.run('authenticated', :'tech', $q$select * from fp_device_directory where battery_low and status = 'online'$q$) = 'ok:1'
  and not exists (select 1 from information_schema.columns where table_name = 'fp_device_directory' and column_name = 'device_key'));
select t.check('technicians still cannot read device keys',
  t.run('authenticated', :'tech', $q$select device_key from fp_devices$q$) = 'ok:0');
select t.check('another org sees none of it',
  t.run('authenticated', :'adminB', $q$select * from fp_device_directory$q$) = 'ok:0'
  and t.run('authenticated', :'adminB', $q$select * from fp_device_latest$q$) = 'ok:0'
  and t.run('authenticated', :'adminB', $q$select * from fp_device_data_points$q$) = 'ok:0');
select t.check('a technician limited to another site does not see this device or its data',
  t.run('authenticated', :'tech2', $q$select * from fp_device_directory$q$) = 'ok:0'
  and t.run('authenticated', :'tech2', $q$select * from fp_device_latest$q$) = 'ok:0');
select t.check('anonymous callers see nothing',
  t.run('anon', null, $q$select * from fp_device_directory$q$) like 'err:%'
  or t.run('anon', null, $q$select * from fp_device_directory$q$) = 'ok:0');

-- ===========================================================================
-- Gateways
-- ===========================================================================
select t.run('authenticated', :'admin', format(
  $q$insert into fp_iot_gateways (id, org_id, name, gateway_key, location_id, protocols) values ('9a000000-0000-0000-0000-000000000001', %L, 'GW-001', 'gw-key-a', '10c00000-0000-0000-0000-000000000001', '{modbus_tcp}')$q$, :'org'));
select t.run('authenticated', :'admin', format(
  $q$insert into fp_devices (id, org_id, name, protocol, external_id, gateway_id) values ('de000000-0000-0000-0000-000000000002', %L, 'Main meter', 'modbus_tcp', 'MB-1', '9a000000-0000-0000-0000-000000000001')$q$, :'org'));
select t.run('authenticated', :'admin', format(
  $q$insert into fp_device_data_points (org_id, device_id, key, metric, unit, source) values (%L, 'de000000-0000-0000-0000-000000000002', 'energy', 'energy', 'Wh', '{"register_type":"holding","address":3204,"datatype":"int64","one_based":true}')$q$, :'org'));
select t.run('authenticated', :'adminB', format(
  $q$insert into fp_devices (id, org_id, name, external_id) values ('de000000-0000-0000-0000-00000000000b', %L, 'B meter', 'MB-1')$q$, :'orgB'));

select t.run('anon', null, $q$select fp_gateway_ingest('gw-key-a', '[{"device":"MB-1","metric":"energy","value":1234000},{"device":"NOPE","metric":"x","value":1}]')$q$) as r \gset
select t.check('a gateway reports readings for its org''s devices by external id (Wh → kWh)',
  :'r' = 'ok:1'
  and (select value from fp_device_latest where device_id = 'de000000-0000-0000-0000-000000000002' and metric = 'energy') = 1234);
select t.check('a gateway cannot write into another org''s device with the same external id',
  not exists (select 1 from fp_telemetry where device_id = 'de000000-0000-0000-0000-00000000000b'));
select t.check('an invalid gateway key is refused',
  t.run('anon', null, $q$select fp_gateway_ingest('wrong', '[]')$q$) like 'err:%Invalid%');
select t.check('gateway config lists its devices with register maps, and no secrets',
  (select fp_gateway_config('gw-key-a') -> 'devices' -> 0 -> 'data_points' -> 0 -> 'source' ->> 'address') = '3204'
  and fp_gateway_config('gw-key-a')::text not like '%gw-key-a%'
  and fp_gateway_config('gw-key-a')::text not like '%fcu-key%');
select t.check('technicians cannot read gateway keys',
  t.run('authenticated', :'tech', $q$select * from fp_iot_gateways$q$) = 'ok:0');

-- ===========================================================================
-- Rules → alerts
-- ===========================================================================
select t.run('authenticated', :'admin', format(
  $q$insert into fp_device_rules (id, org_id, device_id, metric, op, threshold, action, alert_severity, escalate_after_minutes)
     values ('7e000000-0000-0000-0000-000000000001', %L, 'de000000-0000-0000-0000-000000000001', 'temperature', 'gt', 30, 'notify', 'critical', 5)$q$, :'org'));
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'temperature', 35, '°C', now() - interval '3 seconds')$q$);
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'temperature', 36, '°C', now() - interval '2 seconds')$q$);
select t.check('repeated breaches keep one open alert and count the repeats',
  (select count(*) from fp_device_alerts where rule_id = '7e000000-0000-0000-0000-000000000001') = 1
  and (select occurrences from fp_device_alerts where rule_id = '7e000000-0000-0000-0000-000000000001') = 2
  and (select severity from fp_device_alerts where rule_id = '7e000000-0000-0000-0000-000000000001') = 'critical');
select t.check('the alert notifies admins and managers once (cooldown)',
  (select count(*) from fp_notifications where kind = 'device_alert' and title like 'CRITICAL:%') = 2);
select t.check('staff can read alerts; occupants and other orgs cannot',
  t.run('authenticated', :'tech', $q$select * from fp_device_alerts$q$) = 'ok:1'
  and t.run('authenticated', :'occ', $q$select * from fp_device_alerts$q$) = 'ok:0'
  and t.run('authenticated', :'adminB', $q$select * from fp_device_alerts$q$) = 'ok:0');
update fp_device_alerts set opened_at = now() - interval '10 minutes';
select t.run('service_role', null, $q$select fp_run_job('escalate_device_alerts')$q$);
select t.check('an unacknowledged alert is escalated to admins once',
  (select count(*) from fp_notifications where title like 'Escalated:%') = 1
  and (select escalated_at is not null from fp_device_alerts limit 1));
select t.check('an occupant cannot acknowledge an alert',
  t.run('authenticated', :'occ', $q$select fp_device_alert_update((select id from fp_device_alerts limit 1), 'acknowledge')$q$) like 'err:%');
select t.check('clients cannot change alerts directly',
  t.run('authenticated', :'admin', $q$update fp_device_alerts set status = 'resolved'$q$) like 'err:%'
  or (select status from fp_device_alerts limit 1) = 'open');
select t.run('authenticated', :'tech', $q$select fp_device_alert_update((select id from fp_device_alerts limit 1), 'acknowledge')$q$);
select t.check('a technician acknowledges the alert',
  (select status = 'acknowledged' and acknowledged_by = :'tech'::uuid from fp_device_alerts limit 1));
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'temperature', 22, '°C', now() - interval '1 second')$q$);
select t.check('the alert resolves itself when the reading is back to normal',
  (select status = 'resolved' and resolution = 'auto' from fp_device_alerts limit 1));

-- AND-condition across metrics: CO₂ > 1000 and more than 20 people.
select t.run('authenticated', :'admin', format(
  $q$insert into fp_device_rules (id, org_id, device_id, metric, op, threshold, action, alert_severity, conditions)
     values ('7e000000-0000-0000-0000-000000000002', %L, 'de000000-0000-0000-0000-000000000001', 'co2', 'gt', 1000, 'alert', 'warning',
             '[{"metric":"people_count","op":"gt","threshold":20}]')$q$, :'org'));
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'people_count', 10, null, now() - interval '10 seconds')$q$);
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'co2', 1200, 'ppm', now() - interval '9 seconds')$q$);
select t.check('a compound rule does not fire when only one condition holds',
  not exists (select 1 from fp_device_alerts where rule_id = '7e000000-0000-0000-0000-000000000002'));
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'people_count', 25, null, now() - interval '8 seconds')$q$);
select t.run('anon', null, $q$select fp_device_ingest('fcu-key', 'co2', 1300, 'ppm', now() - interval '7 seconds')$q$);
select t.check('a compound rule fires when all conditions hold',
  exists (select 1 from fp_device_alerts where rule_id = '7e000000-0000-0000-0000-000000000002' and status = 'open'));
select t.check('a rule condition cannot reference another org''s device',
  t.run('authenticated', :'admin', format(
    $q$insert into fp_device_rules (org_id, device_id, metric, op, threshold, conditions) values (%L, 'de000000-0000-0000-0000-000000000001', 'co2', 'gt', 1, '[{"device_id":"de000000-0000-0000-0000-00000000000b","metric":"x","op":"gt","threshold":1}]')$q$, :'org')) like 'err:%');

-- ===========================================================================
-- Commands
-- ===========================================================================
select t.check('a technician can request a status update',
  t.run('authenticated', :'tech', $q$select fp_device_command('de000000-0000-0000-0000-000000000001', 'request_status')$q$) = 'ok:1');
select t.check('a technician cannot change a setpoint',
  t.run('authenticated', :'tech', $q$select fp_device_command('de000000-0000-0000-0000-000000000001', 'set_setpoint', '{"value":22}')$q$) like 'err:%not_allowed%');
select t.run('authenticated', :'mgr', $q$select fp_device_command('de000000-0000-0000-0000-000000000001', 'set_setpoint', '{"value":22}')$q$) as r \gset
select t.check('a manager changes the setpoint within range',
  :'r' = 'ok:1'
  and exists (select 1 from fp_device_commands where command = 'set_setpoint' and payload ->> 'data_point' = 'setpoint'
              and (payload ->> 'value')::numeric = 22 and requested_by = :'mgr'::uuid));
select t.check('an out-of-range setpoint is refused',
  t.run('authenticated', :'mgr', $q$select fp_device_command('de000000-0000-0000-0000-000000000001', 'set_setpoint', '{"value":50}')$q$) like 'err:%value_out_of_range%');
select t.check('a read-only data point cannot be written',
  t.run('authenticated', :'mgr', $q$select fp_device_command('de000000-0000-0000-0000-000000000001', 'write', '{"data_point":"temperature","value":1}')$q$) like 'err:%not_writable%');
update fp_device_data_points set dangerous = true where key = 'power';
select t.run('authenticated', :'mgr', $q$select fp_device_command('de000000-0000-0000-0000-000000000001', 'turn_off')$q$) as r1 \gset
select t.run('authenticated', :'admin', $q$select fp_device_command('de000000-0000-0000-0000-000000000001', 'turn_off')$q$) as r2 \gset
select t.check('a dangerous control needs an admin',
  :'r1' like 'err:%not_allowed%' and :'r2' = 'ok:1'
  and (select dangerous from fp_device_commands where command = 'turn_off'));
select t.check('another org cannot command the device',
  t.run('authenticated', :'adminB', $q$select fp_device_command('de000000-0000-0000-0000-000000000001', 'request_status')$q$) like 'err:%not_found%');
select t.check('clients cannot insert commands directly',
  t.run('authenticated', :'admin', format(
    $q$insert into fp_device_commands (org_id, device_id, command, expires_at) values (%L, 'de000000-0000-0000-0000-000000000001', 'x', now() + interval '1 hour')$q$, :'org')) like 'err:%');
select t.check('anonymous callers cannot send commands',
  t.run('anon', null, $q$select fp_device_command('de000000-0000-0000-0000-000000000001', 'request_status')$q$) like 'err:%');
update fp_devices set last_seen_at = now() - interval '1 hour' where id = 'de000000-0000-0000-0000-000000000001';
select t.check('no writes to a device that has gone quiet (stale state)',
  t.run('authenticated', :'admin', $q$select fp_device_command('de000000-0000-0000-0000-000000000001', 'turn_on')$q$) like 'err:%device_offline%');

-- Delivery to a directly connected device (no gateway), by its key.
update fp_device_commands set expires_at = now() - interval '1 second' where command = 'request_status';
select t.run('anon', null, $q$select fp_iot_claim_commands('fcu-key')$q$) as r \gset
select t.check('the device claims its pending commands, oldest first; expired ones are never delivered',
  :'r' = 'ok:2'
  and (select status from fp_device_commands where command = 'request_status') = 'expired'
  and (select count(*) from fp_device_commands where status = 'sent') = 2);
select id as "cmd" from fp_device_commands where command = 'set_setpoint' \gset
select t.run('anon', null, format($q$select fp_iot_command_result('gw-key-a', %L, true)$q$, :'cmd')) as r \gset
select t.check('another key cannot report a command''s result',
  :'r' = 'ok:1' and (select status from fp_device_commands where command = 'set_setpoint') = 'sent');
select t.run('anon', null, format($q$select fp_iot_command_result('fcu-key', %L, true, '{"applied":22}')$q$, :'cmd'));
select t.check('the device reports success',
  (select status from fp_device_commands where command = 'set_setpoint') = 'succeeded');
select t.check('every command is in the audit log with who asked',
  (select count(*) from fp_audit_log where entity_type = 'fp_device_commands' and action = 'INSERT') = 3
  and exists (select 1 from fp_audit_log where entity_type = 'fp_device_commands' and actor = :'mgr'::uuid));

-- ===========================================================================
-- Device credentials: write-only
-- ===========================================================================
select t.run('authenticated', :'admin', $q$select fp_device_set_credentials('de000000-0000-0000-0000-000000000001', '{"app_key":"00112233445566778899AABBCCDDEEFF"}')$q$) as r \gset
select t.check('an admin stores a device secret and sees only its name',
  :'r' = 'ok:1'
  and t.run('authenticated', :'admin', $q$select fp_device_credential_keys('de000000-0000-0000-0000-000000000001')$q$) = 'ok:1');
select t.check('nobody can read device secrets back through the API',
  t.run('authenticated', :'admin', $q$select * from fp_device_credentials$q$) like 'err:%');
select t.check('a manager cannot set device secrets',
  t.run('authenticated', :'mgr', $q$select fp_device_set_credentials('de000000-0000-0000-0000-000000000001', '{"x":"y"}')$q$) like 'err:%not_allowed%');
select t.check('secrets never reach the audit log',
  not exists (select 1 from fp_audit_log where diff::text like '%00112233445566778899%'));

-- ===========================================================================
-- History & LoRaWAN ids
-- ===========================================================================
select t.check('history returns bucketed values for members of the org',
  t.run('authenticated', :'tech', $q$select * from fp_device_history('de000000-0000-0000-0000-000000000001', 'temperature', now() - interval '1 day')$q$) like 'ok:%'
  and (select count(*) from fp_device_history('de000000-0000-0000-0000-000000000001', 'temperature', now() - interval '1 day')) >= 1);
select t.check('history is empty for another org and for a technician of another site',
  t.run('authenticated', :'adminB', $q$select * from fp_device_history('de000000-0000-0000-0000-000000000001', 'temperature', now() - interval '1 day')$q$) = 'ok:0'
  and t.run('authenticated', :'tech2', $q$select * from fp_device_history('de000000-0000-0000-0000-000000000001', 'temperature', now() - interval '1 day')$q$) = 'ok:0');
update fp_devices set external_id = '70B3D57ED0000001' where id = 'de000000-0000-0000-0000-000000000002';
select t.run('anon', null, $q$select fp_gateway_ingest('gw-key-a', '[{"device":"70b3d57ed0000001","metric":"battery","value":88}]')$q$);
select t.check('external ids (DevEUI) match regardless of case',
  (select value from fp_device_latest where device_id = 'de000000-0000-0000-0000-000000000002' and metric = 'battery') = 88);
select t.check('two devices of one org cannot share an external id in different case',
  t.run('authenticated', :'admin', format($q$insert into fp_devices (org_id, name, external_id) values (%L, 'dup', '70b3d57ed0000001')$q$, :'org')) like 'err:%duplicate%');

\ir _report.sql
