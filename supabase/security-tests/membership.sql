-- Membership suite (0065): last-admin protection and invite emails. Every
-- check states the intended behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'admin2@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test');
\set admin  '00000000-0000-0000-0000-00000000000a'
\set tech   '00000000-0000-0000-0000-0000000000a1'
\set admin2 '00000000-0000-0000-0000-0000000000a3'
\set adminB '00000000-0000-0000-0000-00000000000b'

select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$);
select id as "org"  from fp_organizations where name = 'Org A' \gset
select id as "orgB" from fp_organizations where name = 'Org B' \gset

-- ===========================================================================
-- Invite emails
-- ===========================================================================
select t.run('authenticated', :'admin', format(
  $q$insert into fp_invites (org_id, email, role, token, invited_by) values
     (%L, 'tech@a.test', 'technician', '10000000-0000-0000-0000-000000000001', %L),
     (%L, 'admin2@a.test', 'org_admin', '10000000-0000-0000-0000-000000000002', %L)$q$,
  :'org', :'admin', :'org', :'admin')) as r \gset
select t.check('creating an invite queues an email to the invitee with the accept link',
  :'r' = 'ok:2'
  and exists (select 1 from fp_notification_outbox
              where to_address = 'tech@a.test' and channel = 'email' and org_id = :'org'
                and status = 'pending' and subject like '%Org A%'
                and body like '%{{app_url}}/invite?token=10000000-0000-0000-0000-000000000001%'
                and body like '%admin@a.test%'));
select t.check('invite emails count towards the org''s daily email quota',
  (select count(*) from fp_notification_outbox where org_id = :'org') = 2);
select t.check('members can''t read the queued invite email (it holds the token)',
  t.run('authenticated', :'tech', $q$select * from fp_notification_outbox$q$) = 'ok:0');

select t.run('authenticated', :'tech',   $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);
select t.run('authenticated', :'admin2', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000002')$q$);

-- ===========================================================================
-- Last admin (Org A has two admins, Org B has one)
-- ===========================================================================
select t.check('the only admin cannot demote themselves',
  t.run('authenticated', :'adminB', format(
    $q$update fp_users_orgs set role = 'manager' where org_id = %L and user_id = %L$q$, :'orgB', :'adminB'))
    like 'err:%at least one admin%'
  and (select role from fp_users_orgs where org_id = :'orgB' and user_id = :'adminB') = 'org_admin');
select t.check('the only admin cannot remove themselves',
  t.run('authenticated', :'adminB', format(
    $q$delete from fp_users_orgs where org_id = %L and user_id = %L$q$, :'orgB', :'adminB')) like 'err:%at least one admin%'
  and exists (select 1 from fp_users_orgs where org_id = :'orgB' and user_id = :'adminB'));

select t.run('authenticated', :'admin', format(
  $q$update fp_users_orgs set role = 'manager' where org_id = %L and user_id = %L$q$, :'org', :'admin2')) as r \gset
select t.check('an admin can demote another admin while one remains', :'r' = 'ok:1');
select t.check('...but then cannot demote the last one',
  t.run('authenticated', :'admin', format(
    $q$update fp_users_orgs set role = 'technician' where org_id = %L and user_id = %L$q$, :'org', :'admin'))
    like 'err:%at least one admin%');
select t.check('non-role changes to the last admin''s row still work',
  t.run('authenticated', :'admin', format(
    $q$update fp_users_orgs set role = 'org_admin' where org_id = %L and user_id = %L$q$, :'org', :'admin')) = 'ok:1');
select t.check('other members can still be removed',
  t.run('authenticated', :'admin', format(
    $q$delete from fp_users_orgs where org_id = %L and user_id = %L$q$, :'org', :'tech')) = 'ok:1');

select t.run('authenticated', :'admin', format(
  $q$update fp_users_orgs set role = 'org_admin' where org_id = %L and user_id = %L$q$, :'org', :'admin2')) as r \gset
select t.run('authenticated', :'admin2', format(
  $q$delete from fp_users_orgs where org_id = %L and user_id = %L$q$, :'org', :'admin')) as r2 \gset
select t.check('with a second admin in place, the first can be removed',
  :'r' = 'ok:1' and :'r2' = 'ok:1');

-- ===========================================================================
-- Cascades still work
-- ===========================================================================
delete from auth.users where id = :'adminB';
select t.check('deleting the last admin''s user account still works',
  not exists (select 1 from fp_users_orgs where user_id = :'adminB'));
delete from fp_organizations where id = :'org';
select t.check('deleting an organisation removes its last admin''s membership',
  not exists (select 1 from fp_users_orgs where org_id = :'org'));

\ir _report.sql
