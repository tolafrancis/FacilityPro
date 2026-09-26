-- TV display boards suite (0092). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test', '{}'),
  ('00000000-0000-0000-0000-0000000000a1', 'manager@a.test', '{}'),
  ('00000000-0000-0000-0000-0000000000a2', 'tech@a.test', '{"full_name":"Linh Tran Van"}'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test', '{}');
\set admin  '00000000-0000-0000-0000-00000000000a'
\set mgr    '00000000-0000-0000-0000-0000000000a1'
\set tech   '00000000-0000-0000-0000-0000000000a2'
\set adminB '00000000-0000-0000-0000-00000000000b'
select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$);
select id as "org"  from fp_organizations where name = 'Org A' \gset
select id as "orgB" from fp_organizations where name = 'Org B' \gset
insert into fp_users_orgs (user_id, org_id, role) values (:'mgr', :'org', 'manager'), (:'tech', :'org', 'technician');
insert into fp_sites (id, org_id, name_i18n) values
  ('51000000-0000-0000-0000-000000000001', :'org', '{"en":"Tower 1"}'),
  ('51000000-0000-0000-0000-000000000002', :'org', '{"en":"Tower 2"}');
insert into fp_locations (id, org_id, site_id, name_i18n, kind) values
  ('10000000-0000-0000-0000-000000000001', :'org', '51000000-0000-0000-0000-000000000001', '{"en":"Lobby"}', 'zone'),
  ('10000000-0000-0000-0000-000000000002', :'org', '51000000-0000-0000-0000-000000000002', '{"en":"Gym"}', 'zone');
-- Fixtures in their final states (the lifecycle trigger is bypassed while seeding).
set session_replication_role = replica;
insert into fp_work_orders (org_id, title, instructions, priority, status, location_id, assigned_to, due_at, cost) values
  (:'org', 'Leaking pipe', 'Secret instructions', 'critical', 'in_progress', '10000000-0000-0000-0000-000000000001', :'tech', now() - interval '1 hour', 999),
  (:'org', 'Light out', null, 'low', 'open', '10000000-0000-0000-0000-000000000001', null, now() + interval '1 day', 0),
  (:'org', 'Gym AC', null, 'high', 'assigned', '10000000-0000-0000-0000-000000000002', null, null, 0),
  (:'org', 'Door fixed', null, 'medium', 'resolved', '10000000-0000-0000-0000-000000000001', null, null, 0),
  (:'orgB', 'Other org job', null, 'high', 'open', null, null, null, 0);
update fp_work_orders set resolved_at = now() - interval '30 minutes' where title = 'Door fixed';
insert into fp_work_orders (org_id, title, priority, status, location_id) values (:'org', 'Old finished', 'low', 'closed', '10000000-0000-0000-0000-000000000001');
update fp_work_orders set closed_at = now() - interval '2 days', resolved_at = now() - interval '2 days' where title = 'Old finished';
set session_replication_role = origin;
create temp table j (k text, v jsonb);
grant all on j to anon, authenticated;

-- ===========================================================================
-- Managing boards
-- ===========================================================================
select t.run('authenticated', :'mgr', format($q$insert into j select 'b1', to_jsonb(fp_save_display_board('{"org_id":"%s","name":"Lobby TV","site_id":"51000000-0000-0000-0000-000000000001","fields":["priority","due","location","assignee"]}'))$q$, :'org'));
select t.check('managers (and admins) create boards; the link token is 32 random hex characters',
  (select v ->> 'name' = 'Lobby TV' and v ->> 'token' ~ '^[0-9a-f]{32}$' from j where k = 'b1'));
select v ->> 'token' as "tok", v ->> 'id' as "bid" from j where k = 'b1' \gset
select t.check('technicians, other organisations and visitors cannot create boards or read tokens',
  t.run('authenticated', :'tech', format($q$select fp_save_display_board('{"org_id":"%s","name":"x"}')$q$, :'org')) like 'err:%'
  and t.run('authenticated', :'adminB', format($q$select fp_save_display_board('{"org_id":"%s","name":"x"}')$q$, :'org')) like 'err:%'
  and t.run('authenticated', :'adminB', format($q$select fp_save_display_board('{"id":"%s","name":"hijack"}')$q$, :'bid')) like 'err:%'
  and t.run('authenticated', :'tech', 'select * from fp_display_boards') = 'ok:0'
  and t.run('authenticated', :'adminB', 'select * from fp_display_boards') = 'ok:0'
  and t.run('anon', null, 'select * from fp_display_boards') like 'err:%'
  and t.run('authenticated', :'admin', 'select * from fp_display_boards') = 'ok:1');
select t.check('boards cannot be written directly',
  t.run('authenticated', :'admin', format($q$update fp_display_boards set org_id = %L$q$, :'orgB')) like 'err:%');
