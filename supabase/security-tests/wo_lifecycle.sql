-- Work order lifecycle suite (0060): request conversion, status transitions,
-- completion rules, timestamps, technician field limits, request sync and
-- notifications. Every check states the intended behaviour.
--
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

-- ---------------------------------------------------------------------------
-- Fixture: org A with an admin (acts as manager), two technicians and an
-- occupant who reports faults.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech1@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'tech2@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'occ@a.test');

\set admin '00000000-0000-0000-0000-00000000000a'
\set tech  '00000000-0000-0000-0000-0000000000a1'
\set tech2 '00000000-0000-0000-0000-0000000000a3'
\set occ   '00000000-0000-0000-0000-0000000000a2'

select t.run('authenticated', :'admin', $q$select fp_create_organization('Org A')$q$);
select id as "org" from fp_organizations where name = 'Org A' \gset
insert into fp_invites (org_id, email, role, token) values
  (:'org', 'tech1@a.test', 'technician', '10000000-0000-0000-0000-000000000001'),
  (:'org', 'tech2@a.test', 'technician', '10000000-0000-0000-0000-000000000003'),
  (:'org', 'occ@a.test',   'occupant',   '10000000-0000-0000-0000-000000000002');
select t.run('authenticated', :'tech',  $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);
select t.run('authenticated', :'tech2', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000003')$q$);
select t.run('authenticated', :'occ',   $q$select fp_accept_invite('10000000-0000-0000-0000-000000000002')$q$);

insert into fp_locations (id, org_id, name_i18n, kind) values
  ('80000000-0000-0000-0000-000000000001', :'org', '{"en":"Plant room"}', 'room');
select id as "ft" from fp_fault_types where org_id = :'org' order by id limit 1 \gset
insert into fp_checklist_templates (id, org_id, name_i18n) values
  ('81000000-0000-0000-0000-000000000001', :'org', '{"en":"Pump check"}');
insert into fp_checklist_items (org_id, template_id, label_i18n, required) values
  (:'org', '81000000-0000-0000-0000-000000000001', '{"en":"Seal OK"}', true);
insert into fp_parts (id, org_id, name_i18n, stock_balance, unit_cost) values
  ('30000000-0000-0000-0000-000000000001', :'org', '{"en":"Seal"}', 10, 7);

-- The occupant reports a fault.
select t.run('authenticated', :'occ', format(
  $q$insert into fp_requests (id, org_id, title, body_original, location_id, fault_type_id, severity, priority)
     values ('90000000-0000-0000-0000-000000000001', %L, 'Pump leaking', 'Water under pump 2', '80000000-0000-0000-0000-000000000001', %L, 'high', 'high')$q$,
  :'org', :'ft'));
\set req '90000000-0000-0000-0000-000000000001'

-- Helpers to read state without repeating ids.
create function t.wo(p_req uuid) returns fp_work_orders language sql as
  $$ select * from fp_work_orders where request_id = p_req $$;
create function t.req_status(p_req uuid) returns text language sql as
  $$ select status from fp_requests where id = p_req $$;
create function t.notified(p_user uuid, p_kind text) returns boolean language sql as
  $$ select exists (select 1 from fp_notifications where user_id = p_user and kind = p_kind) $$;

-- ===========================================================================
-- Conversion (S1-H2)
-- ===========================================================================
select t.check('technician cannot convert a request',
  t.run('authenticated', :'tech', format($q$select fp_convert_request(%L)$q$, :'req')) like 'err:%');

select t.run('authenticated', :'admin', format($q$select fp_convert_request(%L)$q$, :'req')) as r1 \gset
select t.run('authenticated', :'admin', format($q$select fp_convert_request(%L)$q$, :'req')) as r2 \gset
select t.check('manager converts a request; converting again is a no-op',
  :'r1' like 'ok:%' and :'r2' like 'ok:%'
  and (select count(*) from fp_work_orders where request_id = :'req') = 1);

select id as "wo" from fp_work_orders where request_id = :'req' \gset
select t.check('conversion copies location, fault type, severity and description',
  (select location_id = '80000000-0000-0000-0000-000000000001' and fault_type_id = :'ft'::uuid
          and severity = 'high' and instructions = 'Water under pump 2' and priority = 'high'
   from fp_work_orders where id = :'wo'));
select t.check('unassigned work order starts as open; request becomes assigned',
  (select status from fp_work_orders where id = :'wo') = 'open' and t.req_status(:'req') = 'assigned');
select t.check('a second work order for the same request is rejected',
  t.run('authenticated', :'admin', format(
    $q$insert into fp_work_orders (org_id, request_id, title) values (%L, %L, 'dup')$q$, :'org', :'req')) like 'err:%');

-- ===========================================================================
-- Assignment and technician field limits (S2-H1)
-- ===========================================================================
select t.check('cannot start an unassigned work order',
  t.run('authenticated', :'admin', format($q$update fp_work_orders set status = 'in_progress' where id = %L$q$, :'wo'))
    like 'err:wo_assignee_required%');

select t.run('authenticated', :'admin', format($q$update fp_work_orders set assigned_to = %L where id = %L$q$, :'tech', :'wo'));
select t.check('assigning moves open -> assigned and notifies the technician',
  (select status from fp_work_orders where id = :'wo') = 'assigned' and t.notified(:'tech', 'wo_assigned'));

select t.check('technician cannot change title/priority',
  t.run('authenticated', :'tech', format($q$update fp_work_orders set priority = 'low', title = 'x' where id = %L$q$, :'wo'))
    like 'err:wo_field_not_allowed%');
select t.check('technician cannot reassign the job',
  t.run('authenticated', :'tech', format($q$update fp_work_orders set assigned_to = %L where id = %L$q$, :'tech2', :'wo'))
    like 'err:wo_field_not_allowed%');
select t.check('technician cannot set cost directly',
  t.run('authenticated', :'tech', format($q$update fp_work_orders set cost = 1 where id = %L$q$, :'wo'))
    like 'err:wo_field_not_allowed%');
select t.check('technician cannot jump straight to closed',
  t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'closed' where id = %L$q$, :'wo'))
    like 'err:wo_invalid_transition%');
