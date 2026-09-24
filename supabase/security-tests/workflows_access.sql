-- Workflows + member access suite (0071). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@a.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'tech2@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'lan.nguyen@a.test');
\set admin '00000000-0000-0000-0000-00000000000a'
\set tech  '00000000-0000-0000-0000-0000000000a1'
\set tech2 '00000000-0000-0000-0000-0000000000a5'
\set occ   '00000000-0000-0000-0000-0000000000a2'
select t.run('authenticated', :'admin', $q$select fp_create_organization('Org A')$q$);
select id as "org" from fp_organizations where name = 'Org A' \gset
insert into fp_invites (org_id, email, role, token) values
  (:'org', 'tech@a.test',       'technician', '10000000-0000-0000-0000-000000000001'),
  (:'org', 'tech2@a.test',      'technician', '10000000-0000-0000-0000-000000000003'),
  (:'org', 'lan.nguyen@a.test', 'occupant',   '10000000-0000-0000-0000-000000000002');
select t.run('authenticated', :'tech',  $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);
select t.run('authenticated', :'tech2', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000003')$q$);
select t.run('authenticated', :'occ',   $q$select fp_accept_invite('10000000-0000-0000-0000-000000000002')$q$);

-- ===========================================================================
-- Workflow nesting
-- ===========================================================================
-- A work order created as a side effect of a workflow (create_request, then
-- auto-convert) still gets its workorder.created automation.
update fp_organizations set auto_create_work_orders = true where id = :'org';
insert into fp_workflows (org_id, name, trigger_type, conditions, actions) values
  (:'org', 'Leak → request', 'desk_booking', '{}',
   '[{"type":"create_request","value":"Follow-up from booking"}]'),
  (:'org', 'Auto-assign', 'workorder.created', '{}',
   format('[{"type":"assign","target":"%s"}]', :'tech')::jsonb);
insert into fp_desks (id, org_id, name_i18n) values ('d1000000-0000-0000-0000-000000000001', :'org', '{"en":"Desk 1"}');
select t.run('authenticated', :'admin', format($q$
  insert into fp_desk_bookings (org_id, desk_id, booked_by) values (%L, 'd1000000-0000-0000-0000-000000000001', %L)$q$, :'org', :'admin'));
select t.check('a work order created inside a workflow still gets auto-assigned',
  (select assigned_to from fp_work_orders where title = 'Follow-up from booking') = :'tech'::uuid);

-- Loops stop: a service_request workflow that creates service requests.
insert into fp_workflows (org_id, name, trigger_type, conditions, actions) values
  (:'org', 'Echo', 'service_request', '{"logic":"and","rules":[{"field":"priority","operator":"equals","value":"low"}]}',
   '[{"type":"create_request","value":"Echo"}]');
select t.run('authenticated', :'admin', format($q$
  insert into fp_requests (org_id, title, body_original, source_lng, priority) values (%L, 'Start', 'x', 'en', 'low')$q$, :'org')) as r \gset
select t.check('a workflow that triggers itself stops after one nested level',
  :'r' = 'ok:1' and (select count(*) from fp_requests where title = 'Echo') = 2);

-- ===========================================================================
-- Assign doesn't overwrite
-- ===========================================================================
select t.run('authenticated', :'admin', format($q$
  insert into fp_work_orders (org_id, title, assigned_to) values (%L, 'Chosen by hand', %L)$q$, :'org', :'tech2'));
select t.check('the assign action does not overwrite an assignee that was set explicitly',
  (select assigned_to from fp_work_orders where title = 'Chosen by hand') = :'tech2'::uuid);

-- ===========================================================================
-- Conditions
-- ===========================================================================
select t.check('a rule with an unknown operator does not pass',
  fp_eval_condition('{"rules":[{"field":"priority","operator":"bogus","value":"x"}]}', '{"priority":"low"}') = false
  and fp_eval_condition('{"rules":[{"field":"priority","operator":"equals","value":"low"}]}', '{"priority":"low"}') = true);

-- ===========================================================================
-- Approvals
-- ===========================================================================
select id as "wo" from fp_work_orders where title = 'Chosen by hand' \gset
select t.check('an occupant cannot request approval on a work order',
  t.run('authenticated', :'occ', format($q$
    insert into fp_approvals (org_id, work_order_id, requested_by) values (%L, %L, %L)$q$, :'org', :'wo', :'occ')) like 'err:%');
select t.check('another technician cannot request approval on someone else''s job',
  t.run('authenticated', :'tech', format($q$
    insert into fp_approvals (org_id, work_order_id, requested_by) values (%L, %L, %L)$q$, :'org', :'wo', :'tech')) like 'err:%');
select t.check('the assignee can request approval',
  t.run('authenticated', :'tech2', format($q$
    insert into fp_approvals (org_id, work_order_id, requested_by) values (%L, %L, %L)$q$, :'org', :'wo', :'tech2')) = 'ok:1');

-- ===========================================================================
-- Member directory
-- ===========================================================================
select t.check('an occupant sees colleagues'' emails masked, and their own in full',
  (select count(*) from fp_org_members(:'org') m where m.email like '%•••@%') = 0  -- as table owner: full
  and t.run('authenticated', :'occ', format($q$select 1 from fp_org_members(%L) where email = 'te•••@a.test'$q$, :'org')) = 'ok:2'
  and t.run('authenticated', :'occ', format($q$select 1 from fp_org_members(%L) where email = 'lan.nguyen@a.test'$q$, :'org')) = 'ok:1');
select t.check('staff still see full emails',
  t.run('authenticated', :'tech', format($q$select 1 from fp_org_members(%L) where email = 'admin@a.test'$q$, :'org')) = 'ok:1');

-- ===========================================================================
-- Automation inputs
-- ===========================================================================
insert into fp_assets (id, org_id, name_i18n) values ('20000000-0000-0000-0000-000000000001', :'org', '{"en":"Pump"}');
insert into fp_meters (id, org_id, asset_id, name_i18n, unit) values ('80000000-0000-0000-0000-000000000001', :'org', '20000000-0000-0000-0000-000000000001', '{"en":"Hours"}', 'h');
select t.check('occupants cannot record meter readings (they can trigger PM work orders)',
  t.run('authenticated', :'occ', format($q$
    insert into fp_meter_readings (org_id, meter_id, value) values (%L, '80000000-0000-0000-0000-000000000001', 99999)$q$, :'org')) like 'err:%');
select t.check('technicians can record meter readings',
  t.run('authenticated', :'tech', format($q$
    insert into fp_meter_readings (org_id, meter_id, value) values (%L, '80000000-0000-0000-0000-000000000001', 10)$q$, :'org')) = 'ok:1');
select t.check('members cannot fire workflow events directly',
  t.run('authenticated', :'occ', format($q$select fp_emit_workflow_event(%L, 'workorder.created', null, '{}')$q$, :'org')) like 'err:%'
  and t.run('authenticated', :'admin', format($q$select fp_emit_workflow_event(%L, 'workorder.created', null, '{}')$q$, :'org')) like 'err:%');

\ir _report.sql