select t.run('authenticated', :'admin', format($q$select fp_save_display_board('{"org_id":"%s","name":"All","priorities":null,"fields":[]}')$q$, :'org')) as r \gset
select t.check('"all priorities" (JSON null) and an empty details list are accepted',
  :'r' = 'ok:1'
  and exists (select 1 from fp_display_boards where name = 'All' and priorities is null and fields = '{}'));
delete from fp_display_boards where name = 'All';
select t.check('a site from another organisation is refused',
  t.run('authenticated', :'adminB', format($q$select fp_save_display_board('{"org_id":"%s","name":"x","site_id":"51000000-0000-0000-0000-000000000001"}')$q$, :'orgB')) like 'err:%');

-- ===========================================================================
-- The screen
-- ===========================================================================
select t.run('anon', null, format($q$insert into j select 'screen', fp_display_board(%L)$q$, :'tok'));
select t.check('anyone with the link sees the board: only the site''s open work and recently finished work',
  (select v ->> 'ok' = 'true' and v -> 'org' ->> 'name' = 'Org A'
          and (select array_agg(x ->> 'title' order by x ->> 'title') from jsonb_array_elements(v -> 'work_orders') x) = array['Door fixed', 'Leaking pipe', 'Light out']
   from j where k = 'screen'));
select t.check('most urgent first; overdue flagged; assignee by first name only',
  (select v -> 'work_orders' -> 0 ->> 'title' = 'Leaking pipe' and v -> 'work_orders' -> 0 ->> 'overdue' = 'true'
          and v -> 'work_orders' -> 0 ->> 'assignee' = 'Linh' and v -> 'work_orders' -> 0 -> 'location' ->> 'en' = 'Lobby'
   from j where k = 'screen'));
select t.check('nothing private is exposed: no instructions, costs, emails or ids',
  (select v::text not like '%Secret instructions%' and v::text not like '%999%' and v::text not like '%tech@a.test%'
          and v::text not like '%' || :'org' || '%' and v::text not like '%Other org job%' from j where k = 'screen'));
select t.check('the board records that a screen is showing it',
  (select last_seen_at is not null from fp_display_boards where id = :'bid'));

select t.run('authenticated', :'mgr', format($q$select fp_save_display_board('{"id":"%s","name":"Lobby TV","fields":["priority"],"priorities":["critical","high"]}')$q$, :'bid'));
select t.run('anon', null, format($q$insert into j select 'screen2', fp_display_board(%L)$q$, :'tok'));
select t.check('details not chosen are left out, and the priority filter applies (all sites now)',
  (select (select array_agg(x ->> 'title' order by x ->> 'title') from jsonb_array_elements(v -> 'work_orders') x) = array['Gym AC', 'Leaking pipe']
          and v -> 'work_orders' -> 0 -> 'assignee' = 'null'::jsonb and v -> 'work_orders' -> 0 -> 'location' = 'null'::jsonb
   from j where k = 'screen2'));

select t.check('wrong or malformed tokens show nothing',
  (fp_display_board('00000000000000000000000000000000') ->> 'reason') = 'not_found'
  and (fp_display_board('x'' or 1=1 --') ->> 'reason') = 'not_found');

select t.run('authenticated', :'mgr', format($q$select fp_save_display_board('{"id":"%s","name":"Lobby TV","active":false}')$q$, :'bid'));
select t.check('a switched-off board shows nothing',
  (fp_display_board(:'tok') ->> 'reason') = 'off' and not (fp_display_board(:'tok') ? 'work_orders'));
select t.run('authenticated', :'mgr', format($q$select fp_save_display_board('{"id":"%s","name":"Lobby TV","active":true}')$q$, :'bid'));

select t.run('authenticated', :'admin', format($q$select fp_rotate_display_board(%L)$q$, :'bid'));
select t.check('a new link replaces the old one at once',
  (fp_display_board(:'tok') ->> 'reason') = 'not_found'
  and (fp_display_board((select token from fp_display_boards where id = :'bid')) ->> 'ok') = 'true');
select t.check('other organisations cannot rotate or delete the board',
  t.run('authenticated', :'adminB', format($q$select fp_rotate_display_board(%L)$q$, :'bid')) like 'err:%'
  and t.run('authenticated', :'adminB', format($q$select fp_delete_display_board(%L)$q$, :'bid')) like 'err:%');

update fp_organizations set suspended_at = now() where id = :'org';
select t.check('a suspended organisation''s boards show nothing',
  (fp_display_board((select token from fp_display_boards where id = :'bid')) ->> 'reason') = 'off');
update fp_organizations set suspended_at = null where id = :'org';

select t.run('authenticated', :'admin', format($q$select fp_delete_display_board(%L)$q$, :'bid'));
select t.check('deleting a board removes it', not exists (select 1 from fp_display_boards where id = :'bid'));

\ir _report.sql
