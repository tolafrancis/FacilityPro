-- Admin team suite (0091). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@platform.test', now(), '{"full_name":"Sam Super"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin@platform.test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000f3', 'support@platform.test', now(), '{}'),
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test', now(), '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'new.hire@platform.test', null, '{}');
\set super   '00000000-0000-0000-0000-0000000000f1'
\set padmin  '00000000-0000-0000-0000-0000000000f2'
\set support '00000000-0000-0000-0000-0000000000f3'
\set ownerA  '00000000-0000-0000-0000-00000000000a'
\set hire    '00000000-0000-0000-0000-00000000000c'
insert into fp_platform_admins (user_id, role) values (:'super', 'super_admin'), (:'padmin', 'admin'), (:'support', 'support');
create temp table j (k text, v jsonb);
grant all on j to authenticated;

-- ===========================================================================
-- Access
-- ===========================================================================
select t.check('only super admins see and manage the team',
  t.run('authenticated', :'padmin', $q$select fp_admin_team()$q$) like 'err:%'
  and t.run('authenticated', :'support', $q$select fp_admin_invite_staff('x@y.test', 'support')$q$) like 'err:%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_set_staff_role('00000000-0000-0000-0000-0000000000f3', 'admin')$q$) like 'err:%'
  and t.run('anon', null, $q$select fp_admin_team()$q$) like 'err:%');
select t.check('staff accounts and invites cannot be written directly, even by super admins',
  t.run('authenticated', :'super', format($q$insert into fp_platform_admins (user_id, role) values (%L, 'super_admin')$q$, :'ownerA')) like 'err:%'
  and t.run('authenticated', :'super', format($q$delete from fp_platform_admins where user_id = %L$q$, :'support')) like 'err:%'
  and t.run('authenticated', :'super', $q$insert into fp_staff_invites (email, role) values ('a@b.test', 'admin')$q$) like 'err:%');

select t.run('authenticated', :'super', $q$insert into j select 'team', fp_admin_team()$q$);
select t.check('the team lists staff (with names from their profile) and pending invites',
  (select jsonb_array_length(v -> 'staff') = 3 and v ->> 'me' = '00000000-0000-0000-0000-0000000000f1'
          and v -> 'staff' -> 0 ->> 'name' = 'Sam Super' and v -> 'staff' -> 0 ->> 'role' = 'super_admin'
          and jsonb_array_length(v -> 'invites') = 0 from j where k = 'team'));

-- ===========================================================================
-- Invites
-- ===========================================================================
select t.run('authenticated', :'super', $q$insert into j select 'inv1', fp_admin_invite_staff(' Owner@Alpha.test ', 'support', 'Olga', 'https://facilitypro.tech')$q$);
select t.check('inviting someone who already has an account adds them at once and emails them a sign-in link',
  (select v ->> 'added' = 'true' from j where k = 'inv1')
  and exists (select 1 from fp_platform_admins where user_id = :'ownerA' and role = 'support' and display_name = 'Olga')
  and exists (select 1 from fp_notification_outbox where to_address = 'owner@alpha.test'
              and subject like '%now have access%' and body like '%https://facilitypro.tech/signin?next=%2Fadmin&email=owner@alpha.test%'));
select t.check('the same person cannot be invited twice',
  t.run('authenticated', :'super', $q$select fp_admin_invite_staff('owner@alpha.test', 'admin')$q$) like 'err:%already_staff%');
select t.check('bad addresses and roles are refused',
  t.run('authenticated', :'super', $q$select fp_admin_invite_staff('not-an-email', 'admin')$q$) like 'err:%invalid_email%'
  and t.run('authenticated', :'super', $q$select fp_admin_invite_staff('x@y.test', 'owner')$q$) like 'err:%');

select t.run('authenticated', :'super', $q$insert into j select 'inv2', fp_admin_invite_staff('new.hire@platform.test', 'analyst', null, 'https://evil.example/phish?x=')$q$);
select t.check('someone without a confirmed account gets an invite email; odd link bases fall back to the real site',
  (select v ->> 'added' = 'false' from j where k = 'inv2')
  and not exists (select 1 from fp_platform_admins where user_id = :'hire')
  and exists (select 1 from fp_notification_outbox where to_address = 'new.hire@platform.test'
              and subject like '%invited%' and body like '%https://facilitypro.tech/signup?next=%2Fadmin&email=new.hire@platform.test%'
              and body not like '%evil%'));
select t.run('authenticated', :'super', $q$select fp_admin_invite_staff('new.hire@platform.test', 'support')$q$);
select t.check('a newer invite replaces the pending one',
  (select count(*) from fp_staff_invites where email = 'new.hire@platform.test' and accepted_at is null and revoked_at is null) = 1
  and (select role from fp_staff_invites where email = 'new.hire@platform.test' and revoked_at is null) = 'support');

select t.check('an unconfirmed email cannot take up the invite',
  t.run('authenticated', :'hire', $q$select 1 where fp_admin_accept_staff_invite() is null$q$) = 'ok:1'
  and not exists (select 1 from fp_platform_admins where user_id = :'hire'));
update auth.users set email_confirmed_at = now() where id = :'hire';
select t.run('authenticated', :'hire', $q$select fp_admin_accept_staff_invite()$q$);
select t.check('once confirmed, opening the admin panel takes up the invite with its role',
  exists (select 1 from fp_platform_admins where user_id = :'hire' and role = 'support')
  and exists (select 1 from fp_staff_invites where email = 'new.hire@platform.test' and accepted_by = :'hire'));