select t.check('technician cannot resolve work that was never started',
  t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'resolved', completion_code = 'repaired' where id = %L$q$, :'wo'))
    like 'err:wo_invalid_transition%');

-- ===========================================================================
-- Doing the work
-- ===========================================================================
select t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'in_progress' where id = %L$q$, :'wo')) as r \gset
select t.check('technician starts work: started_at stamped, request in progress',
  :'r' = 'ok:1'
  and (select started_at is not null from fp_work_orders where id = :'wo'));
select t.check('request follows: in_progress', t.req_status(:'req') = 'in_progress');

select t.run('authenticated', :'tech', format(
  $q$update fp_work_orders set status = 'on_hold', hold_reason = 'Waiting for seal', closed_at = '2000-01-01' where id = %L$q$, :'wo')) as r \gset
select t.check('on hold with a reason; a forged closed_at is ignored',
  :'r' = 'ok:1'
  and (select status = 'on_hold' and hold_reason = 'Waiting for seal' and closed_at is null from fp_work_orders where id = :'wo')
  and t.req_status(:'req') = 'on_hold');

select t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'in_progress' where id = %L$q$, :'wo'));
select t.check('resuming clears the hold reason',
  (select status = 'in_progress' and hold_reason is null from fp_work_orders where id = :'wo'));

select t.run('authenticated', :'tech', format(
    $q$insert into fp_wo_parts (org_id, work_order_id, part_id, quantity) values (%L, %L, '30000000-0000-0000-0000-000000000001', 2)$q$, :'org', :'wo')) as r \gset
select t.check('technician can still log parts and labour (cost rollup allowed)',
  :'r' = 'ok:1'
  and t.run('authenticated', :'tech', format(
    $q$insert into fp_wo_labor (org_id, work_order_id, user_id, minutes, rate_snapshot) values (%L, %L, auth.uid(), 30, 20)$q$, :'org', :'wo')) = 'ok:1');
select t.check('cost rolled up from parts + labour', (select cost from fp_work_orders where id = :'wo') = 24);

-- ===========================================================================
-- Completion rules
-- ===========================================================================
select t.check('cannot resolve without a completion code',
  t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'resolved' where id = %L$q$, :'wo'))
    like 'err:wo_completion_code_required%');

select t.check('technician can attach a checklist',
  t.run('authenticated', :'tech', format(
    $q$update fp_work_orders set checklist_template_id = '81000000-0000-0000-0000-000000000001', completion_code = 'repaired', failure_code = 'wear' where id = %L$q$, :'wo')) = 'ok:1');
select t.check('cannot resolve with required checklist items outstanding',
  t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'resolved' where id = %L$q$, :'wo'))
    like 'err:wo_checklist_incomplete%');

select t.run('authenticated', :'tech', format(
  $q$insert into fp_checklist_runs (org_id, template_id, work_order_id, performed_by, completed_at)
     values (%L, '81000000-0000-0000-0000-000000000001', %L, auth.uid(), now())$q$, :'org', :'wo'));
select t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'resolved' where id = %L$q$, :'wo')) as r \gset
select t.check('technician resolves once the checklist is complete',
  :'r' = 'ok:1'
  and (select resolved_at is not null and closed_at is null from fp_work_orders where id = :'wo'));
select t.check('request follows: resolved', t.req_status(:'req') = 'resolved');
select t.check('managers are asked to verify', t.notified(:'admin', 'wo_resolved'));
select t.check('the reporter is told their request is resolved', t.notified(:'occ', 'request_resolved'));

