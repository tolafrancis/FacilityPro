-- Admin tenant management suite (0084). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@platform.test', '{}', null),
  ('00000000-0000-0000-0000-0000000000f2', 'admin@platform.test', '{}', null),
  ('00000000-0000-0000-0000-0000000000f3', 'support@platform.test', '{}', null),
  ('00000000-0000-0000-0000-0000000000f4', 'analyst@platform.test', '{}', null),
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test', '{"full_name":"Alpha Owner"}', now()),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@alpha.test', '{}', now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000000b', 'owner@beta.test', '{}', null);
\set super   '00000000-0000-0000-0000-0000000000f1'
\set padmin  '00000000-0000-0000-0000-0000000000f2'
\set support '00000000-0000-0000-0000-0000000000f3'
\set analyst '00000000-0000-0000-0000-0000000000f4'
\set ownerA  '00000000-0000-0000-0000-00000000000a'
\set techA   '00000000-0000-0000-0000-0000000000a1'
\set ownerB  '00000000-0000-0000-0000-00000000000b'

insert into fp_platform_admins (user_id, role) values
  (:'super', 'super_admin'), (:'padmin', 'admin'), (:'support', 'support'), (:'analyst', 'analyst');

select t.run('authenticated', :'ownerA', $q$select fp_create_organization('Alpha Towers')$q$);
select t.run('authenticated', :'ownerB', $q$select fp_create_organization('Beta Clinic')$q$);
select id as "orgA" from fp_organizations where name = 'Alpha Towers' \gset
select id as "orgB" from fp_organizations where name = 'Beta Clinic' \gset
insert into fp_users_orgs (user_id, org_id, role) values (:'techA', :'orgA', 'technician');
insert into fp_requests (org_id, title, body_original, source_lng) values (:'orgA', 'Leak', 'x', 'en');
update fp_organizations set allow_public_requests = true where id = :'orgA';

-- ===========================================================================
-- List
-- ===========================================================================
create temp table j (k text, v jsonb);
grant all on j to authenticated;
select t.run('authenticated', :'support', $q$insert into j select 'all', fp_admin_tenants()$q$);
select t.run('authenticated', :'support', $q$insert into j select 'search', fp_admin_tenants(p_search => 'alpha')$q$);
select t.run('authenticated', :'support', $q$insert into j select 'byusers', fp_admin_tenants(p_sort => 'users', p_desc => true, p_limit => 1)$q$);
select t.check('support lists every tenant with users, plan, status and MRR',
  (select (v ->> 'total')::int = 2 and v -> 'rows' -> 0 ? 'users' and v -> 'rows' -> 0 ? 'mrr' and v -> 'rows' -> 0 ? 'status' from j where k = 'all'));
select t.check('search, sorting and paging happen on the server',
  (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'name' = 'Alpha Towers' from j where k = 'search')
  and (select (v ->> 'total')::int = 2 and jsonb_array_length(v -> 'rows') = 1 and v -> 'rows' -> 0 ->> 'name' = 'Alpha Towers' from j where k = 'byusers'));
select t.check('analysts and tenants cannot list tenants',
  t.run('authenticated', :'analyst', $q$select fp_admin_tenants()$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_tenants()$q$) like 'err:%Not authorized%');

-- ===========================================================================
-- Detail, users, facilities
-- ===========================================================================
select t.run('authenticated', :'support', format($q$insert into j select 'detail', fp_admin_tenant(%L)$q$, :'orgA'));
select t.check('the detail has status, subscription, usage, limits and a health score',
  (select v ->> 'status' = 'trial' and (v -> 'usage' ->> 'members')::int = 2 and (v -> 'usage' ->> 'requests_30d')::int = 1
      and (v -> 'health' ->> 'score')::int between 0 and 100 and v -> 'subscription' ->> 'plan_code' = 'pro'
   from j where k = 'detail'));
select t.check('support sees the tenant''s users with sign-in details; analysts do not',
  t.run('authenticated', :'support', format($q$select * from fp_admin_tenant_users(%L) where email = 'owner@alpha.test' and full_name = 'Alpha Owner' and role = 'org_admin'$q$, :'orgA')) = 'ok:1'
  and t.run('authenticated', :'analyst', format($q$select * from fp_admin_tenant_users(%L)$q$, :'orgA')) like 'err:%');
select t.check('facilities and activity are readable by tenant viewers',
  t.run('authenticated', :'support', format($q$select fp_admin_tenant_facilities(%L)$q$, :'orgA')) = 'ok:1'
  and t.run('authenticated', :'support', format($q$select * from fp_admin_tenant_activity(%L)$q$, :'orgA')) not like 'err:%');

-- ===========================================================================
-- Create and update
-- ===========================================================================
select t.check('support cannot create tenants',
  t.run('authenticated', :'support', $q$select fp_admin_create_tenant('{"name":"Nope"}')$q$) like 'err:%Not authorized%');
