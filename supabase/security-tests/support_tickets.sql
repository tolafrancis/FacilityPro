-- Support tickets suite (0087). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@platform.test', '{}'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin@platform.test', '{}'),
  ('00000000-0000-0000-0000-0000000000f3', 'support@platform.test', '{"full_name":"Mai Support"}'),
  ('00000000-0000-0000-0000-0000000000f4', 'analyst@platform.test', '{}'),
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test', '{"full_name":"Alpha Owner"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@alpha.test', '{}'),
  ('00000000-0000-0000-0000-0000000000a2', 'tech2@alpha.test', '{}'),
  ('00000000-0000-0000-0000-00000000000b', 'owner@beta.test', '{}');
\set super   '00000000-0000-0000-0000-0000000000f1'
\set padmin  '00000000-0000-0000-0000-0000000000f2'
\set support '00000000-0000-0000-0000-0000000000f3'
\set analyst '00000000-0000-0000-0000-0000000000f4'
\set ownerA  '00000000-0000-0000-0000-00000000000a'
\set techA   '00000000-0000-0000-0000-0000000000a1'
\set tech2A  '00000000-0000-0000-0000-0000000000a2'
\set ownerB  '00000000-0000-0000-0000-00000000000b'
insert into fp_platform_admins (user_id, role, display_name) values
  (:'super', 'super_admin', null), (:'padmin', 'admin', null), (:'support', 'support', 'Mai'), (:'analyst', 'analyst', null);
select t.run('authenticated', :'ownerA', $q$select fp_create_organization('Alpha Towers')$q$);
select t.run('authenticated', :'ownerB', $q$select fp_create_organization('Beta Clinic')$q$);
select id as "orgA" from fp_organizations where name = 'Alpha Towers' \gset
select id as "orgB" from fp_organizations where name = 'Beta Clinic' \gset
insert into fp_users_orgs (user_id, org_id, role) values (:'techA', :'orgA', 'technician'), (:'tech2A', :'orgA', 'technician');
create temp table j (k text, v jsonb);
grant all on j to authenticated;

-- ===========================================================================
-- Tenants open tickets
-- ===========================================================================
select t.run('authenticated', :'techA', format($q$insert into j select 'new', to_jsonb(fp_create_ticket(%L, 'QR codes not scanning', 'Scanning shows a blank page.', 'problem', 'high'))$q$, :'orgA'));
select (v #>> '{}')::uuid as "tk" from j where k = 'new' \gset
select t.check('a member opens a ticket: first message, due dates from the priority, staff notified',
  (select requester_email = 'tech@alpha.test' and status = 'open' and priority = 'high' and category = 'problem'
          and first_response_due_at = created_at + interval '4 hours' and resolution_due_at = created_at + interval '24 hours'
          and sla_due_at = first_response_due_at from fp_support_tickets where id = :'tk')
  and (select count(*) = 1 and bool_and(author_kind = 'requester') from fp_ticket_messages where ticket_id = :'tk')
  and exists (select 1 from fp_platform_events where type = 'ticket_created' and org_id = :'orgA'));
select t.check('bad tickets are refused; non-members cannot open tickets for an organisation',
  t.run('authenticated', :'techA', format($q$select fp_create_ticket(%L, 'x', 'y')$q$, :'orgA')) like 'err:%subject_required%'
  and t.run('authenticated', :'ownerB', format($q$select fp_create_ticket(%L, 'Hello there', 'y')$q$, :'orgA')) like 'err:%Not authorized%'
  and t.run('anon', null, format($q$select fp_create_ticket(%L, 'Hello there', 'y')$q$, :'orgA')) like 'err:%');

select t.check('the requester and the org admin see the ticket; another member and another tenant do not',
  t.run('authenticated', :'techA', format($q$select fp_my_ticket(%L)$q$, :'tk')) = 'ok:1'
  and t.run('authenticated', :'ownerA', format($q$select fp_my_ticket(%L)$q$, :'tk')) = 'ok:1'
  and t.run('authenticated', :'tech2A', format($q$select fp_my_ticket(%L)$q$, :'tk')) like 'err:%not found%'
  and t.run('authenticated', :'ownerB', format($q$select fp_my_ticket(%L)$q$, :'tk')) like 'err:%not found%');
select t.run('authenticated', :'ownerA', format($q$insert into j select 'listA', fp_my_tickets(%L)$q$, :'orgA'));
select t.run('authenticated', :'tech2A', format($q$insert into j select 'list2', fp_my_tickets(%L)$q$, :'orgA'));
select t.check('ticket lists follow the same rule',
  (select jsonb_array_length(v) = 1 from j where k = 'listA') and (select jsonb_array_length(v) = 0 from j where k = 'list2'));
select t.check('tenants cannot read or write the ticket tables directly',
  t.run('authenticated', :'techA', 'select 1 from fp_ticket_messages') = 'ok:0'
  and t.run('authenticated', :'techA', format($q$update fp_support_tickets set status = 'closed' where id = %L$q$, :'tk')) not like 'ok:1'
  and t.run('authenticated', :'techA', format($q$insert into fp_ticket_messages (ticket_id, body, internal) values (%L, 'x', true)$q$, :'tk')) like 'err:%');

-- ===========================================================================
-- Staff inbox
-- ===========================================================================
select t.run('authenticated', :'support', $q$insert into j select 'inbox', fp_admin_tickets(p_status => 'active', p_assignee => 'none')$q$);
select t.check('support sees the new ticket unassigned, with its SLA state and tenant',
  (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'org_name' = 'Alpha Towers' and v -> 'rows' -> 0 ->> 'sla_state' = 'ok' from j where k = 'inbox'));
select t.check('analysts and tenants cannot read the inbox; admins read but cannot reply',
  t.run('authenticated', :'analyst', $q$select fp_admin_tickets()$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_tickets()$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'padmin', $q$select fp_admin_tickets()$q$) = 'ok:1'
  and t.run('authenticated', :'padmin', format($q$select fp_admin_ticket_reply(%L, 'hi')$q$, :'tk')) like 'err:%Not authorized%');

select t.run('authenticated', :'support', format($q$select fp_admin_ticket_reply(%L, 'Checked: the QR app is outdated. (internal)', true)$q$, :'tk')) as r \gset
select t.run('authenticated', :'techA', format($q$insert into j select 'view1', fp_my_ticket(%L)$q$, :'tk'));
select t.check('an internal note does not count as a response and is hidden from the tenant',
  :'r' = 'ok:1' and (select first_response_at is null and status = 'open' from fp_support_tickets where id = :'tk')
  and (select jsonb_array_length(v -> 'messages') = 1 from j where k = 'view1'));

select t.run('authenticated', :'support', format($q$select fp_admin_ticket_reply(%L, 'Please update the app to 2.4 and scan again.')$q$, :'tk')) as r \gset
select t.check('a public reply stops the first-response clock, assigns the agent, waits on the customer and notifies them',
  :'r' = 'ok:1'
  and (select first_response_at is not null and assignee_id = :'support' and status = 'pending' and last_message_by = 'staff'
              and sla_due_at = resolution_due_at from fp_support_tickets where id = :'tk')
  and exists (select 1 from fp_notifications where user_id = :'techA' and kind = 'support_ticket' and link = '/support/' || :'tk')
  and exists (select 1 from fp_admin_audit where action = 'ticket.reply' and target_id = :'tk' and admin_id = :'support'));
select t.run('authenticated', :'techA', format($q$insert into j select 'view2', fp_my_ticket(%L)$q$, :'tk'));
select t.check('the tenant sees the staff reply signed with the agent''s display name',
  (select v -> 'messages' -> 1 ->> 'author' = 'Mai' and v -> 'messages' -> 1 ->> 'author_kind' = 'staff' from j where k = 'view2'));

select t.run('authenticated', :'techA', format($q$select fp_ticket_reply(%L, 'Updated, still blank.')$q$, :'tk')) as r \gset
select t.check('a customer reply reopens the ticket and tells staff',
  :'r' = 'ok:1' and (select status = 'open' and last_message_by = 'requester' from fp_support_tickets where id = :'tk')
  and exists (select 1 from fp_platform_events where type = 'ticket_reply'));

select t.run('authenticated', :'support', format($q$select fp_admin_ticket_update(%L, '{"priority":"urgent","tags":["QR"," mobile ",""],"category":"problem"}')$q$, :'tk')) as r \gset
select t.check('changing priority recomputes the due dates; tags are cleaned; the change is audited',
  :'r' = 'ok:1'
  and (select priority = 'urgent' and resolution_due_at = created_at + interval '8 hours' and tags = array['mobile', 'qr'] from fp_support_tickets where id = :'tk')
  and exists (select 1 from fp_admin_audit where action = 'ticket.update' and target_id = :'tk'));
select t.check('tickets are assigned to support staff only',
  t.run('authenticated', :'support', format($q$select fp_admin_ticket_update(%L, jsonb_build_object('assignee_id', %L))$q$, :'tk', :'padmin')) like 'err:%invalid_assignee%'
  and t.run('authenticated', :'support', format($q$select fp_admin_ticket_update(%L, jsonb_build_object('assignee_id', %L))$q$, :'tk', :'super')) = 'ok:1');

update fp_support_tickets set created_at = now() - interval '10 hours', priority = 'normal' where id = :'tk';
update fp_support_tickets set priority = 'urgent' where id = :'tk';
select t.run('authenticated', :'support', $q$insert into j select 'breached', fp_admin_tickets(p_sla => 'breached')$q$);
select t.run('authenticated', :'support', $q$insert into j select 'stats', fp_admin_ticket_stats()$q$);
select t.check('an overdue open ticket shows as breached, in the list and the stats',
  (select (v ->> 'total')::int = 1 from j where k = 'breached')
  and (select (v ->> 'breached')::int = 1 and (v ->> 'open')::int = 1 from j where k = 'stats'));
update fp_support_tickets set status = 'pending' where id = :'tk';
select t.check('while waiting on the customer the clock is paused',
  (select fp_ticket_sla_state(status, sla_due_at) = 'paused' from fp_support_tickets where id = :'tk'));

select t.run('authenticated', :'support', format($q$select fp_admin_ticket_update(%L, '{"status":"solved"}')$q$, :'tk')) as r \gset
select t.run('authenticated', :'techA', format($q$select fp_ticket_rate(%L, 'good', 'Fast, thanks')$q$, :'tk')) as r2 \gset
select t.check('solving notifies the requester; they can rate the answer',
  :'r' = 'ok:1' and (select solved_at is not null from fp_support_tickets where id = :'tk')
  and (select count(*) = 2 from fp_notifications where user_id = :'techA' and kind = 'support_ticket')
  and :'r2' = 'ok:1' and (select rating = 'good' from fp_support_tickets where id = :'tk'));

update fp_support_tickets set solved_at = now() - interval '8 days' where id = :'tk';
select t.check('after 7 days a solved ticket can''t be reopened',
  t.run('authenticated', :'techA', format($q$select fp_ticket_reply(%L, 'again')$q$, :'tk')) like 'err:%ticket_closed%');
select t.run('postgres', null, $q$select fp_close_solved_tickets()$q$) as r \gset
select t.check('the job closes tickets solved more than 7 days ago', (select status = 'closed' and closed_at is not null from fp_support_tickets where id = :'tk'));

-- ===========================================================================
-- On behalf of a customer; bulk; macros
-- ===========================================================================
select t.run('authenticated', :'support', format($q$insert into j select 'phone', to_jsonb(fp_admin_create_ticket(jsonb_build_object('org_id', %L, 'requester_email', 'OWNER@beta.test', 'subject', 'Called about invoices', 'body', 'Wants a copy of last month''s invoice.', 'category', 'billing')))$q$, :'orgB'));
select (v #>> '{}')::uuid as "tk2" from j where k = 'phone' \gset
select t.check('staff open a ticket for a customer; it is linked to their account and visible to them',
  (select requester_id = :'ownerB' and channel = 'admin' and category = 'billing' from fp_support_tickets where id = :'tk2')
  and t.run('authenticated', :'ownerB', format($q$select fp_my_ticket(%L)$q$, :'tk2')) = 'ok:1');
select t.run('authenticated', :'support', format($q$select fp_admin_tickets_bulk(array[%L, %L]::uuid[], jsonb_build_object('assignee_id', %L))$q$, :'tk', :'tk2', :'support')) as r \gset
select t.check('bulk assignment changes every selected ticket',
  :'r' = 'ok:1' and (select count(*) = 2 from fp_support_tickets where assignee_id = :'support'));
select t.check('support staff manage saved replies; analysts and tenants cannot',
  t.run('authenticated', :'support', $q$insert into fp_ticket_macros (title, body) values ('Update the app', 'Please update to the latest version.')$q$) = 'ok:1'
  and t.run('authenticated', :'analyst', 'select 1 from fp_ticket_macros') = 'ok:0'
  and t.run('authenticated', :'ownerA', $q$insert into fp_ticket_macros (title, body) values ('x', 'y')$q$) like 'err:%');
select t.check('only super admins change the response targets',
  t.run('authenticated', :'support', $q$update fp_ticket_sla set first_response_minutes = 1 where priority = 'low'$q$) = 'ok:0'
  and t.run('authenticated', :'super', $q$update fp_ticket_sla set first_response_minutes = 720 where priority = 'low'$q$) = 'ok:1');

\ir _report.sql
