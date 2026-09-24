-- Security regression suite for the audit's Blocker findings (S2-B1..B6).
-- Every check states the SECURE behaviour, so on a vulnerable schema the
-- attack checks FAIL and on a fixed one everything PASSes. "legit" checks
-- guard against the fix breaking normal use.
--
-- Run with supabase/security-tests/run.sh (fresh DB + shim + all migrations + this).

\ir _harness.sql

-- ---------------------------------------------------------------------------
-- Fixture: two orgs. A = adminA, techA (technician), occA (occupant).
--                    B = adminB, techB. Plus a platform operator.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech-a@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'occ-a@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin-b@b.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'tech-b@b.test'),
  ('00000000-0000-0000-0000-0000000000f0', 'ops@platform.test');

\set adminA '00000000-0000-0000-0000-00000000000a'
\set techA  '00000000-0000-0000-0000-0000000000a1'
\set occA   '00000000-0000-0000-0000-0000000000a2'
\set adminB '00000000-0000-0000-0000-00000000000b'
\set techB  '00000000-0000-0000-0000-0000000000b1'
\set ops    '00000000-0000-0000-0000-0000000000f0'

select t.check('legit: create org A via RPC',
  t.run('authenticated', :'adminA', $q$select fp_create_organization('Org A')$q$) like 'ok:%');
select t.check('legit: create org B via RPC',
  t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$) like 'ok:%');

select id as "orgA" from fp_organizations where name = 'Org A' \gset
select id as "orgB" from fp_organizations where name = 'Org B' \gset

-- Members join via invites (the only supported path).
insert into fp_invites (org_id, email, role, token) values
  (:'orgA', 'tech-a@a.test', 'technician', '10000000-0000-0000-0000-000000000001'),
  (:'orgA', 'occ-a@a.test',  'occupant',   '10000000-0000-0000-0000-000000000002'),
  (:'orgB', 'tech-b@b.test', 'technician', '10000000-0000-0000-0000-000000000003'),
  (:'orgB', 'tech-a@a.test', 'vendor',     '10000000-0000-0000-0000-000000000004');
select t.check('legit: technician accepts invite',
  t.run('authenticated', :'techA', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$) like 'ok:%');
