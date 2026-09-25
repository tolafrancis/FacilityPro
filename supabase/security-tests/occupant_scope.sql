-- Occupant (tenant) scope suite (0081). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'tenant1@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'tenant2@a.test');
\set admin   '00000000-0000-0000-0000-00000000000a'
\set tech    '00000000-0000-0000-0000-0000000000a1'
\set tenant1 '00000000-0000-0000-0000-0000000000a2'
\set tenant2 '00000000-0000-0000-0000-0000000000a3'

select t.run('authenticated', :'admin', $q$select fp_create_organization('Org A')$q$);
select id as "org" from fp_organizations where name = 'Org A' \gset
insert into fp_users_orgs (user_id, org_id, role) values
  (:'tech', :'org', 'technician'), (:'tenant1', :'org', 'occupant'), (:'tenant2', :'org', 'occupant');

-- Staff data
insert into fp_locations (id, org_id, name_i18n, kind) values ('30000000-0000-0000-0000-000000000001', :'org', '{"en":"Lobby"}', 'room');
insert into fp_assets (org_id, name_i18n) values (:'org', '{"en":"Chiller 1"}');
insert into fp_parts (org_id, name_i18n) values (:'org', '{"en":"Filter"}');
insert into fp_vendors (org_id, name) values (:'org', 'CoolAir Ltd');
insert into fp_broadcasts (org_id, title, message) values (:'org', 'Water off', 'Tuesday 9–11');

-- ===========================================================================
-- Requests
-- ===========================================================================
select t.check('a tenant can report a fault',
  t.run('authenticated', :'tenant1', format(
    $q$insert into fp_requests (id, org_id, title, body_original, source_lng, created_by, location_id)
       values ('40000000-0000-0000-0000-000000000001', %L, 'Leak in 12B', 'Water under sink', 'en', %L, '30000000-0000-0000-0000-000000000001')$q$,
    :'org', :'tenant1')) = 'ok:1');
select t.run('authenticated', :'tenant2', format(
  $q$insert into fp_requests (id, org_id, title, body_original, source_lng, created_by)
     values ('40000000-0000-0000-0000-000000000002', %L, 'Noisy fan 7A', 'x', 'en', %L)$q$, :'org', :'tenant2'));
select t.run('authenticated', :'admin', format(
  $q$insert into fp_requests (id, org_id, title, body_original, source_lng, created_by)
     values ('40000000-0000-0000-0000-000000000003', %L, 'Staff: check pump', 'x', 'en', %L)$q$, :'org', :'admin'));

select t.check('a tenant sees only their own request',
  t.run('authenticated', :'tenant1', 'select * from fp_requests') = 'ok:1'
  and t.run('authenticated', :'tenant1', $q$select * from fp_requests where id = '40000000-0000-0000-0000-000000000001'$q$) = 'ok:1');
select t.check('a tenant cannot open another tenant''s request by its id',
  t.run('authenticated', :'tenant1', $q$select * from fp_requests where id = '40000000-0000-0000-0000-000000000002'$q$) = 'ok:0');
select t.check('a tenant cannot file a request in someone else''s name',
  t.run('authenticated', :'tenant1', format(
    $q$insert into fp_requests (org_id, title, body_original, source_lng, created_by) values (%L, 'x', 'x', 'en', %L)$q$,
    :'org', :'tenant2')) like 'err:%');
select t.run('authenticated', :'tenant1', format(
  $q$insert into fp_requests (id, org_id, title, body_original, source_lng) values ('40000000-0000-0000-0000-000000000004', %L, 'Door 12B', 'x', 'en')$q$, :'org')) as r \gset
select t.check('a request filed without a reporter is recorded as the tenant''s own',
  :'r' = 'ok:1'
  and (select created_by from fp_requests where id = '40000000-0000-0000-0000-000000000004') = :'tenant1'::uuid
  and t.run('authenticated', :'tenant1', 'select * from fp_requests') = 'ok:2');
select t.check('a tenant cannot change a request''s status',
  t.run('authenticated', :'tenant1', $q$update fp_requests set status = 'closed' where id = '40000000-0000-0000-0000-000000000001'$q$) in ('ok:0')
  or t.run('authenticated', :'tenant1', $q$update fp_requests set status = 'closed' where id = '40000000-0000-0000-0000-000000000001'$q$) like 'err:%');
select t.check('staff still see every request',
  t.run('authenticated', :'admin', 'select * from fp_requests') = 'ok:4'
  and t.run('authenticated', :'tech', 'select * from fp_requests') = 'ok:4');

-- ===========================================================================
-- Photos
-- ===========================================================================
insert into fp_media (org_id, request_id, path) values
  (:'org', '40000000-0000-0000-0000-000000000001', :'org' || '/requests/40000000-0000-0000-0000-000000000001/a.jpg'),
  (:'org', '40000000-0000-0000-0000-000000000002', :'org' || '/requests/40000000-0000-0000-0000-000000000002/b.jpg');
