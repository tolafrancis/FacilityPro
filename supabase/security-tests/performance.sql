-- KPI functions suite (0069). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'occ@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test');
\set admin  '00000000-0000-0000-0000-00000000000a'
\set occ    '00000000-0000-0000-0000-0000000000a2'
\set adminB '00000000-0000-0000-0000-00000000000b'
select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$);
select id as "org" from fp_organizations where name = 'Org A' \gset
insert into fp_invites (org_id, email, role, token) values (:'org', 'occ@a.test', 'occupant', '10000000-0000-0000-0000-000000000001');
select t.run('authenticated', :'occ', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);

-- 1,500 requests (past PostgREST's 1,000-row page) and 1,200 work orders,
-- loaded directly in their final states (lifecycle triggers bypassed).
set session_replication_role = replica;
insert into fp_requests (org_id, title, body_original, source_lng, status, created_by)
  select :'org', 'r' || g, 'x', 'en', case when g % 3 = 0 then 'closed' else 'new' end,
         case when g <= 10 then :'occ'::uuid else :'admin'::uuid end
  from generate_series(1, 1500) g;
insert into fp_work_orders (org_id, title, status, priority, due_at, created_at, resolved_at, cost)
  select :'org', 'w' || g,
         case when g % 4 = 0 then 'resolved' when g % 4 = 1 then 'in_progress' else 'open' end,
         'medium', now() - interval '1 day', now() - interval '2 days',
         case when g % 4 = 0 then now() - interval '1 day' end, 10
  from generate_series(1, 1200) g;
set session_replication_role = origin;

select fp_dashboard_kpis(:'org') as k \gset
select t.run('authenticated', :'admin', format($q$select fp_dashboard_kpis(%L)$q$, :'org')) as r \gset
select set_config('request.jwt.claim.sub', :'admin', false);
set role authenticated;
select fp_dashboard_kpis(:'org') as kadmin \gset
select fp_report_kpis(:'org') as rep \gset
reset role;
select set_config('request.jwt.claim.sub', :'adminB', false);
set role authenticated;
select fp_dashboard_kpis(:'org') as kother \gset
reset role;

select t.check('dashboard counts are exact past 1,000 rows',
  (:'kadmin'::jsonb ->> 'open_requests')::int = 1000
  and (:'kadmin'::jsonb ->> 'in_progress')::int = 300
  and (:'kadmin'::jsonb ->> 'overdue')::int = 900
  and (:'kadmin'::jsonb ->> 'resolved_30d')::int = 300);
select t.check('dashboard counts respect RLS (another org sees nothing)',
  (:'kother'::jsonb ->> 'open_requests')::int = 0 and (:'kother'::jsonb ->> 'overdue')::int = 0);
select t.check('report KPIs are computed in the database',
  (:'rep'::jsonb ->> 'open_work')::int = 900
  and (:'rep'::jsonb ->> 'avg_resolution_hours')::int = 24
  and (:'rep'::jsonb ->> 'total_cost')::numeric = 12000
  and jsonb_array_length(:'rep'::jsonb -> 'cost_by_month') = 6);
select t.check('report date filter uses whole days in the org time zone',
  t.run('authenticated', :'admin', format($q$select 1 where (fp_report_kpis(%L, current_date + 1, null) ->> 'open_work')::int = 0$q$, :'org')) = 'ok:1');
select t.check('dashboard KPIs are callable by members; anon cannot',
  :'r' = 'ok:1'
  and t.run('anon', null, format($q$select fp_dashboard_kpis(%L)$q$, :'org')) like 'err:%');
select t.check('reports for another organisation are refused',
  t.run('authenticated', :'adminB', format($q$select fp_report_kpis(%L)$q$, :'org')) like 'err:%');

-- ===========================================================================
-- Site-scoped visibility (policies rewritten in 0069; same rules as 0054)
-- ===========================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'tech@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'tech2@a.test');
\set tech  '00000000-0000-0000-0000-0000000000a1'
\set tech2 '00000000-0000-0000-0000-0000000000a3'
insert into fp_invites (org_id, email, role, token) values
  (:'org', 'tech@a.test',  'technician', '10000000-0000-0000-0000-000000000002'),
  (:'org', 'tech2@a.test', 'technician', '10000000-0000-0000-0000-000000000003');
select t.run('authenticated', :'tech',  $q$select fp_accept_invite('10000000-0000-0000-0000-000000000002')$q$);
select t.run('authenticated', :'tech2', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000003')$q$);
insert into fp_sites (id, org_id, name_i18n) values
  ('50000000-0000-0000-0000-000000000001', :'org', '{"en":"North"}'),
  ('50000000-0000-0000-0000-000000000002', :'org', '{"en":"South"}');
insert into fp_locations (id, org_id, site_id, name_i18n, kind) values
  ('60000000-0000-0000-0000-000000000001', :'org', '50000000-0000-0000-0000-000000000001', '{"en":"N room"}', 'room'),
  ('60000000-0000-0000-0000-000000000002', :'org', '50000000-0000-0000-0000-000000000002', '{"en":"S room"}', 'room');
insert into fp_assets (org_id, location_id, name_i18n) values
  (:'org', '60000000-0000-0000-0000-000000000001', '{"en":"N pump"}'),
  (:'org', '60000000-0000-0000-0000-000000000002', '{"en":"S pump"}');
insert into fp_requests (org_id, title, body_original, source_lng, location_id) values
  (:'org', 'site-N', 'x', 'en', '60000000-0000-0000-0000-000000000001'),
  (:'org', 'site-S', 'x', 'en', '60000000-0000-0000-0000-000000000002');
insert into fp_work_orders (org_id, title, location_id) values
  (:'org', 'site-N', '60000000-0000-0000-0000-000000000001'),
  (:'org', 'site-S', '60000000-0000-0000-0000-000000000002');
-- tech is limited to North; tech2 has no restriction; the admin is limited
-- to South but admins always see everything.
insert into fp_user_sites (user_id, org_id, site_id) values
  (:'tech',  :'org', '50000000-0000-0000-0000-000000000001'),
  (:'admin', :'org', '50000000-0000-0000-0000-000000000002');

select t.check('a site-restricted user sees only their site''s locations, assets, requests and work orders',
  t.run('authenticated', :'tech', $q$select * from fp_locations$q$) = 'ok:1'
  and t.run('authenticated', :'tech', $q$select * from fp_assets$q$) = 'ok:1'
  and t.run('authenticated', :'tech', $q$select * from fp_requests where title like 'site-%'$q$) = 'ok:1'
  and t.run('authenticated', :'tech', $q$select * from fp_work_orders where title = 'site-S'$q$) = 'ok:0'
  and t.run('authenticated', :'tech', $q$select * from fp_work_orders where title = 'site-N'$q$) = 'ok:1');
select t.check('...and still sees work with no location',
  t.run('authenticated', :'tech', $q$select * from fp_requests where title = 'r1'$q$) = 'ok:1');
select t.check('an unrestricted member sees every site',
  t.run('authenticated', :'tech2', $q$select * from fp_work_orders where title like 'site-%'$q$) = 'ok:2'
  and t.run('authenticated', :'tech2', $q$select * from fp_locations$q$) = 'ok:2');
select t.check('an org admin sees every site even with site rows',
  t.run('authenticated', :'admin', $q$select * from fp_assets$q$) = 'ok:2'
  and t.run('authenticated', :'admin', $q$select * from fp_requests where title like 'site-%'$q$) = 'ok:2');
select t.check('another organisation sees none of it',
  t.run('authenticated', :'adminB', $q$select * from fp_work_orders$q$) = 'ok:0'
  and t.run('authenticated', :'adminB', $q$select * from fp_locations$q$) = 'ok:0');

\ir _report.sql