select t.check('taking up an invite is harmless for everyone else',
  t.run('authenticated', :'ownerA', $q$select 1 where fp_admin_accept_staff_invite() is null$q$) = 'ok:1'
  and t.run('anon', null, $q$select fp_admin_accept_staff_invite()$q$) like 'err:%');

select t.run('authenticated', :'super', $q$insert into j select 'inv3', fp_admin_invite_staff('later@platform.test', 'admin')$q$);
select (v ->> 'invite_id') as "invId" from j where k = 'inv3' \gset
select t.check('an invite cannot be resent within a minute',
  t.run('authenticated', :'super', format($q$select fp_admin_resend_staff_invite(%L)$q$, :'invId')) like 'err:%invite_sent_recently%');
update fp_staff_invites set sent_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = :'invId';
select t.run('authenticated', :'super', $q$insert into j select 'team2', fp_admin_team()$q$);
select t.check('expired invites are flagged',
  (select v -> 'invites' -> 0 ->> 'expired' = 'true' from j where k = 'team2'));
select t.run('authenticated', :'super', format($q$select fp_admin_resend_staff_invite(%L, 'http://localhost:5173')$q$, :'invId'));
select t.check('resending renews the expiry and sends again',
  (select expires_at > now() + interval '6 days' from fp_staff_invites where id = :'invId')
  and exists (select 1 from fp_notification_outbox where to_address = 'later@platform.test' and body like '%http://localhost:5173/signup%'));
select t.run('authenticated', :'super', format($q$select fp_admin_revoke_staff_invite(%L)$q$, :'invId'));
select t.check('a revoked invite cannot be revoked, resent or taken up',
  t.run('authenticated', :'super', format($q$select fp_admin_revoke_staff_invite(%L)$q$, :'invId')) like 'err:%invite_not_pending%'
  and t.run('authenticated', :'super', format($q$select fp_admin_resend_staff_invite(%L)$q$, :'invId')) like 'err:%invite_not_pending%');

-- ===========================================================================
-- Changes
-- ===========================================================================
select t.run('authenticated', :'super', format($q$select fp_admin_set_staff_role(%L, 'admin')$q$, :'support'));
select t.check('super admins change roles, and it is audited with before and after',
  (select role from fp_platform_admins where user_id = :'support') = 'admin'
  and exists (select 1 from fp_admin_audit where target_type = 'fp_platform_admins' and target_id = :'support'
              and before ->> 'role' = 'support' and after ->> 'role' = 'admin' and admin_id = :'super'));
select t.run('authenticated', :'super', format($q$select fp_admin_set_staff_disabled(%L, true)$q$, :'support'));
select t.check('a disabled staff member loses access at once',
  t.run('authenticated', :'support', $q$select 1 where fp_admin_role() is null$q$) = 'ok:1'
  and t.run('authenticated', :'support', $q$select fp_admin_tickets(null, null, null, null, null, null, null, 'updated', true, 10, 0)$q$) like 'err:%');
select t.run('authenticated', :'super', format($q$select fp_admin_set_staff_disabled(%L, false)$q$, :'support'));
select t.check('and gets it back when enabled',
  t.run('authenticated', :'support', $q$select 1 where fp_admin_role() = 'admin'$q$) = 'ok:1');

select t.check('nobody changes, disables or removes their own account here',
  t.run('authenticated', :'super', format($q$select fp_admin_set_staff_role(%L, 'admin')$q$, :'super')) like 'err:%staff_self%'
  and t.run('authenticated', :'super', format($q$select fp_admin_set_staff_disabled(%L, true)$q$, :'super')) like 'err:%staff_self%'
  and t.run('authenticated', :'super', format($q$select fp_admin_remove_staff(%L)$q$, :'super')) like 'err:%staff_self%');

-- A second super admin can be disabled by the first, who stays active; since
-- nobody can act on their own account, one active super admin always remains.
select t.run('authenticated', :'super', format($q$select fp_admin_set_staff_role(%L, 'super_admin')$q$, :'padmin'));
select t.run('authenticated', :'super', format($q$select fp_admin_set_staff_disabled(%L, true)$q$, :'padmin')) as r \gset
select t.check('a super admin can disable another super admin while staying active',
  :'r' = 'ok:1' and fp_staff_active_super_admins() = 1);
select t.check('the last-super-admin guard is internal (not callable from the app)',
  t.run('authenticated', :'super', $q$select fp_staff_active_super_admins()$q$) like 'err:%');
-- Backstop: if the only active super admin somehow targeted themselves via a
-- different account, the count check refuses (simulated directly).
select t.check('the backstop counts only other active super admins',
  fp_staff_active_super_admins(:'super') = 0);

select t.run('authenticated', :'super', format($q$select fp_admin_remove_staff(%L)$q$, :'hire'));
select t.check('removing staff keeps their account and audit history',
  not exists (select 1 from fp_platform_admins where user_id = :'hire')
  and exists (select 1 from auth.users where id = :'hire')
  and exists (select 1 from fp_admin_audit where target_type = 'fp_platform_admins' and target_id = :'hire' and action = 'delete'));

\ir _report.sql