select t.check('a tenant sees the photos of their own requests only',
  t.run('authenticated', :'tenant1', 'select * from fp_media') = 'ok:1'
  and t.run('authenticated', :'tenant1', $q$select * from fp_media where path like '%/b.jpg'$q$) = 'ok:0');
select t.check('a tenant can attach a photo to their own request, not to another''s',
  t.run('authenticated', :'tenant1', format(
    $q$insert into fp_media (org_id, request_id, path, created_by) values (%L, '40000000-0000-0000-0000-000000000001', %L, %L)$q$,
    :'org', :'org' || '/requests/40000000-0000-0000-0000-000000000001/c.jpg', :'tenant1')) = 'ok:1'
  and t.run('authenticated', :'tenant1', format(
    $q$insert into fp_media (org_id, request_id, path, created_by) values (%L, '40000000-0000-0000-0000-000000000002', %L, %L)$q$,
    :'org', :'org' || '/requests/40000000-0000-0000-0000-000000000002/d.jpg', :'tenant1')) like 'err:%');
select t.check('staff see every photo',
  t.run('authenticated', :'admin', 'select * from fp_media') = 'ok:3');

-- ===========================================================================
-- Staff data is hidden from tenants
-- ===========================================================================
select t.run('authenticated', :'admin', $q$select fp_convert_request('40000000-0000-0000-0000-000000000001')$q$);
select t.check('the tenant''s request became a work order (as staff)',
  t.run('authenticated', :'admin', 'select * from fp_work_orders') = 'ok:1');
select t.check('a tenant sees no work orders, not even for their own request',
  t.run('authenticated', :'tenant1', 'select * from fp_work_orders') = 'ok:0');
select t.check('a tenant sees no assets, asset types, parts or vendors',
  t.run('authenticated', :'tenant1', 'select * from fp_assets') = 'ok:0'
  and t.run('authenticated', :'tenant1', 'select * from fp_asset_types') = 'ok:0'
  and (select count(*) from fp_asset_types where org_id = :'org') > 0
  and t.run('authenticated', :'tenant1', 'select * from fp_parts') = 'ok:0'
  and t.run('authenticated', :'tenant1', 'select * from fp_vendors') = 'ok:0');
select t.check('staff still see work orders, assets, parts and vendors',
  t.run('authenticated', :'tech', 'select * from fp_work_orders') = 'ok:1'
  and t.run('authenticated', :'tech', 'select * from fp_assets') = 'ok:1'
  and t.run('authenticated', :'tech', 'select * from fp_parts') = 'ok:1'
  and t.run('authenticated', :'tech', 'select * from fp_vendors') = 'ok:1');
select t.check('the request''s status follows its work order, so the tenant can follow progress',
  (select status from fp_requests where id = '40000000-0000-0000-0000-000000000001') <> 'new'
  and t.run('authenticated', :'tenant1', $q$select status from fp_requests where id = '40000000-0000-0000-0000-000000000001' and status <> 'new'$q$) = 'ok:1');

-- ===========================================================================
-- What tenants still use
-- ===========================================================================
select t.check('a tenant still sees the locations, fault types and announcements for the report form and home screen',
  t.run('authenticated', :'tenant1', 'select * from fp_locations') <> 'ok:0'
  and t.run('authenticated', :'tenant1', 'select * from fp_locations') not like 'err:%'
  and t.run('authenticated', :'tenant1', 'select * from fp_fault_types')
      = 'ok:' || (select count(*) from fp_fault_types where org_id = :'org')
  and t.run('authenticated', :'tenant1', 'select * from fp_broadcasts') = 'ok:1'
  and t.run('authenticated', :'tenant1', 'select * from fp_organizations') = 'ok:1');
select t.check('a tenant cannot post, edit or delete announcements',
  t.run('authenticated', :'tenant1', format($q$insert into fp_broadcasts (org_id, title, message) values (%L, 'x', 'x')$q$, :'org')) like 'err:%'
  and t.run('authenticated', :'tenant1', $q$update fp_broadcasts set title = 'hacked'$q$) = 'ok:0'
  and t.run('authenticated', :'tenant1', $q$delete from fp_broadcasts$q$) = 'ok:0');
select t.check('staff can still post announcements',
  t.run('authenticated', :'tech', format($q$insert into fp_broadcasts (org_id, title, message) values (%L, 'Lift service', 'Friday')$q$, :'org')) = 'ok:1');
select t.check('a tenant''s dashboard figures count only their own requests (2 of the 4)',
  t.run('authenticated', :'tenant1', format($q$select 1 where (fp_dashboard_kpis(%L) ->> 'faults_7d')::int = 2$q$, :'org')) = 'ok:1'
  and t.run('authenticated', :'admin', format($q$select 1 where (fp_dashboard_kpis(%L) ->> 'faults_7d')::int = 4$q$, :'org')) = 'ok:1');

\ir _report.sql
