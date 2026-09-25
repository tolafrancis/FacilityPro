-- Onboarding and dashboard suite (0079). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'mgr@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test');
\set admin  '00000000-0000-0000-0000-00000000000a'
\set mgr    '00000000-0000-0000-0000-0000000000a1'
\set adminB '00000000-0000-0000-0000-00000000000b'

select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$);
select id as "org"  from fp_organizations where name = 'Org A' \gset
select id as "orgB" from fp_organizations where name = 'Org B' \gset
insert into fp_invites (org_id, email, role, token) values (:'org', 'mgr@a.test', 'manager', '10000000-0000-0000-0000-000000000001');
select t.run('authenticated', :'mgr', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);

-- ===========================================================================
-- Industry and logo
-- ===========================================================================
select t.run('authenticated', :'admin', format(
  $q$update fp_organizations set industry = 'property_management', logo_path = %L where id = %L$q$, :'org' || '/logo-1.png', :'org')) as r \gset
select t.check('the admin sets the industry and logo during onboarding',
  :'r' = 'ok:1' and (select industry from fp_organizations where id = :'org') = 'property_management');
select t.check('an unknown industry is refused',
  t.run('authenticated', :'admin', format($q$update fp_organizations set industry = 'mining' where id = %L$q$, :'org')) like 'err:%');
select t.check('a logo path outside the organisation''s folder is refused',
  t.run('authenticated', :'admin', format($q$update fp_organizations set logo_path = %L where id = %L$q$, :'orgB' || '/x.png', :'org')) like 'err:%');
select t.check('a manager cannot change the organisation',
  t.run('authenticated', :'mgr', format($q$update fp_organizations set industry = 'other' where id = %L$q$, :'org')) = 'ok:0');

select t.check('the admin uploads a logo to their organisation''s folder',
  t.run('authenticated', :'admin', format(
    $q$insert into storage.objects (bucket_id, name) values ('fp-org-logos', %L)$q$, :'org' || '/logo-1.png')) = 'ok:1');
select t.check('nobody uploads into another organisation''s logo folder',
  t.run('authenticated', :'admin', format(
    $q$insert into storage.objects (bucket_id, name) values ('fp-org-logos', %L)$q$, :'orgB' || '/logo.png')) like 'err:%');
select t.check('a manager cannot upload a logo',
  t.run('authenticated', :'mgr', format(
    $q$insert into storage.objects (bucket_id, name) values ('fp-org-logos', %L)$q$, :'org' || '/logo-2.png')) like 'err:%');
select t.check('a path that isn''t under an organisation folder is refused',
  t.run('authenticated', :'admin', $q$insert into storage.objects (bucket_id, name) values ('fp-org-logos', 'logo.png')$q$) like 'err:%');
select t.check('the logo bucket takes raster images up to 2 MB only',
  (select file_size_limit = 2097152 and not ('image/svg+xml' = any (allowed_mime_types))
     from storage.buckets where id = 'fp-org-logos'));

-- ===========================================================================
-- Dashboard figures
-- ===========================================================================
insert into fp_locations (org_id, name_i18n, kind) values (:'org', '{"en":"Tower A"}', 'building');
insert into fp_requests (org_id, title, body_original, source_lng, status) values
  (:'org', 'Leak', 'x', 'en', 'new'),
  (:'org', 'Light', 'x', 'en', 'resolved');
select t.run('authenticated', :'admin', format($q$select fp_dashboard_kpis(%L)$q$, :'org')) as r \gset
select fp_dashboard_kpis(:'org') as k \gset
select t.check('the dashboard reports this week''s faults, resolutions and the setup checklist',
  (:'k'::jsonb ->> 'faults_7d')::int = 2 and (:'k'::jsonb ->> 'resolved_7d')::int = 1
  and (:'k'::jsonb -> 'setup' ->> 'locations')::int = 1 and (:'k'::jsonb -> 'setup' ->> 'members')::int = 2
  and :'k'::jsonb ? 'tasks' and :'k'::jsonb ? 'pending_tasks' and :'k'::jsonb ? 'assets'
  and jsonb_typeof(:'k'::jsonb -> 'categories') = 'array');
create temp table kb as select fp_dashboard_kpis(:'org') as k limit 0;
grant all on kb to authenticated;
select t.run('authenticated', :'adminB', format($q$insert into kb select fp_dashboard_kpis(%L)$q$, :'org'));
select t.check('another organisation''s admin sees none of these figures',
  (select (k ->> 'faults_7d')::int = 0 and (k -> 'setup' ->> 'locations')::int = 0 from kb));

\ir _report.sql
