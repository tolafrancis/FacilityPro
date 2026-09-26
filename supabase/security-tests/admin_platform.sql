-- Platform admin panel suite (0083). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@platform.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin@platform.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'support@platform.test'),
  ('00000000-0000-0000-0000-0000000000f4', 'analyst@platform.test'),
  ('00000000-0000-0000-0000-0000000000f5', 'gone@platform.test'),
  ('00000000-0000-0000-0000-00000000000a', 'owner@tenant-a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'owner@tenant-b.test');
\set super   '00000000-0000-0000-0000-0000000000f1'
\set padmin  '00000000-0000-0000-0000-0000000000f2'
\set support '00000000-0000-0000-0000-0000000000f3'
\set analyst '00000000-0000-0000-0000-0000000000f4'
\set gone    '00000000-0000-0000-0000-0000000000f5'
\set ownerA  '00000000-0000-0000-0000-00000000000a'
\set ownerB  '00000000-0000-0000-0000-00000000000b'

insert into fp_platform_admins (user_id, role) values
  (:'super', 'super_admin'), (:'padmin', 'admin'), (:'support', 'support'), (:'analyst', 'analyst');
insert into fp_platform_admins (user_id, role, disabled_at) values (:'gone', 'super_admin', now());

select t.run('authenticated', :'ownerA', $q$select fp_create_organization('Tenant A')$q$);
select t.run('authenticated', :'ownerB', $q$select fp_create_organization('Tenant B')$q$);
select id as "orgA" from fp_organizations where name = 'Tenant A' \gset
select id as "orgB" from fp_organizations where name = 'Tenant B' \gset

-- ===========================================================================
-- Roles and permissions
-- ===========================================================================
select t.check('each staff role gets its permissions; tenants and disabled staff get none',
  (select fp_admin_role_permissions('super_admin') @> array['billing.manage', 'team.manage', 'platform.manage'])
  and not ('billing.view' = any (fp_admin_role_permissions('admin')))
  and not ('platform.manage' = any (fp_admin_role_permissions('admin')))
  and 'tenants.impersonate' = any (fp_admin_role_permissions('support'))
  and not ('tenants.manage' = any (fp_admin_role_permissions('support')))
  and fp_admin_role_permissions('analyst') = array['dashboard.view', 'reports.view']
  and cardinality(fp_admin_role_permissions(null)) = 0);
select t.check('the UI learns its own role and permissions',
  t.run('authenticated', :'support', $q$select 1 where fp_admin_permissions() ->> 'role' = 'support'
    and fp_admin_permissions() -> 'permissions' ? 'tickets.manage'$q$) = 'ok:1'
  and t.run('authenticated', :'ownerA', $q$select 1 where fp_admin_permissions() ->> 'role' is null
    and jsonb_array_length(fp_admin_permissions() -> 'permissions') = 0$q$) = 'ok:1'
  and t.run('authenticated', :'gone', $q$select 1 where fp_admin_permissions() ->> 'role' is null$q$) = 'ok:1');
select t.check('only super admins and admins count as platform admins for the older platform functions',
  t.run('authenticated', :'super', $q$select 1 where fp_is_platform_admin()$q$) = 'ok:1'
  and t.run('authenticated', :'padmin', $q$select 1 where fp_is_platform_admin()$q$) = 'ok:1'
  and t.run('authenticated', :'support', $q$select 1 where fp_is_platform_admin()$q$) = 'ok:0'
  and t.run('authenticated', :'gone', $q$select 1 where fp_is_platform_admin()$q$) = 'ok:0');
select t.check('only super admins manage staff accounts',
  t.run('authenticated', :'padmin', format($q$update fp_platform_admins set role = 'super_admin' where user_id = %L$q$, :'padmin')) = 'ok:0'
  and t.run('authenticated', :'super', format($q$update fp_platform_admins set display_name = 'Ana' where user_id = %L$q$, :'analyst')) = 'ok:1'
  and t.run('authenticated', :'ownerA', 'select * from fp_platform_admins') = 'ok:0');

-- ===========================================================================
-- Tenant data
-- ===========================================================================
select t.check('support and admins see every tenant; analysts and tenants do not',
  t.run('authenticated', :'support', 'select * from fp_organizations') = 'ok:2'
  and t.run('authenticated', :'padmin', 'select * from fp_organizations') = 'ok:2'
  and t.run('authenticated', :'analyst', 'select * from fp_organizations') = 'ok:0'
  and t.run('authenticated', :'ownerA', 'select * from fp_organizations') = 'ok:1');
select t.check('a tenant cannot suspend itself or change its platform fields',
  t.run('authenticated', :'ownerA', format($q$update fp_organizations set suspended_at = null, currency = 'USD' where id = %L$q$, :'orgA')) like 'err:%');
select t.check('internal notes are hidden from tenants',
  t.run('authenticated', :'support', format($q$insert into fp_admin_notes (org_id, body) values (%L, 'Called about invoice')$q$, :'orgA')) = 'ok:1'
  and t.run('authenticated', :'ownerA', 'select * from fp_admin_notes') = 'ok:0');

-- ===========================================================================
-- Admin tables are closed to tenants and scoped by permission
-- ===========================================================================
insert into fp_platform_invoices (number, org_id, plan_code, amount, status, provider, paid_at)
  values ('INV-0001', :'orgA', 'pro', 29, 'paid', 'stripe', now());
-- Since 0086 a tenant's org admin also reads their own organisation's invoices.
select t.check('billing staff read all invoices; other staff none; a tenant only its own',
  t.run('authenticated', :'super', 'select * from fp_platform_invoices') = 'ok:1'
  and t.run('authenticated', :'padmin', 'select * from fp_platform_invoices') = 'ok:0'
  and t.run('authenticated', :'ownerA', 'select * from fp_platform_invoices') = 'ok:1'
  and t.run('authenticated', :'ownerB', 'select * from fp_platform_invoices') = 'ok:0');
select t.check('only super admins change platform settings',
  t.run('authenticated', :'super', $q$update fp_platform_settings set maintenance_message = 'Back at 10:00'$q$) = 'ok:1'
  and t.run('authenticated', :'padmin', $q$update fp_platform_settings set maintenance_mode = true$q$) = 'ok:0'
  and t.run('authenticated', :'ownerA', $q$update fp_platform_settings set maintenance_mode = true$q$) = 'ok:0'
  and not (select maintenance_mode from fp_platform_settings));
select t.check('anyone can read the app status (maintenance mode, mobile versions), nothing else',
  t.run('anon', null, $q$select 1 where fp_app_status() ->> 'maintenance_message' = 'Back at 10:00'$q$) = 'ok:1'
  and t.run('anon', null, 'select * from fp_platform_settings') in ('ok:0')
  and t.run('authenticated', :'ownerA', 'select * from fp_platform_settings') in ('ok:0'));
-- Since 0087 staff change tickets only through the ticket functions (due
-- dates, notifications, audit), not by writing the table.
select t.check('tickets: support works them, analysts and tenants cannot see them',
  t.run('authenticated', :'support', format($q$select fp_admin_create_ticket(jsonb_build_object('org_id', %L, 'requester_email', 'owner@alpha.test', 'subject', 'Cannot log in', 'body', 'Password reset email never arrives.'))$q$, :'orgA')) = 'ok:1'
  and t.run('authenticated', :'support', format($q$insert into fp_support_tickets (org_id, subject) values (%L, 'Direct')$q$, :'orgA')) like 'err:%'
  and t.run('authenticated', :'analyst', 'select * from fp_support_tickets') = 'ok:0'
  and t.run('authenticated', :'ownerA', 'select * from fp_support_tickets') = 'ok:0');

-- ===========================================================================
-- Audit trail
-- ===========================================================================
select t.check('every admin change is recorded with who, what, before and after',
  exists (select 1 from fp_admin_audit where admin_id = :'super' and target_type = 'fp_platform_settings'
          and action = 'update' and after ->> 'maintenance_message' = 'Back at 10:00'
          and before ->> 'maintenance_message' is null)
  and exists (select 1 from fp_admin_audit where admin_id = :'support' and target_type = 'fp_admin_notes' and org_id = :'orgA'));
select t.check('only auditors read the trail, and nobody can edit it',
  t.run('authenticated', :'padmin', 'select * from fp_admin_audit') <> 'ok:0'
  and t.run('authenticated', :'support', 'select * from fp_admin_audit') = 'ok:0'
  and t.run('authenticated', :'super', 'delete from fp_admin_audit') in ('ok:0')
  and t.run('authenticated', :'super', $q$update fp_admin_audit set action = 'x'$q$) in ('ok:0')
  and (select count(*) from fp_admin_audit where action = 'x') = 0);

-- ===========================================================================
-- Activity, flags
-- ===========================================================================
select t.run('authenticated', :'ownerA', format($q$select fp_record_activity(%L)$q$, :'orgA'));
select t.run('authenticated', :'ownerA', format($q$select fp_record_activity(%L)$q$, :'orgB'));
select t.check('activity is recorded only for the member''s own organisation',
  (select count(*) from fp_daily_activity where user_id = :'ownerA') = 1
  and (select last_active_at from fp_organizations where id = :'orgA') is not null
  and (select last_active_at from fp_organizations where id = :'orgB') is null);

insert into fp_feature_flags (key, description, enabled, rollout_pct) values ('new_dashboard', 'x', true, 0);
select t.check('a flag at 0% rollout is off; a tenant override turns it on for that tenant only',
  not fp_flag_enabled('new_dashboard', :'orgA'));
insert into fp_feature_flag_overrides (flag_key, org_id, enabled) values ('new_dashboard', :'orgA', true);
select t.check('override wins',
  fp_flag_enabled('new_dashboard', :'orgA') and not fp_flag_enabled('new_dashboard', :'orgB'));
select t.check('a tenant reads only its own flags',
  t.run('authenticated', :'ownerA', format($q$select 1 where (fp_org_flags(%L) ->> 'new_dashboard')::boolean$q$, :'orgA')) = 'ok:1'
  and t.run('authenticated', :'ownerA', format($q$select 1 where fp_org_flags(%L) = '{}'::jsonb$q$, :'orgB')) = 'ok:1');

-- ===========================================================================
-- Events and the dashboard
-- ===========================================================================
-- New organisations start on a Pro trial.
update fp_subscriptions set plan_code = 'business', status = 'active' where org_id = :'orgA';
update fp_subscriptions set plan_code = 'business', status = 'active', billing_interval = 'year' where org_id = :'orgB';
update fp_subscriptions set status = 'canceled' where org_id = :'orgB';
insert into fp_platform_invoices (number, org_id, plan_code, amount, status, provider, failed_at)
  values ('INV-0002', :'orgA', 'pro', 29, 'failed', 'paypal', now());
select t.check('sign-ups, plan changes, cancellations and failed payments appear in the activity feed',
  exists (select 1 from fp_platform_events where type = 'signup' and org_id = :'orgA')
  and exists (select 1 from fp_platform_events where type = 'trial_started' and org_id = :'orgA')
  and exists (select 1 from fp_platform_events where type = 'upgrade' and org_id = :'orgA' and detail ->> 'to' = 'business')
  and exists (select 1 from fp_platform_events where type = 'cancellation' and org_id = :'orgB')
  and exists (select 1 from fp_platform_events where type = 'payment_failed' and org_id = :'orgA')
  and (select canceled_at from fp_subscriptions where org_id = :'orgB') is not null);

select t.run('authenticated', :'analyst', $q$select fp_admin_overview(now() - interval '30 days', now() + interval '1 minute')$q$) as r \gset
select t.check('analysts can open the dashboard', :'r' = 'ok:1');
create temp table ov as select null::jsonb as j limit 0;
grant all on ov to authenticated;
select t.run('authenticated', :'super', $q$insert into ov select fp_admin_overview(now() - interval '30 days', now() + interval '1 minute')$q$);
select t.check('the dashboard counts tenants, users, MRR (paying only), churn, tickets, DAU and the feed',
  (select (j -> 'kpis' ->> 'total_tenants')::int = 2
      and (j -> 'kpis' ->> 'new_tenants')::int = 2
      and (j -> 'kpis' ->> 'total_users')::int = 2
      and (j -> 'kpis' ->> 'mrr')::numeric = 99
      and (j -> 'kpis' ->> 'churned')::int = 1
      and (j -> 'kpis' ->> 'open_tickets')::int = 1
      and (j -> 'kpis' ->> 'dau')::int = 1
      and jsonb_array_length(j -> 'revenue') >= 30
      and (select sum((x ->> 'paid')::numeric) from jsonb_array_elements(j -> 'revenue') x) = 29
      and jsonb_array_length(j -> 'activity') >= 4
      and j -> 'health' ? 'outbox_pending'
   from ov));
select t.check('tenants cannot open the platform dashboard',
  t.run('authenticated', :'ownerA', $q$select fp_admin_overview(now() - interval '30 days', now())$q$) like 'err:%Not authorized%');

\ir _report.sql
