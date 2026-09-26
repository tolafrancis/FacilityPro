-- Admin users suite (0085). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at, email_confirmed_at, phone, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@platform.test', '{}', now(), now(), null, '{}'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin@platform.test', '{}', now(), now(), null, '{}'),
  ('00000000-0000-0000-0000-0000000000f3', 'support@platform.test', '{}', now(), now(), null, '{}'),
  ('00000000-0000-0000-0000-0000000000f4', 'analyst@platform.test', '{}', now(), now(), null, '{}'),
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test', '{"full_name":"Alpha Owner"}', now(), now(), '84901234567', '{"providers":["email"]}'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@alpha.test', '{"full_name":"Tran Tech"}', now() - interval '60 days', now(), null, '{}'),
  ('00000000-0000-0000-0000-0000000000a2', 'new@alpha.test', '{}', null, null, null, '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'loner@nowhere.test', '{}', now(), now(), null, '{}');
\set super   '00000000-0000-0000-0000-0000000000f1'
\set padmin  '00000000-0000-0000-0000-0000000000f2'
\set support '00000000-0000-0000-0000-0000000000f3'
\set analyst '00000000-0000-0000-0000-0000000000f4'
\set ownerA  '00000000-0000-0000-0000-00000000000a'
\set techA   '00000000-0000-0000-0000-0000000000a1'
\set newA    '00000000-0000-0000-0000-0000000000a2'
\set loner   '00000000-0000-0000-0000-00000000000c'

insert into fp_platform_admins (user_id, role) values
  (:'super', 'super_admin'), (:'padmin', 'admin'), (:'support', 'support'), (:'analyst', 'analyst');

select t.run('authenticated', :'ownerA', $q$select fp_create_organization('Alpha Towers')$q$);
select id as "orgA" from fp_organizations where name = 'Alpha Towers' \gset
insert into fp_users_orgs (user_id, org_id, role) values (:'techA', :'orgA', 'technician'), (:'newA', :'orgA', 'occupant');

-- Sessions, refresh tokens, 2FA and sign-ins for the technician.
insert into auth.sessions (id, user_id, aal, refreshed_at, user_agent, ip) values
  ('10000000-0000-0000-0000-000000000001', :'techA', 'aal1', now()::timestamp, 'Mozilla/5.0 (iPhone)', '203.0.113.7'),
  ('10000000-0000-0000-0000-000000000002', :'techA', 'aal2', null, 'Chrome', '198.51.100.2'),
  ('10000000-0000-0000-0000-000000000003', :'ownerA', 'aal1', null, 'Firefox', '192.0.2.1');
insert into auth.refresh_tokens (token, user_id, session_id) values
  ('tok-1', :'techA', '10000000-0000-0000-0000-000000000001'), ('tok-2', :'techA', null), ('tok-3', :'ownerA', '10000000-0000-0000-0000-000000000003');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret) values
  ('20000000-0000-0000-0000-000000000001', :'techA', 'Phone app', 'totp', 'verified', 'SECRET-SEED');
insert into auth.audit_log_entries (id, payload, created_at, ip_address) values
  (gen_random_uuid(), json_build_object('action', 'login', 'actor_id', :'techA'), now() - interval '1 hour', '203.0.113.7'),
  (gen_random_uuid(), json_build_object('action', 'login', 'actor_id', :'ownerA'), now(), '192.0.2.1'),
  (gen_random_uuid(), json_build_object('action', 'token_refreshed', 'actor_id', :'techA'), now(), '203.0.113.7');

create temp table j (k text, v jsonb);
grant all on j to authenticated;

-- ===========================================================================
-- List
-- ===========================================================================
select t.run('authenticated', :'support', $q$insert into j select 'all', fp_admin_users(p_limit => 100)$q$);
select t.run('authenticated', :'support', $q$insert into j select 'search', fp_admin_users(p_search => 'alpha towers')$q$);
select t.run('authenticated', :'support', $q$insert into j select 'name', fp_admin_users(p_search => 'tran')$q$);
select t.run('authenticated', :'support', $q$insert into j select 'unconfirmed', fp_admin_users(p_status => 'unconfirmed')$q$);
select t.run('authenticated', :'support', $q$insert into j select 'inactive', fp_admin_users(p_status => 'inactive')$q$);
select t.run('authenticated', :'support', $q$insert into j select 'noorg', fp_admin_users(p_status => 'no_org')$q$);
select t.run('authenticated', :'support', $q$insert into j select 'staff', fp_admin_users(p_status => 'staff')$q$);
select t.run('authenticated', :'support', $q$insert into j select 'role', fp_admin_users(p_role => 'technician')$q$);
select t.run('authenticated', :'support', format($q$insert into j select 'org', fp_admin_users(p_org => %L, p_sort => 'email', p_desc => false, p_limit => 1)$q$, :'orgA'));