select t.run('authenticated', :'padmin', $q$select fp_admin_create_tenant('{"name":"Gamma Hotel","plan_code":"business","trial_days":30,"owner_email":"Boss@Gamma.test","currency":"USD","timezone":"Asia/Bangkok","subdomain":"gamma"}')$q$) as r \gset
select id as "orgC" from fp_organizations where name = 'Gamma Hotel' \gset
select t.check('an admin creates a tenant: trial on the chosen plan, owner invited, starter data, audited',
  :'r' = 'ok:1'
  and (select status = 'trialing' and plan_code = 'business' and trial_ends_at > now() + interval '29 days' from fp_subscriptions where org_id = :'orgC')
  and exists (select 1 from fp_invites where org_id = :'orgC' and email = 'boss@gamma.test' and role = 'org_admin')
  and exists (select 1 from fp_fault_types where org_id = :'orgC')
  and (select currency = 'USD' and subdomain = 'gamma' and settings ->> 'timezone' = 'Asia/Bangkok' from fp_organizations where id = :'orgC')
  and exists (select 1 from fp_admin_audit where action = 'tenant.create' and org_id = :'orgC' and admin_id = :'padmin'));
select t.check('bad input is refused (timezone, email, duplicate subdomain)',
  t.run('authenticated', :'padmin', format($q$select fp_admin_update_tenant(%L, '{"timezone":"Mars/Base"}')$q$, :'orgA')) like 'err:%invalid_timezone%'
  and t.run('authenticated', :'padmin', format($q$select fp_admin_update_tenant(%L, '{"contact_email":"nope"}')$q$, :'orgA')) like 'err:%invalid_email%'
  and t.run('authenticated', :'padmin', format($q$select fp_admin_update_tenant(%L, '{"subdomain":"gamma"}')$q$, :'orgA')) like 'err:%');
select t.run('authenticated', :'padmin', format($q$select fp_admin_update_tenant(%L, '{"contact_name":"Ms Lan","brand_color":"#112233"}')$q$, :'orgA')) as r \gset
select t.check('an update is audited with before and after',
  :'r' = 'ok:1'
  and exists (select 1 from fp_admin_audit where action = 'tenant.update' and org_id = :'orgA'
              and after ->> 'contact_name' = 'Ms Lan' and before ->> 'contact_name' is null));

-- ===========================================================================
-- Suspension closes the organisation to its members
-- ===========================================================================
select t.check('a suspension needs a reason',
  t.run('authenticated', :'padmin', format($q$select fp_admin_set_suspended(%L, true, '')$q$, :'orgA')) like 'err:%reason_required%');
select t.run('authenticated', :'padmin', format($q$select fp_admin_set_suspended(%L, true, 'Unpaid invoices')$q$, :'orgA'));
select t.check('members of a suspended tenant lose access to its data',
  t.run('authenticated', :'ownerA', 'select * from fp_organizations') = 'ok:0'
  and t.run('authenticated', :'ownerA', 'select * from fp_requests') = 'ok:0'
  and t.run('authenticated', :'techA', format($q$insert into fp_requests (org_id, title, body_original, source_lng) values (%L, 'x', 'x', 'en')$q$, :'orgA')) like 'err:%');
select t.check('the app learns why (suspended, with the reason) instead of offering onboarding',
  t.run('authenticated', :'ownerA', $q$select * from fp_my_org_status() where suspended and reason = 'Unpaid invoices'$q$) = 'ok:1');
select t.check('public fault reports and join links stop for a suspended tenant',
  not (select allow_public_requests from fp_organizations where id = :'orgA'));
select t.check('other tenants are unaffected',
  t.run('authenticated', :'ownerB', 'select * from fp_organizations') = 'ok:1');
select t.run('authenticated', :'padmin', format($q$select fp_admin_set_suspended(%L, false)$q$, :'orgA'));
select t.check('reactivating restores access and the public-report setting',
  t.run('authenticated', :'ownerA', 'select * from fp_requests') = 'ok:1'
  and (select allow_public_requests and not settings ? 'public_requests_before_close' from fp_organizations where id = :'orgA')
  and exists (select 1 from fp_platform_events where type = 'unsuspended' and org_id = :'orgA'));
select t.check('bulk suspension counts what it changed',
  t.run('authenticated', :'padmin', format($q$select 1 where fp_admin_bulk_suspend(array[%L, %L]::uuid[], true, 'Audit') = 2$q$, :'orgB', :'orgC')) = 'ok:1');
select t.run('authenticated', :'padmin', format($q$select fp_admin_bulk_suspend(array[%L, %L]::uuid[], false)$q$, :'orgB', :'orgC'));

-- ===========================================================================
-- Delete (soft) and restore
-- ===========================================================================
select t.check('deleting needs the exact name',
  t.run('authenticated', :'padmin', format($q$select fp_admin_delete_tenant(%L, 'beta')$q$, :'orgB')) like 'err:%confirm_name_mismatch%');
select t.run('authenticated', :'padmin', format($q$select fp_admin_delete_tenant(%L, 'Beta Clinic')$q$, :'orgB'));
delete from j;
select t.run('authenticated', :'padmin', $q$insert into j select 'all', fp_admin_tenants()$q$);
select t.run('authenticated', :'padmin', $q$insert into j select 'deleted', fp_admin_tenants(p_status => 'deleted')$q$);
select t.check('a deleted tenant is hidden from the list, closed to members, and its subscription cancelled',
  (select (v ->> 'total')::int = 2 from j where k = 'all')
  and (select (v ->> 'total')::int = 1 from j where k = 'deleted')
  and t.run('authenticated', :'ownerB', 'select * from fp_organizations') = 'ok:0'
  and (select status = 'canceled' from fp_subscriptions where org_id = :'orgB'));
