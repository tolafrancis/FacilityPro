-- Join links suite (0082). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'manager@a.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'new1@x.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'new2@x.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'new3@x.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test');
\set admin   '00000000-0000-0000-0000-00000000000a'
\set mgr     '00000000-0000-0000-0000-0000000000a1'
\set new1    '00000000-0000-0000-0000-0000000000c1'
\set new2    '00000000-0000-0000-0000-0000000000c2'
\set new3    '00000000-0000-0000-0000-0000000000c3'
\set adminB  '00000000-0000-0000-0000-00000000000b'

select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$);
select id as "org"  from fp_organizations where name = 'Org A' \gset
select id as "orgB" from fp_organizations where name = 'Org B' \gset
insert into fp_users_orgs (user_id, org_id, role) values (:'mgr', :'org', 'manager');

-- ===========================================================================
-- Creating links
-- ===========================================================================
select t.check('an admin creates a tenant link',
  t.run('authenticated', :'admin', format(
    $q$insert into fp_join_links (org_id, role, label) values (%L, 'occupant', 'Lobby poster')$q$, :'org')) = 'ok:1');
select token as "tenant_token" from fp_join_links where label = 'Lobby poster' \gset
select t.check('the token is 32 random hex characters',
  :'tenant_token' ~ '^[0-9a-f]{32}$');
select t.check('no link can make someone an org admin',
  t.run('authenticated', :'admin', format(
    $q$insert into fp_join_links (org_id, role) values (%L, 'org_admin')$q$, :'org')) like 'err:%');
select t.check('a manager cannot create or see join links',
  t.run('authenticated', :'mgr', format(
    $q$insert into fp_join_links (org_id, role) values (%L, 'technician')$q$, :'org')) like 'err:%'
  and t.run('authenticated', :'mgr', 'select * from fp_join_links') = 'ok:0');
select t.check('another organisation''s admin cannot see or create this organisation''s links',
  t.run('authenticated', :'adminB', 'select * from fp_join_links') = 'ok:0'
  and t.run('authenticated', :'adminB', format(
    $q$insert into fp_join_links (org_id, role) values (%L, 'technician')$q$, :'org')) like 'err:%');
select t.check('an admin cannot fake a link''s use count or token',
  t.run('authenticated', :'admin', $q$update fp_join_links set use_count = 0$q$) like 'err:%'
  and t.run('authenticated', :'admin', $q$update fp_join_links set token = 'abc'$q$) like 'err:%');

-- ===========================================================================
-- Before sign-in
-- ===========================================================================
select t.run('anon', null, format($q$select 1 where (fp_join_link_info(%L) ->> 'valid')::boolean
  and fp_join_link_info(%L) ->> 'org_name' = 'Org A' and fp_join_link_info(%L) ->> 'role' = 'occupant'$q$,
  :'tenant_token', :'tenant_token', :'tenant_token')) as r \gset
select t.check('anyone with the link sees the organisation and role before signing in', :'r' = 'ok:1');
select t.check('an unknown token says not found',
  t.run('anon', null, $q$select 1 where fp_join_link_info('00000000000000000000000000000000') ->> 'reason' = 'not_found'$q$) = 'ok:1');
select t.check('joining needs an account',
  t.run('anon', null, format($q$select fp_join_via_link(%L)$q$, :'tenant_token')) like 'err:%');

-- ===========================================================================
-- Joining
-- ===========================================================================
select t.run('authenticated', :'new1', format($q$select fp_join_via_link(%L)$q$, :'tenant_token')) as r \gset
select t.check('a new user joins with the link''s role',
  :'r' = 'ok:1'
  and (select role from fp_users_orgs where user_id = :'new1' and org_id = :'org') = 'occupant');
select t.check('each join is counted',
  (select use_count from fp_join_links where token = :'tenant_token') = 1);
select t.run('authenticated', :'admin', format(
  $q$insert into fp_join_links (org_id, role, label) values (%L, 'technician', 'Tech crew')$q$, :'org'));
select token as "tech_token" from fp_join_links where label = 'Tech crew' \gset
select t.check('joining never changes an existing member''s role',
  t.run('authenticated', :'mgr', format($q$select fp_join_via_link(%L)$q$, :'tech_token')) = 'ok:1'
  and (select role from fp_users_orgs where user_id = :'mgr' and org_id = :'org') = 'manager'
  and (select use_count from fp_join_links where token = :'tech_token') = 0);

-- ===========================================================================
-- Limits and revocation
-- ===========================================================================
select t.run('authenticated', :'admin', format(
  $q$insert into fp_join_links (org_id, role, label, max_uses) values (%L, 'vendor', 'One use', 1)$q$, :'org'));
select token as "one_token" from fp_join_links where label = 'One use' \gset
select t.run('authenticated', :'new2', format($q$select fp_join_via_link(%L)$q$, :'one_token'));
select t.check('a link stops working once its uses run out',
  t.run('authenticated', :'new3', format($q$select fp_join_via_link(%L)$q$, :'one_token')) like 'err:%used_up%'
  and not exists (select 1 from fp_users_orgs where user_id = :'new3' and org_id = :'org'));

select t.run('authenticated', :'admin', format(
  $q$insert into fp_join_links (org_id, role, label, expires_at) values (%L, 'occupant', 'Old', now() - interval '1 day')$q$, :'org'));
select token as "old_token" from fp_join_links where label = 'Old' \gset
select t.check('an expired link cannot be used',
  t.run('authenticated', :'new3', format($q$select fp_join_via_link(%L)$q$, :'old_token')) like 'err:%expired%');

select t.check('an admin can revoke a link',
  t.run('authenticated', :'admin', format($q$update fp_join_links set revoked_at = now() where token = %L$q$, :'tech_token')) = 'ok:1');
select t.check('a revoked link cannot be used and says so',
  t.run('authenticated', :'new3', format($q$select fp_join_via_link(%L)$q$, :'tech_token')) like 'err:%revoked%'
  and t.run('anon', null, format($q$select 1 where fp_join_link_info(%L) ->> 'reason' = 'revoked'$q$, :'tech_token')) = 'ok:1');

-- The plan's member limit applies to links too.
update fp_subscriptions set plan_code = 'free' where org_id = :'orgB';
select t.run('authenticated', :'adminB', format(
  $q$insert into fp_join_links (org_id, role, label) values (%L, 'technician', 'B crew')$q$, :'orgB'));
select token as "b_token" from fp_join_links where label = 'B crew' \gset
select fp_plan_limit(:'orgB', 'members') as lim \gset
insert into auth.users (id, email)
  select ('00000000-0000-0000-0000-' || lpad(to_hex(1000 + g), 12, '0'))::uuid, 'filler' || g || '@x.test'
  from generate_series(1, greatest(coalesce(:'lim'::int, 0) - 1, 0)) g;
insert into fp_users_orgs (user_id, org_id, role)
  select ('00000000-0000-0000-0000-' || lpad(to_hex(1000 + g), 12, '0'))::uuid, :'orgB', 'technician'
  from generate_series(1, greatest(coalesce(:'lim'::int, 0) - 1, 0)) g;
select t.check('the plan''s member limit applies to join links (limit ' || :'lim' || ')',
  :'lim' <> '' and t.run('authenticated', :'new3', format($q$select fp_join_via_link(%L)$q$, :'b_token')) like 'err:%plan_limit_reached%');

\ir _report.sql