select t.check('support lists every account with tenants, status and 2FA',
  (select (v ->> 'total')::int = 8 from j where k = 'all')
  and (select r ->> 'status' = 'active' and (r ->> 'mfa')::boolean and (r ->> 'orgs')::int = 1
             and r -> 'memberships' -> 0 ->> 'name' = 'Alpha Towers' and r -> 'memberships' -> 0 ->> 'role' = 'technician'
       from j, jsonb_array_elements(v -> 'rows') r where k = 'all' and r ->> 'email' = 'tech@alpha.test'));
select t.check('search matches email, name and tenant name',
  (select (v ->> 'total')::int = 3 from j where k = 'search')
  and (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'email' = 'tech@alpha.test' from j where k = 'name'));
select t.check('status filters: unconfirmed, inactive for 30 days, no tenant, staff',
  (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'email' = 'new@alpha.test' from j where k = 'unconfirmed')
  and (select (v ->> 'total')::int = 2 from j where k = 'inactive')
  and (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'email' = 'loner@nowhere.test' from j where k = 'noorg')
  and (select (v ->> 'total')::int = 4 and v -> 'rows' -> 0 ->> 'staff_role' is not null from j where k = 'staff'));
select t.check('role and tenant filters, sorting and paging happen on the server',
  (select (v ->> 'total')::int = 1 from j where k = 'role')
  and (select (v ->> 'total')::int = 3 and jsonb_array_length(v -> 'rows') = 1 and v -> 'rows' -> 0 ->> 'email' = 'new@alpha.test' from j where k = 'org'));
select t.check('analysts and tenants cannot list users',
  t.run('authenticated', :'analyst', $q$select fp_admin_users()$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_users()$q$) like 'err:%Not authorized%');

-- ===========================================================================
-- Detail
-- ===========================================================================
select t.run('authenticated', :'support', format($q$insert into j select 'detail', fp_admin_user(%L)$q$, :'techA'));
select t.check('the detail has profile, tenants, 2FA, sessions and sign-ins',
  (select v -> 'user' ->> 'full_name' = 'Tran Tech' and v -> 'memberships' -> 0 ->> 'role' = 'technician'
      and jsonb_array_length(v -> 'mfa') = 1 and v -> 'mfa' -> 0 ->> 'type' = 'totp'
      and jsonb_array_length(v -> 'sessions') = 2 and v -> 'sessions' -> 0 ->> 'ip' = '203.0.113.7'
      and jsonb_array_length(v -> 'logins') = 1 and v -> 'logins' -> 0 ->> 'action' = 'login'
   from j where k = 'detail'));
select t.check('the detail never includes secrets (factor seeds, tokens)',
  (select v::text not like '%SECRET-SEED%' and v::text not like '%tok-1%' from j where k = 'detail'));
select t.check('an unknown account is "not found"; analysts cannot read accounts',
  t.run('authenticated', :'support', $q$select fp_admin_user('99999999-0000-0000-0000-000000000000')$q$) like 'err:%not found%'
  and t.run('authenticated', :'analyst', format($q$select fp_admin_user(%L)$q$, :'techA')) like 'err:%Not authorized%');

-- ===========================================================================
-- Actions
-- ===========================================================================
select t.check('support cannot ban, sign out, reset 2FA or confirm',
  t.run('authenticated', :'support', format($q$select fp_admin_ban_user(%L, 'spam', 7)$q$, :'techA')) like 'err:%Not authorized%'
  and t.run('authenticated', :'support', format($q$select fp_admin_sign_out_user(%L)$q$, :'techA')) like 'err:%Not authorized%'
  and t.run('authenticated', :'support', format($q$select fp_admin_reset_mfa(%L)$q$, :'techA')) like 'err:%Not authorized%'
  and t.run('authenticated', :'support', format($q$select fp_admin_confirm_email(%L)$q$, :'newA')) like 'err:%Not authorized%');
select t.check('staff accounts and your own account are refused',
  t.run('authenticated', :'padmin', format($q$select fp_admin_ban_user(%L, 'nope', 1)$q$, :'super')) like 'err:%staff_account%'
  and t.run('authenticated', :'padmin', format($q$select fp_admin_sign_out_user(%L)$q$, :'padmin')) like 'err:%own_account%');
