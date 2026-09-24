-- 0060_work_order_lifecycle.sql
-- Audit findings S1-H1 (no lifecycle), S1-H2 (duplicate/non-atomic request
-- conversion), S1-H3 (request never follows its work order) and S2-H1 (an
-- assigned technician could edit any work-order column).
-- Covered by supabase/security-tests/wo_lifecycle.sql.
--
-- Lifecycle (enforced by trg_fp_wo_lifecycle; the database owns every
-- lifecycle timestamp, so clients can't forge or skip them):
--
--   open ──assign──> assigned ──> in_progress <──> on_hold
--                        │             │
--                        └──> on_hold  └──> resolved ──> verified ──> closed
--                                             │   (manager)   (manager)
--                                             └──> closed (manager; counts as verified)
--   reopen: resolved/verified/closed ──> in_progress (verified/closed: manager)
--
--   * open/assigned always mirrors whether assigned_to is set.
--   * in_progress needs an assignee; resolved needs a completion code and, if
--     the work order carries a checklist with required items, a completed run.
--   * Technicians (non-managers) may change only status, hold_reason,
--     failure_code, completion_code, downtime_minutes, checklist_template_id.

-- ---------------------------------------------------------------------------
-- Columns + statuses
-- ---------------------------------------------------------------------------
alter table fp_work_orders
  add column if not exists started_at     timestamptz,
  add column if not exists resolved_at    timestamptz,
  add column if not exists verified_at    timestamptz,
  add column if not exists verified_by    uuid references auth.users(id) on delete set null,
  add column if not exists hold_reason    text,
  add column if not exists reopened_count int not null default 0;

alter table fp_work_orders drop constraint if exists fp_work_orders_status_check;
alter table fp_work_orders add constraint fp_work_orders_status_check
  check (status in ('open','assigned','in_progress','on_hold','resolved','verified','closed'));
alter table fp_work_orders alter column status set default 'open';

-- Backfill before the lifecycle trigger exists. The old client stamped
-- closed_at when a job was resolved, so that is the best resolved_at we have.
update fp_work_orders set status = 'open' where status = 'assigned' and assigned_to is null;
update fp_work_orders set resolved_at = coalesce(closed_at, updated_at)
  where status in ('resolved', 'closed') and resolved_at is null;
update fp_work_orders set closed_at = null where status = 'resolved';

-- The reporter is whoever inserted the request (the app already sends it; this
-- covers every other client). Needed to tell them when their fault is fixed.
alter table fp_requests alter column created_by set default auth.uid();

create index if not exists fp_work_orders_open_due_idx
  on fp_work_orders (org_id, due_at) where status not in ('resolved','verified','closed');

-- ---------------------------------------------------------------------------
-- Lifecycle guard (BEFORE INSERT/UPDATE)
-- ---------------------------------------------------------------------------
create or replace function fp_wo_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_manager boolean;
  v_from    text;
  v_to      text;
begin
  -- open/assigned simply reflect whether someone is assigned.
  if new.status in ('open', 'assigned') then
    new.status := case when new.assigned_to is null then 'open' else 'assigned' end;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('open', 'assigned') then
      raise exception 'wo_invalid_initial_status' using errcode = 'P0001',
        detail = 'A work order starts as open or assigned.';
    end if;
    new.started_at := null; new.resolved_at := null; new.verified_at := null;
    new.verified_by := null; new.closed_at := null; new.reopened_count := 0;
    return new;
  end if;

  -- System callers (cron, service role, definer functions without a user)
  -- act as managers.
  v_manager := v_actor is null or fp_has_role(new.org_id, array['org_admin','manager']);

  -- Technicians may only record their work; everything else is the manager's
  -- call. Only checked for statements issued by the client itself (depth 1),
  -- so rollups written by other triggers (cost, labour, assignment workflows)
  -- still apply.
  if not v_manager and pg_trigger_depth() = 1 then
    if (new.title, new.instructions, new.priority, new.due_at, new.assigned_to,
        new.asset_id, new.location_id, new.request_id, new.fault_type_id, new.severity,
        new.cost, new.labour_minutes, new.cost_center_id, new.vendor_id,
        new.pm_schedule_id, new.escalated, new.escalated_at)
       is distinct from
       (old.title, old.instructions, old.priority, old.due_at, old.assigned_to,
        old.asset_id, old.location_id, old.request_id, old.fault_type_id, old.severity,
        old.cost, old.labour_minutes, old.cost_center_id, old.vendor_id,
        old.pm_schedule_id, old.escalated, old.escalated_at) then
      raise exception 'wo_field_not_allowed' using errcode = '42501',
        detail = 'Only a manager can change these work order details.';
    end if;
  end if;

  -- Lifecycle timestamps are owned here; ignore whatever the client sent.
  new.started_at := old.started_at;   new.resolved_at := old.resolved_at;
  new.verified_at := old.verified_at; new.verified_by := old.verified_by;
  new.closed_at := old.closed_at;     new.reopened_count := old.reopened_count;

  v_from := old.status;
  v_to   := new.status;
  if v_from = v_to then
    return new;
  end if;

  if v_to = 'in_progress' and new.assigned_to is null then
    raise exception 'wo_assignee_required' using errcode = 'P0001',
      detail = 'Assign the work order before starting it.';
  end if;

  -- open <-> assigned happens only through (re)assignment, handled above.
  if not (
       (v_from, v_to) in (('open','assigned'), ('assigned','open'))
    or (v_from in ('assigned','on_hold') and v_to = 'in_progress')
    or (v_from in ('assigned','in_progress') and v_to = 'on_hold')
    or (v_from = 'in_progress' and v_to = 'resolved')
    or (v_from = 'resolved' and v_to = 'in_progress')
    or (v_manager and v_from = 'resolved' and v_to in ('verified','closed'))
    or (v_manager and v_from = 'verified' and v_to in ('closed','in_progress'))
    or (v_manager and v_from = 'closed' and v_to = 'in_progress')
  ) then
    raise exception 'wo_invalid_transition' using errcode = 'P0001',
      detail = format('A work order cannot move from %s to %s%s.', v_from, v_to,
                      case when not v_manager then ' (manager only)' else '' end);
  end if;

  if v_to = 'resolved' then
    if new.completion_code is null then
      raise exception 'wo_completion_code_required' using errcode = 'P0001',
        detail = 'Choose a completion code before resolving.';
    end if;
    if new.checklist_template_id is not null
       and exists (select 1 from fp_checklist_items i
                   where i.template_id = new.checklist_template_id and i.required)
       and not exists (select 1 from fp_checklist_runs r
                       where r.work_order_id = new.id and r.completed_at is not null) then
      raise exception 'wo_checklist_incomplete' using errcode = 'P0001',
        detail = 'Complete the required checklist items before resolving.';
    end if;
  end if;

  if v_to <> 'on_hold' then
    new.hold_reason := null;
  end if;

  if v_to = 'in_progress' then
    if v_from in ('resolved', 'verified', 'closed') then
      -- Reopened: the previous completion no longer stands.
      new.resolved_at := null; new.verified_at := null;
      new.verified_by := null; new.closed_at := null;
      new.reopened_count := old.reopened_count + 1;
    end if;
    new.started_at := coalesce(new.started_at, now());
  elsif v_to = 'resolved' then
    new.resolved_at := now();
  elsif v_to = 'verified' then
    new.verified_at := now();
    new.verified_by := v_actor;
  elsif v_to = 'closed' then
    new.closed_at := now();
    if new.verified_at is null then
      new.verified_at := now();
      new.verified_by := v_actor;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fp_wo_lifecycle on fp_work_orders;
create trigger trg_fp_wo_lifecycle
  before insert or update on fp_work_orders
  for each row execute function fp_wo_lifecycle();

-- ---------------------------------------------------------------------------
-- Keep the originating request in step, and tell people what happened
-- (AFTER INSERT/UPDATE)
-- ---------------------------------------------------------------------------
create or replace function fp_wo_after_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_req_state text;
  v_requester uuid;
  u           record;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- Request mirrors its work order (a rejected request stays rejected).
  if new.request_id is not null then
    v_req_state := case new.status
      when 'open'        then 'assigned'
      when 'assigned'    then 'assigned'
      when 'in_progress' then 'in_progress'
      when 'on_hold'     then 'on_hold'
      when 'resolved'    then 'resolved'
      when 'verified'    then 'resolved'
      when 'closed'      then 'closed'
    end;
    update fp_requests
      set status = v_req_state
      where id = new.request_id and status is distinct from v_req_state and status <> 'rejected'
      returning created_by into v_requester;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  -- The assignee hears about changes someone else made to their job.
  if new.assigned_to is not null and new.assigned_to is distinct from v_actor
     and new.status not in ('open', 'assigned') then
    insert into fp_notifications (org_id, user_id, kind, title, body, link)
    values (new.org_id, new.assigned_to, 'wo_status',
            case when old.status in ('resolved','verified','closed') and new.status = 'in_progress'
                 then 'Work order reopened' else 'Work order ' || replace(new.status, '_', ' ') end,
            coalesce(new.title, ''), '/work-orders/' || new.id);
  end if;

  -- Resolved work waits on a manager to verify it.
  if new.status = 'resolved' then
    for u in
      select user_id from fp_users_orgs
      where org_id = new.org_id and role in ('org_admin', 'manager')
        and user_id is distinct from v_actor
    loop
      insert into fp_notifications (org_id, user_id, kind, title, body, link)
      values (new.org_id, u.user_id, 'wo_resolved', 'Work order ready to verify',
              coalesce(new.title, ''), '/work-orders/' || new.id);
    end loop;
  end if;

  -- The person who reported the fault learns it's fixed / closed.
  if new.status in ('resolved', 'closed') and new.request_id is not null then
    if v_requester is null then
      select created_by into v_requester from fp_requests where id = new.request_id;
    end if;
    if v_requester is not null and v_requester is distinct from v_actor
       and exists (select 1 from fp_users_orgs where org_id = new.org_id and user_id = v_requester) then
      insert into fp_notifications (org_id, user_id, kind, title, body, link)
      values (new.org_id, v_requester, 'request_' || new.status,
              case when new.status = 'resolved' then 'Your request has been resolved'
                   else 'Your request is closed' end,
              coalesce(new.title, ''), '/requests/' || new.request_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fp_wo_after_status on fp_work_orders;
create trigger trg_fp_wo_after_status
  after insert or update of status on fp_work_orders
  for each row execute function fp_wo_after_status();

-- ---------------------------------------------------------------------------
-- One work order per request, created atomically with everything the request
-- knew (location, fault type, severity, description).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select request_id from fp_work_orders where request_id is not null
             group by request_id having count(*) > 1) then
    raise warning 'Some requests already have more than one work order, so the one-work-order-per-request index was not created. Find them with: select request_id, array_agg(id) from fp_work_orders where request_id is not null group by request_id having count(*) > 1;  After merging/unlinking duplicates, run: create unique index fp_work_orders_request_uk on fp_work_orders (request_id) where request_id is not null;';
  else
    create unique index if not exists fp_work_orders_request_uk
      on fp_work_orders (request_id) where request_id is not null;
  end if;
end $$;

create or replace function fp_insert_wo_for_request(r fp_requests)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wo uuid;
begin
  insert into fp_work_orders
    (org_id, request_id, asset_id, location_id, fault_type_id, severity,
     title, instructions, priority, status)
  values
    (r.org_id, r.id, r.asset_id, r.location_id, r.fault_type_id, r.severity,
     coalesce(r.title, 'Work order'), r.body_original, r.priority, 'open')
  returning id into wo;
  return wo;
end;
$$;

-- Convert a request (manager). Returns the existing work order if the request
-- was already converted — safe to double-click or race.
create or replace function fp_convert_request(p_request uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r  fp_requests;
  wo uuid;
begin
  select * into r from fp_requests where id = p_request for update;
  if not found
     or not fp_has_role(r.org_id, array['org_admin','manager'])
     or not fp_has_site_access(r.org_id, fp_location_site(r.location_id)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if r.status = 'rejected' then
    raise exception 'request_rejected' using errcode = 'P0001',
      detail = 'A rejected request cannot be converted.';
  end if;

  select id into wo from fp_work_orders where request_id = r.id limit 1;
  if wo is null then
    wo := fp_insert_wo_for_request(r);
  end if;
  return wo;
end;
$$;

-- Auto-conversion (org setting) now carries the same fields as a manual one.
create or replace function fp_auto_create_wo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  auto_on boolean;
begin
  select auto_create_work_orders into auto_on from fp_organizations where id = new.org_id;
  if coalesce(auto_on, false)
     and not exists (select 1 from fp_work_orders where request_id = new.id) then
    perform fp_insert_wo_for_request(new);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- SLA escalation: same as 0059, but unassigned ('open') work counts too.
-- ---------------------------------------------------------------------------
create or replace function fp_escalate_overdue(p_org uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  u record;
  n int := 0;
begin
  perform fp_assert_scheduler_or_manager(p_org);

  for r in
    select * from fp_work_orders
    where not escalated
      and due_at is not null and due_at < now()
      and status in ('open','assigned','in_progress','on_hold')
      and (p_org is null or org_id = p_org)
  loop
    update fp_work_orders set escalated = true, escalated_at = now() where id = r.id;
    for u in
      select user_id from fp_users_orgs
      where org_id = r.org_id and role in ('org_admin','manager')
    loop
      insert into fp_notifications (org_id, user_id, kind, title, body, link)
      values (r.org_id, u.user_id, 'sla_breach', 'Work order overdue',
              coalesce(r.title, ''), '/work-orders/' || r.id);
    end loop;
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (0059 made EXECUTE an allow-list).
-- ---------------------------------------------------------------------------
revoke execute on function fp_insert_wo_for_request(fp_requests) from public, anon, authenticated;
grant execute on function fp_convert_request(uuid) to authenticated;