select t.run('authenticated', :'occA',  $q$select fp_accept_invite('10000000-0000-0000-0000-000000000002')$q$);
select t.run('authenticated', :'techB', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000003')$q$);
-- techA also contracts for org B (vendor role there).
select t.run('authenticated', :'techA', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000004')$q$);

-- Operational data (inserted as the owner; RLS is what's under test).
insert into fp_assets (id, org_id, name_i18n) values
  ('20000000-0000-0000-0000-00000000000a', :'orgA', '{"en":"Chiller A"}'),
  ('20000000-0000-0000-0000-00000000000b', :'orgB', '{"en":"Pump B"}');
insert into fp_parts (id, org_id, name_i18n, stock_balance, unit_cost) values
  ('30000000-0000-0000-0000-00000000000a', :'orgA', '{"en":"Filter A"}', 10, 5),
  ('30000000-0000-0000-0000-00000000000b', :'orgB', '{"en":"Seal B"}',   10, 5);
insert into fp_work_orders (id, org_id, title, assigned_to, status) values
  ('40000000-0000-0000-0000-00000000000a', :'orgA', 'WO A', :'techA', 'assigned'),
  ('40000000-0000-0000-0000-00000000000b', :'orgB', 'WO B', :'techB', 'assigned');
insert into fp_meters (id, org_id, asset_id, name_i18n) values
  ('50000000-0000-0000-0000-00000000000a', :'orgA', '20000000-0000-0000-0000-00000000000a', '{"en":"Hours"}');
insert into fp_devices (id, org_id, name, device_key) values
  ('60000000-0000-0000-0000-00000000000b', :'orgB', 'Sensor B', 'devkeyB');
insert into fp_finance_procurement (id, org_id, title) values
  ('70000000-0000-0000-0000-00000000000a', :'orgA', 'PO A'),
  ('70000000-0000-0000-0000-00000000000b', :'orgB', 'PO B');
insert into fp_procurement_lines (id, org_id, procurement_id, part_id, description, quantity, unit_cost) values
  ('71000000-0000-0000-0000-00000000000a', :'orgA', '70000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-00000000000a', 'Filters', 5, 5);
insert into fp_procurement_receipts (id, org_id, procurement_id) values
  ('72000000-0000-0000-0000-00000000000b', :'orgB', '70000000-0000-0000-0000-00000000000b');

-- ===========================================================================
-- S2-B1: membership self-escalation / cross-org takeover
-- ===========================================================================
select t.run('authenticated', :'techA',
  $q$update fp_users_orgs set role = 'org_admin' where user_id = auth.uid()$q$);
select t.check('B1: technician cannot promote self to org_admin',
  not exists (select 1 from fp_users_orgs where user_id = :'techA' and role = 'org_admin'));

select t.run('authenticated', :'adminB', format(
  $q$update fp_users_orgs set org_id = %L, role = 'org_admin' where user_id = auth.uid()$q$, :'orgA'));
select t.check('B1: admin of B cannot move own membership into org A',
  not exists (select 1 from fp_users_orgs where user_id = :'adminB' and org_id = :'orgA'));

select t.run('authenticated', :'adminA', format(
  $q$insert into fp_users_orgs (user_id, org_id, role) values (%L, %L, 'manager')$q$, :'techB', :'orgA'));
select t.check('B1: admin cannot add an arbitrary existing user without an invite',
  not exists (select 1 from fp_users_orgs where user_id = :'techB' and org_id = :'orgA'));

select t.run('authenticated', :'adminA', format(
  $q$update fp_users_orgs set role = 'super_admin' where user_id = %L$q$, :'techA'));
select t.check('B1: org admin cannot grant super_admin',
  (select role from fp_users_orgs where user_id = :'techA' and org_id = :'orgA') <> 'super_admin');

select t.run('authenticated', :'adminA', format(
  $q$update fp_users_orgs set role = 'manager' where user_id = %L and org_id = %L$q$, :'techA', :'orgA'));
select t.check('legit: org admin can change a member''s role',
  (select role from fp_users_orgs where user_id = :'techA' and org_id = :'orgA') = 'manager');
update fp_users_orgs set role = 'technician' where user_id = :'techA' and org_id = :'orgA';
update fp_users_orgs set role = 'vendor' where user_id = :'techA' and org_id = :'orgB';

-- Undo any B1 exploit that succeeded, so later sections test independently.
delete from fp_users_orgs where org_id = :'orgA' and user_id in (:'adminB', :'techB');
insert into fp_users_orgs (user_id, org_id, role) values (:'adminB', :'orgB', 'org_admin')
  on conflict (user_id, org_id) do nothing;

-- ===========================================================================
-- S2-B2: internal SECURITY DEFINER functions reachable from the API
-- ===========================================================================
select t.run('anon', null, format($q$select fp_wf_notify(%L, '', 'Security alert', 'click evil.test')$q$, :'orgA'));
select t.check('B2: anon cannot inject notifications via fp_wf_notify',
  not exists (select 1 from fp_notifications where title = 'Security alert'));

select t.run('anon', null, format(
  $q$select fp_run_workflow_action(%L, '{"type":"send_email","target":"victim@evil.test","value":"spam"}', '{}')$q$, :'orgA'));
select t.check('B2: anon cannot queue email via fp_run_workflow_action',
  not exists (select 1 from fp_notification_outbox where to_address = 'victim@evil.test'));

select t.run('anon', null, format(
  $q$select fp_run_workflow_action(%L, '{"type":"assign","target":"%s"}', '{"work_order":"40000000-0000-0000-0000-00000000000a"}')$q$,
  :'orgA', :'occA'));
select t.check('B2: anon cannot reassign work orders via fp_run_workflow_action',
  (select assigned_to from fp_work_orders where id = '40000000-0000-0000-0000-00000000000a') = :'techA');

select t.check('B2: anon cannot run cron fp_generate_due_pm()',
  t.run('anon', null, $q$select fp_generate_due_pm()$q$) like 'err:%');
select t.check('B2: anon cannot run cron fp_escalate_overdue()',
  t.run('anon', null, $q$select fp_escalate_overdue()$q$) like 'err:%');
select t.check('B2: anon cannot run cron fp_send_expiry_reminders()',
  t.run('anon', null, $q$select fp_send_expiry_reminders()$q$) like 'err:%');
select t.check('B2: authenticated user cannot run cron across all orgs',
  t.run('authenticated', :'adminB', $q$select fp_generate_due_pm()$q$) like 'err:%');
select t.check('B2: member of B cannot run org A workflows via fp_run_workflows',
  t.run('authenticated', :'adminB', format($q$select fp_run_workflows(%L, 'service_request', null, '{}')$q$, :'orgA')) like 'err:%');
select t.check('B2: anon cannot call fp_seed_default_fault_types',
  t.run('anon', null, format($q$select fp_seed_default_fault_types(%L)$q$, :'orgA')) like 'err:%');
select t.check('B2: member of B cannot burn org A PO numbers',
  t.run('authenticated', :'adminB', format($q$select fp_next_po_number(%L)$q$, :'orgA')) like 'err:%');

-- Legit entry points must still work.
select t.check('legit: anon can load public report context',
  t.run('anon', null, format($q$select fp_public_context(%L)$q$, :'orgA')) like 'ok:%');
select t.check('legit: anon device can ingest with its key',
  t.run('anon', null, $q$select fp_device_ingest('devkeyB', 'temp', 21.5)$q$) like 'ok:%');
select t.check('legit: manager can generate PM for own org',
  t.run('authenticated', :'adminA', format($q$select fp_generate_due_pm(%L)$q$, :'orgA')) like 'ok:%');
select t.check('legit: service_role cron can generate PM for all orgs',
  t.run('service_role', null, $q$select fp_generate_due_pm()$q$) like 'ok:%');
select t.check('legit: pg_cron (no JWT at all) can run the scheduled jobs',
  t.run('postgres', null, $q$select fp_generate_due_pm(), fp_escalate_overdue(), fp_send_expiry_reminders()$q$) like 'ok:%');
select t.check('legit: technician still cannot generate PM',
  t.run('authenticated', :'techA', format($q$select fp_generate_due_pm(%L)$q$, :'orgA')) like 'err:%');
select t.check('legit: member can list org members',
  t.run('authenticated', :'techA', format($q$select * from fp_org_members(%L)$q$, :'orgA')) = 'ok:3');
select t.check('legit: manager can get a PO number for own org',
  t.run('authenticated', :'adminA', format($q$select fp_next_po_number(%L)$q$, :'orgA')) like 'ok:%');
select t.check('legit: RLS still scopes reads (org B tech cannot see org A work orders)',
  t.run('authenticated', :'techB', $q$select * from fp_work_orders$q$) = 'ok:1');

-- ===========================================================================
-- S2-B3: customers self-activating paid plans
-- ===========================================================================
select t.run('authenticated', :'adminA', format(
  $q$insert into fp_subscriptions (org_id, plan_code, status, current_period_end)
     values (%L, 'business', 'active', '2099-01-01')
     on conflict (org_id) do update set plan_code = 'business', status = 'active', current_period_end = '2099-01-01'$q$, :'orgA'));
select t.check('B3: org admin cannot activate a paid plan on their own subscription',
  not exists (select 1 from fp_subscriptions where org_id = :'orgA' and plan_code = 'business' and status = 'active'));

select t.run('authenticated', :'adminA', format(
  $q$update fp_organizations set subscription_tier = 'business' where id = %L$q$, :'orgA'));
select t.check('B3: org admin cannot change subscription_tier',
  (select subscription_tier from fp_organizations where id = :'orgA') = 'trial');

select t.check('legit: org admin can still edit org settings',
  t.run('authenticated', :'adminA', format(
    $q$update fp_organizations set name = 'Org A', allow_public_requests = true, settings = '{"timezone":"Asia/Ho_Chi_Minh"}' where id = %L$q$, :'orgA')) = 'ok:1');

select t.run('authenticated', :'adminA', format($q$select fp_request_plan(%L, 'pro')$q$, :'orgA')) as r \gset
select t.check('legit: org admin can request a plan change',
  :'r' like 'ok:%'
  and (select requested_plan_code from fp_subscriptions where org_id = :'orgA') = 'pro'
  and not exists (select 1 from fp_subscriptions where org_id = :'orgA' and plan_code = 'pro' and status = 'active'));
select t.check('B3: technician cannot request plan changes',
  t.run('authenticated', :'techA', format($q$select fp_request_plan(%L, 'pro')$q$, :'orgA')) like 'err:%');

-- ===========================================================================
-- S2-B4: global plan catalogue
-- ===========================================================================
select t.run('authenticated', :'adminB', $q$update fp_plans set payment_url = 'https://evil.test/pay', price = 1$q$);
select t.check('B4: tenant admin cannot edit the global plan catalogue',
  not exists (select 1 from fp_plans where payment_url = 'https://evil.test/pay'));

insert into fp_platform_admins (user_id) values (:'ops');
select t.check('legit: platform admin can edit plans',
  t.run('authenticated', :'ops', $q$update fp_plans set payment_url = 'https://paypal.test/pro' where code = 'pro'$q$) = 'ok:1');
select t.run('authenticated', :'ops', format($q$select fp_platform_set_subscription(%L, 'pro', 'active', 'month')$q$, :'orgA')) as r \gset
select t.check('legit: platform admin can activate a requested plan',
  :'r' like 'ok:%'
  and exists (select 1 from fp_subscriptions where org_id = :'orgA' and plan_code = 'pro' and status = 'active'
              and requested_plan_code is null and current_period_end > now()));
select t.check('B4: tenant admin cannot call the platform activation RPC',
  t.run('authenticated', :'adminB', format($q$select fp_platform_set_subscription(%L, 'business', 'active', 'year')$q$, :'orgB')) like 'err:%');

-- ===========================================================================
-- S2-B5: cross-tenant writes through FKs + definer triggers
-- ===========================================================================
select t.run('authenticated', :'techB', format(
  $q$insert into fp_wo_parts (org_id, work_order_id, part_id, quantity) values (%L, '40000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000a', 5)$q$, :'orgB'));
select t.check('B5: org B cannot consume org A stock',
  (select stock_balance from fp_parts where id = '30000000-0000-0000-0000-00000000000a') = 10);

select t.run('authenticated', :'adminB', format(
  $q$insert into fp_wo_labor (org_id, work_order_id, user_id, minutes, rate_snapshot) values (%L, '40000000-0000-0000-0000-00000000000a', auth.uid(), 600, 1000)$q$, :'orgB'));
select t.check('B5: org B cannot log labour/cost on org A work order',
  (select cost from fp_work_orders where id = '40000000-0000-0000-0000-00000000000a') = 0);

select t.run('authenticated', :'techA', format(
  $q$update fp_work_orders set org_id = %L where id = '40000000-0000-0000-0000-00000000000a'$q$, :'orgB'));
select t.check('B5: assignee cannot move a work order into another org',
  (select org_id from fp_work_orders where id = '40000000-0000-0000-0000-00000000000a') = :'orgA');

select t.run('authenticated', :'adminB', format(
  $q$insert into fp_procurement_receipt_lines (org_id, receipt_id, procurement_line_id, quantity_received) values (%L, '72000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-00000000000a', 1000)$q$, :'orgB'));
select t.check('B5: org B cannot receive goods into org A stock',
  (select stock_balance from fp_parts where id = '30000000-0000-0000-0000-00000000000a') = 10);

select t.run('authenticated', :'adminB',
  $q$update fp_devices set metric_map = '{"hours":"50000000-0000-0000-0000-00000000000a"}' where id = '60000000-0000-0000-0000-00000000000b'$q$);
select t.run('anon', null, $q$select fp_device_ingest('devkeyB', 'hours', 99999)$q$);
select t.check('B5: org B device cannot write readings into org A meter',
  not exists (select 1 from fp_meter_readings where meter_id = '50000000-0000-0000-0000-00000000000a'));

select t.run('authenticated', :'occA', format(
  $q$insert into fp_wo_parts (org_id, work_order_id, part_id, quantity) values (%L, '40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 3)$q$, :'orgA'));
select t.check('B5: occupant cannot consume parts on a work order',
  (select stock_balance from fp_parts where id = '30000000-0000-0000-0000-00000000000a') = 10);

-- Undo any B5 exploit that succeeded before exercising legitimate use.
update fp_work_orders set org_id = :'orgA' where id = '40000000-0000-0000-0000-00000000000a' and org_id <> :'orgA';
update fp_work_orders set assigned_to = :'techA' where id = '40000000-0000-0000-0000-00000000000a';
delete from fp_wo_parts;
delete from fp_wo_labor;
update fp_parts set stock_balance = 10;

select t.run('authenticated', :'techA', format(
    $q$insert into fp_wo_parts (org_id, work_order_id, part_id, quantity) values (%L, '40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 2)$q$, :'orgA')) as r \gset
select t.check('legit: assigned technician can log parts on own work order',
  :'r' = 'ok:1'
  and (select stock_balance from fp_parts where id = '30000000-0000-0000-0000-00000000000a') = 8
  and (select cost from fp_work_orders where id = '40000000-0000-0000-0000-00000000000a') = 10);
select t.check('legit: assigned technician can log labour on own work order',
  t.run('authenticated', :'techA', format(
    $q$insert into fp_wo_labor (org_id, work_order_id, user_id, minutes, rate_snapshot) values (%L, '40000000-0000-0000-0000-00000000000a', auth.uid(), 60, 20)$q$, :'orgA')) = 'ok:1');
select t.check('legit: assignee can still update status',
  t.run('authenticated', :'techA',
    $q$update fp_work_orders set status = 'in_progress' where id = '40000000-0000-0000-0000-00000000000a'$q$) = 'ok:1');
select t.check('legit: public report still accepted for own-org asset',
  t.run('anon', null, format($q$select fp_public_report(%L, 'Leak', null, 'high', 'vi', '20000000-0000-0000-0000-00000000000a')$q$, :'orgA')) like 'ok:%');
select t.check('B5: public report cannot reference another org''s asset',
  t.run('anon', null, format($q$select fp_public_report(%L, 'Leak', null, 'high', 'vi', '20000000-0000-0000-0000-00000000000b')$q$, :'orgA')) like 'err:%');

-- ===========================================================================
-- S2-B6: workflow email/SMS as an open relay
-- ===========================================================================
insert into fp_workflows (org_id, name, trigger_type, actions) values
  (:'orgB', 'relay-email', 'service_request', '[{"type":"send_email","target":"victim@evil.test","value":"buy now"}]'),
  (:'orgB', 'relay-sms',   'service_request', '[{"type":"send_sms","target":"+15550001111","value":"buy now"}]'),
  (:'orgB', 'relay-push',  'service_request', '[{"type":"send_push","target":"00000000-0000-0000-0000-0000000000a2","value":"hi"}]');
select t.check('legit: requests can be created while event workflows are active',
  t.run('authenticated', :'adminB', format($q$insert into fp_requests (org_id, title) values (%L, 'trigger relay')$q$, :'orgB')) = 'ok:1');
select t.check('B6: workflow cannot email a non-member address',
  not exists (select 1 from fp_notification_outbox where to_address = 'victim@evil.test'));
select t.check('B6: workflow cannot SMS a number that is not a member''s',
  not exists (select 1 from fp_notification_outbox where to_address = '+15550001111'));
select t.check('B6: workflow cannot push to a user in another org',
  not exists (select 1 from fp_notification_outbox where channel = 'push' and user_id = :'occA'));
select t.check('B6: blocked relay shows up as a failed workflow run',
  (select count(*) from fp_workflow_runs r join fp_workflows w on w.id = r.workflow_id
   where w.name like 'relay-%' and r.status = 'failed' and r.error like '%not a member%') = 3);

insert into fp_notification_prefs (user_id, phone) values (:'techB', '+84901234567');
insert into fp_workflows (org_id, name, trigger_type, actions) values
  (:'orgB', 'legit', 'service_request',
   format('[{"type":"send_email","target":"tech-b@b.test","value":"hello"},
            {"type":"send_sms","target":"%s","value":"hello"}]', :'techB')::jsonb);
update fp_workflows set is_active = false where name like 'relay-%';
select t.run('authenticated', :'adminB', format($q$insert into fp_requests (org_id, title) values (%L, 'trigger legit')$q$, :'orgB'));
select t.check('legit: workflow can email an org member',
  exists (select 1 from fp_notification_outbox where to_address = 'tech-b@b.test' and org_id = :'orgB'));
select t.check('legit: workflow can SMS an org member by user id',
  exists (select 1 from fp_notification_outbox where channel = 'sms' and to_address = '+84901234567' and org_id = :'orgB'));

-- Daily quota: flood org B's email outbox past the cap.
insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject)
  select :'orgB', :'techB', 'email', 'tech-b@b.test', 'flood ' || g from generate_series(1, 600) g;
select t.check('B6: per-org daily email quota stops a flood',
  (select count(*) from fp_notification_outbox where org_id = :'orgB' and channel = 'email' and status = 'pending') <= 500
  and exists (select 1 from fp_notification_outbox where org_id = :'orgB' and error = 'daily_quota_exceeded'));

\ir _report.sql