select t.check('a ban needs a reason and a sensible length',
  t.run('authenticated', :'padmin', format($q$select fp_admin_ban_user(%L, ' ', 7)$q$, :'techA')) like 'err:%reason_required%'
  and t.run('authenticated', :'padmin', format($q$select fp_admin_ban_user(%L, 'spam', 0)$q$, :'techA')) like 'err:%invalid_days%');

select t.run('authenticated', :'padmin', format($q$select fp_admin_ban_user(%L, 'Abusive messages', 7)$q$, :'techA')) as r \gset
select t.check('a ban blocks sign-in for the chosen days, ends every session and is audited',
  :'r' = 'ok:1'
  and (select banned_until between now() + interval '6 days' and now() + interval '8 days' from auth.users where id = :'techA')
  and not exists (select 1 from auth.sessions where user_id = :'techA')
  and not exists (select 1 from auth.refresh_tokens where user_id = :'techA')
  and exists (select 1 from auth.sessions where user_id = :'ownerA')
  and exists (select 1 from fp_admin_audit where action = 'user.ban' and target_id = :'techA' and admin_id = :'padmin'
              and after ->> 'reason' = 'Abusive messages'));
select t.run('authenticated', :'support', format($q$insert into j select 'banned', fp_admin_users(p_status => 'banned')$q$));
select t.check('banned accounts show as banned, in the list and on the tenant''s user list',
  (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'email' = 'tech@alpha.test' from j where k = 'banned')
  and t.run('authenticated', :'support', format($q$select * from fp_admin_tenant_users(%L) where email = 'tech@alpha.test' and banned$q$, :'orgA')) = 'ok:1');

select t.run('authenticated', :'padmin', format($q$select fp_admin_ban_user(%L, 'Left the company', null)$q$, :'newA')) as r \gset
select t.check('a ban without a length lasts until it is lifted',
  :'r' = 'ok:1' and (select banned_until > now() + interval '50 years' from auth.users where id = :'newA'));

select t.run('authenticated', :'padmin', format($q$select fp_admin_unban_user(%L)$q$, :'techA')) as r \gset
select t.check('unbanning lifts the ban and is audited',
  :'r' = 'ok:1' and (select banned_until is null from auth.users where id = :'techA')
  and exists (select 1 from fp_admin_audit where action = 'user.unban' and target_id = :'techA'));

select t.run('authenticated', :'padmin', format($q$select fp_admin_sign_out_user(%L)$q$, :'ownerA')) as r \gset
select t.check('sign out everywhere ends the account''s sessions and refresh tokens',
  :'r' = 'ok:1' and not exists (select 1 from auth.sessions where user_id = :'ownerA')
  and not exists (select 1 from auth.refresh_tokens where user_id = :'ownerA')
  and exists (select 1 from fp_admin_audit where action = 'user.sign_out' and target_id = :'ownerA' and (after ->> 'sessions')::int = 1));

select t.run('authenticated', :'padmin', format($q$select fp_admin_reset_mfa(%L)$q$, :'techA')) as r \gset
select t.check('resetting 2FA removes the account''s factors and is audited',
  :'r' = 'ok:1' and not exists (select 1 from auth.mfa_factors where user_id = :'techA')
  and exists (select 1 from fp_admin_audit where action = 'user.reset_mfa' and target_id = :'techA'));

select t.run('authenticated', :'padmin', format($q$select fp_admin_confirm_email(%L)$q$, :'newA')) as r \gset
select t.check('staff can mark an email address confirmed',
  :'r' = 'ok:1' and (select email_confirmed_at is not null from auth.users where id = :'newA')
  and exists (select 1 from fp_admin_audit where action = 'user.confirm_email' and target_id = :'newA'));

select t.run('authenticated', :'support', format($q$insert into j select 'after', fp_admin_user(%L)$q$, :'techA'));
select t.check('the account''s page lists what staff did to it, with who did it',
  (select jsonb_array_length(v -> 'admin_actions') >= 3
          and exists (select 1 from jsonb_array_elements(v -> 'admin_actions') a
                      where a ->> 'action' = 'user.ban' and a ->> 'actor_email' = 'admin@platform.test')
   from j where k = 'after'));

select t.check('tenants cannot call account actions',
  t.run('authenticated', :'ownerA', format($q$select fp_admin_ban_user(%L, 'spam', 1)$q$, :'techA')) like 'err:%Not authorized%'
  and t.run('anon', null, format($q$select fp_admin_sign_out_user(%L)$q$, :'techA')) like 'err:%');

\ir _report.sql