select t.check('a deleted tenant can be restored',
  t.run('authenticated', :'padmin', format($q$select fp_admin_restore_tenant(%L)$q$, :'orgB')) = 'ok:1'
  and t.run('authenticated', :'ownerB', 'select * from fp_organizations') = 'ok:1');

-- ===========================================================================
-- Plan, trial, features
-- ===========================================================================
select t.run('authenticated', :'support', format($q$select fp_admin_change_plan(%L, 'business')$q$, :'orgA')) as r1 \gset
select t.run('authenticated', :'padmin', format($q$select fp_admin_change_plan(%L, 'business', 'year', 'active')$q$, :'orgA')) as r2 \gset
select t.check('support cannot change plans; admins can, and it is recorded',
  :'r1' like 'err:%Not authorized%' and :'r2' = 'ok:1'
  and (select plan_code = 'business' and billing_interval = 'year' and status = 'active' from fp_subscriptions where org_id = :'orgA')
  and exists (select 1 from fp_platform_events where type = 'upgrade' and org_id = :'orgA')
  and exists (select 1 from fp_admin_audit where action = 'tenant.change_plan' and org_id = :'orgA'));
select t.run('authenticated', :'padmin', format($q$select fp_admin_extend_trial(%L, 200)$q$, :'orgB')) as r1 \gset
select t.run('authenticated', :'padmin', format($q$select fp_admin_extend_trial(%L, 10)$q$, :'orgB')) as r2 \gset
select t.check('a trial is extended within 1–90 days',
  :'r1' like 'err:%invalid_days%' and :'r2' = 'ok:1'
  and (select status = 'trialing' and trial_ends_at > now() + interval '9 days' from fp_subscriptions where org_id = :'orgB'));
select t.run('authenticated', :'padmin', format($q$select fp_admin_set_tenant_flag(%L, 'iot', false)$q$, :'orgA')) as r1 \gset
select t.check('a per-tenant feature switch overrides the global setting',
  :'r1' = 'ok:1' and not fp_flag_enabled('iot', :'orgA') and fp_flag_enabled('iot', :'orgB'));
select t.run('authenticated', :'padmin', format($q$select fp_admin_set_tenant_flag(%L, 'iot', null)$q$, :'orgA')) as r2 \gset
select t.check('clearing the switch follows the global setting again', :'r2' = 'ok:1' and fp_flag_enabled('iot', :'orgA'));

-- ===========================================================================
-- Members
-- ===========================================================================
select t.run('authenticated', :'support', format($q$select fp_admin_invite_member(%L, 'x@alpha.test', 'technician')$q$, :'orgA')) as r1 \gset
select t.run('authenticated', :'padmin', format($q$select fp_admin_invite_member(%L, 'New@Alpha.test', 'manager')$q$, :'orgA')) as r2 \gset
select t.check('support cannot invite; admins invite members',
  :'r1' like 'err:%Not authorized%' and :'r2' = 'ok:1'
  and exists (select 1 from fp_invites where org_id = :'orgA' and email = 'new@alpha.test' and role = 'manager'));
select t.run('authenticated', :'padmin', format($q$select fp_admin_set_member_role(%L, %L, 'manager')$q$, :'orgA', :'techA')) as r3 \gset
select t.check('admins change a member''s role',
  :'r3' = 'ok:1' and (select role from fp_users_orgs where org_id = :'orgA' and user_id = :'techA') = 'manager');
select t.run('authenticated', :'padmin', format($q$select fp_admin_remove_member(%L, %L)$q$, :'orgA', :'techA')) as r4 \gset
select t.check('admins remove a member',
  :'r4' = 'ok:1' and not exists (select 1 from fp_users_orgs where org_id = :'orgA' and user_id = :'techA'));
select t.check('the last org admin cannot be removed',
  t.run('authenticated', :'padmin', format($q$select fp_admin_remove_member(%L, %L)$q$, :'orgA', :'ownerA')) like 'err:%');

-- ===========================================================================
-- Recording outside actions
-- ===========================================================================
select t.run('authenticated', :'support', format($q$select fp_admin_record('user.password_reset', %L, 'owner@alpha.test')$q$, :'orgA')) as r \gset
select t.check('staff can record an outside action; tenants cannot; the action name is checked',
  :'r' = 'ok:1'
  and exists (select 1 from fp_admin_audit where action = 'client.user.password_reset' and admin_id = :'support')
  and t.run('authenticated', :'ownerA', format($q$select fp_admin_record('user.password_reset', %L, 'x')$q$, :'orgA')) like 'err:%'
  and t.run('authenticated', :'support', format($q$select fp_admin_record('DROP TABLE', %L, 'x')$q$, :'orgA')) like 'err:%invalid_action%');

\ir _report.sql
