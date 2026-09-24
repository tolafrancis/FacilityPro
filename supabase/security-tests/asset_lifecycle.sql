-- Asset lifecycle + location tree suite (0068). Every check states the
-- intended behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test');
\set admin  '00000000-0000-0000-0000-00000000000a'
\set adminB '00000000-0000-0000-0000-00000000000b'
select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$);
select id as "org"  from fp_organizations where name = 'Org A' \gset
select id as "orgB" from fp_organizations where name = 'Org B' \gset

-- Org A uses sites; Org B doesn't.
insert into fp_sites (id, org_id, name_i18n) values ('50000000-0000-0000-0000-000000000001', :'org', '{"en":"HQ"}');
select t.run('authenticated', :'admin', format($q$
  insert into fp_locations (id, org_id, site_id, name_i18n, kind) values
    ('10000000-0000-0000-0000-000000000001', %L, '50000000-0000-0000-0000-000000000001', '{"en":"Tower"}', 'building')$q$, :'org'));

-- ===========================================================================
-- Location tree
-- ===========================================================================
select t.run('authenticated', :'admin', format($q$
  insert into fp_locations (id, org_id, parent_id, name_i18n, kind) values
    ('10000000-0000-0000-0000-000000000002', %L, '10000000-0000-0000-0000-000000000001', '{"en":"Floor 3"}', 'floor'),
    ('10000000-0000-0000-0000-000000000003', %L, '10000000-0000-0000-0000-000000000002', '{"en":"Room 302"}', 'room')$q$, :'org', :'org')) as r \gset
select t.check('a location placed under a parent takes the parent''s site',
  :'r' = 'ok:2'
  and (select site_id from fp_locations where id = '10000000-0000-0000-0000-000000000003') = '50000000-0000-0000-0000-000000000001');
select t.check('in an org that uses sites, a location with no site or parent is refused',
  t.run('authenticated', :'admin', format($q$
    insert into fp_locations (org_id, name_i18n, kind) values (%L, '{"en":"Orphan"}', 'room')$q$, :'org')) like 'err:%site or a parent%');
select t.check('an org without sites can still create top-level locations',
  t.run('authenticated', :'adminB', format($q$
    insert into fp_locations (org_id, name_i18n, kind) values (%L, '{"en":"Office"}', 'room')$q$, :'orgB')) = 'ok:1');
select t.check('a location cannot be moved inside itself',
  t.run('authenticated', :'admin', $q$
    update fp_locations set parent_id = '10000000-0000-0000-0000-000000000003' where id = '10000000-0000-0000-0000-000000000001'$q$) like 'err:%inside itself%');

insert into fp_sites (id, org_id, name_i18n) values ('50000000-0000-0000-0000-000000000002', :'org', '{"en":"Branch"}');
select t.run('authenticated', :'admin', $q$
  update fp_locations set site_id = '50000000-0000-0000-0000-000000000002' where id = '10000000-0000-0000-0000-000000000001'$q$);
select t.check('moving a building to another site moves its floors and rooms too',
  (select count(*) from fp_locations where site_id = '50000000-0000-0000-0000-000000000002') = 3);

-- ===========================================================================
-- Assets
-- ===========================================================================
select t.run('authenticated', :'admin', format($q$
  insert into fp_assets (id, org_id, location_id, name_i18n) values
    ('20000000-0000-0000-0000-000000000001', %L, '10000000-0000-0000-0000-000000000003', '{"en":"Chiller"}'),
    ('20000000-0000-0000-0000-000000000002', %L, null, '{"en":"Spare pump"}')$q$, :'org', :'org'));
insert into fp_pm_schedules (org_id, asset_id, name_i18n, interval_days, next_due_at)
  values (:'org', '20000000-0000-0000-0000-000000000001', '{"en":"Service"}', 30, now());
insert into fp_requests (org_id, title, body_original, source_lng, asset_id)
  values (:'org', 'Noisy', 'Noisy', 'en', '20000000-0000-0000-0000-000000000001');

select t.check('an asset status must be one of active / inactive / retired / disposed',
  t.run('authenticated', :'admin', $q$update fp_assets set status = 'broken' where id = '20000000-0000-0000-0000-000000000001'$q$) like 'err:%');
select t.check('an asset can be edited and moved',
  t.run('authenticated', :'admin', $q$update fp_assets set name_i18n = '{"en":"Chiller 1"}', location_id = '10000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000001'$q$) = 'ok:1');

select t.run('authenticated', :'admin', $q$update fp_assets set status = 'retired' where id = '20000000-0000-0000-0000-000000000001'$q$) as r \gset
select t.check('retiring an asset stops its preventive maintenance and records when',
  :'r' = 'ok:1'
  and not exists (select 1 from fp_pm_schedules where asset_id = '20000000-0000-0000-0000-000000000001' and active)
  and (select retired_at from fp_assets where id = '20000000-0000-0000-0000-000000000001') is not null);

select t.check('an asset with history cannot be hard-deleted',
  t.run('authenticated', :'admin', $q$delete from fp_assets where id = '20000000-0000-0000-0000-000000000001'$q$) like 'err:%Retire it%'
  and exists (select 1 from fp_requests where asset_id = '20000000-0000-0000-0000-000000000001'));
select t.check('an asset without history can be deleted',
  t.run('authenticated', :'admin', $q$delete from fp_assets where id = '20000000-0000-0000-0000-000000000002'$q$) = 'ok:1');
select t.check('a location that still contains things cannot be deleted',
  t.run('authenticated', :'admin', $q$delete from fp_locations where id = '10000000-0000-0000-0000-000000000001'$q$) like 'err:%Move or remove%'
  and (select count(*) from fp_locations where org_id = :'org') = 3);
select t.check('an empty location can be deleted',
  t.run('authenticated', :'admin', $q$delete from fp_locations where id = '10000000-0000-0000-0000-000000000003'$q$) = 'ok:1');

delete from fp_organizations where id = :'org';
select t.check('deleting an organisation still removes its assets and locations',
  not exists (select 1 from fp_assets where org_id = :'org')
  and not exists (select 1 from fp_locations where org_id = :'org'));

\ir _report.sql