-- ===========================================================================
-- Verification, closure, reopening
-- ===========================================================================
select t.check('technician cannot verify their own work',
  t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'verified' where id = %L$q$, :'wo'))
    like 'err:wo_invalid_transition%');
select t.check('technician cannot close',
  t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'closed' where id = %L$q$, :'wo'))
    like 'err:wo_invalid_transition%');

select t.run('authenticated', :'admin', format($q$update fp_work_orders set status = 'verified' where id = %L$q$, :'wo')) as r \gset
select t.check('manager verifies: verified_at/by stamped',
  :'r' = 'ok:1'
  and (select verified_at is not null and verified_by = :'admin'::uuid from fp_work_orders where id = :'wo'));
select t.check('technician is notified when someone else changes their job', t.notified(:'tech', 'wo_status'));

select t.run('authenticated', :'admin', format($q$update fp_work_orders set status = 'closed' where id = %L$q$, :'wo')) as r \gset
select t.check('manager closes: closed_at stamped, request closed, reporter told',
  :'r' = 'ok:1'
  and (select closed_at is not null from fp_work_orders where id = :'wo')
  and t.req_status(:'req') = 'closed' and t.notified(:'occ', 'request_closed'));

select t.check('technician cannot reopen a closed job',
  t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'in_progress' where id = %L$q$, :'wo'))
    like 'err:wo_invalid_transition%');
select t.run('authenticated', :'admin', format($q$update fp_work_orders set status = 'in_progress' where id = %L$q$, :'wo')) as r \gset
select t.check('manager reopens: completion cleared, reopened_count = 1, request back in progress',
  :'r' = 'ok:1'
  and (select resolved_at is null and verified_at is null and closed_at is null and reopened_count = 1
       from fp_work_orders where id = :'wo')
  and t.req_status(:'req') = 'in_progress');

select t.run('authenticated', :'tech', format($q$update fp_work_orders set status = 'resolved' where id = %L$q$, :'wo'));
select t.run('authenticated', :'admin', format($q$update fp_work_orders set status = 'closed' where id = %L$q$, :'wo')) as r \gset
select t.check('manager can close resolved work directly (counts as verified)',
  :'r' = 'ok:1'
  and (select verified_at is not null and closed_at is not null from fp_work_orders where id = :'wo'));

-- ===========================================================================
-- Other entry points
-- ===========================================================================
select t.check('a work order cannot be created already closed',
  t.run('authenticated', :'admin', format($q$insert into fp_work_orders (org_id, title, status) values (%L, 'x', 'closed')$q$, :'org'))
    like 'err:wo_invalid_initial_status%');

select t.run('authenticated', :'admin', format(
  $q$insert into fp_work_orders (id, org_id, title, assigned_to) values ('40000000-0000-0000-0000-000000000009', %L, 'Swap filter', %L)$q$, :'org', :'tech2'));
select t.run('authenticated', :'admin', $q$update fp_work_orders set assigned_to = null where id = '40000000-0000-0000-0000-000000000009'$q$);
select t.check('unassigning moves assigned -> open',
  (select status from fp_work_orders where id = '40000000-0000-0000-0000-000000000009') = 'open');

update fp_work_orders set due_at = now() - interval '1 hour' where id = '40000000-0000-0000-0000-000000000009';
select t.run('authenticated', :'admin', format($q$select fp_escalate_overdue(%L)$q$, :'org'));
select t.check('SLA escalation includes unassigned (open) work',
  (select escalated from fp_work_orders where id = '40000000-0000-0000-0000-000000000009'));

update fp_organizations set auto_create_work_orders = true where id = :'org';
select t.run('authenticated', :'occ', format(
  $q$insert into fp_requests (id, org_id, title, location_id, severity, priority)
     values ('90000000-0000-0000-0000-000000000002', %L, 'Light out', '80000000-0000-0000-0000-000000000001', 'low', 'low')$q$, :'org'));
select t.check('auto-conversion copies the request details and marks the request assigned',
  (select count(*) = 1 and bool_and(location_id = '80000000-0000-0000-0000-000000000001' and severity = 'low')
   from fp_work_orders where request_id = '90000000-0000-0000-0000-000000000002')
  and t.req_status('90000000-0000-0000-0000-000000000002') = 'assigned');

select t.run('service_role', null, $q$select fp_generate_due_pm()$q$);
insert into fp_pm_schedules (org_id, name_i18n, interval_days, next_due_at, priority)
  values (:'org', '{"en":"Monthly PM"}', 30, now() - interval '1 day', 'medium');
select t.run('service_role', null, $q$select fp_generate_due_pm()$q$) as r \gset
select t.check('PM generation still works (unassigned PM starts open)',
  :'r' like 'ok:%'
  and exists (select 1 from fp_work_orders where title = 'Monthly PM' and status = 'open'));

\ir _report.sql
