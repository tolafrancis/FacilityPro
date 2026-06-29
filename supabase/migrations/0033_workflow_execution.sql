-- 0033_workflow_execution.sql
-- Make workflows actually fire: evaluate their conditions against a real event
-- context, execute their actions, and connect domain events (requests, meter
-- readings, parts, desk/facility bookings, expenditures) to fp_run_workflows().
--
-- Design notes:
--  * Condition evaluation supports the operators the Create-workflow form offers.
--  * Action execution is in-database: create_request / create_expenditure insert
--    real rows; email / assign / alert / survey / approval write an in-app
--    fp_notifications row (outbound email/SMS remains a later phase, see 0016).
--  * A transaction-local guard (fp.in_workflow) stops workflow-created rows from
--    re-triggering workflows (no cascades / infinite loops).
--  * Each workflow's actions run in their own sub-block so a failing action is
--    recorded on the run but never rolls back the user's original operation.

-- ---------------------------------------------------------------------------
-- Condition evaluation
-- ---------------------------------------------------------------------------
create or replace function fp_eval_condition(p_rules jsonb, p_context jsonb)
returns boolean
language plpgsql
as $$
declare
  r  jsonb;
  f  text;
  op text;
  v  text;
  cv text;
  ok boolean;
  cn numeric;
  vn numeric;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) = 0 then
    return true;
  end if;

  for r in select value from jsonb_array_elements(p_rules) loop
    f  := r->>'field';
    op := r->>'operator';
    v  := r->>'value';
    cv := p_context->>f;
    ok := true;

    if op = 'equals' then
      ok := (cv is not distinct from v);
    elsif op = 'not' then
      ok := (cv is distinct from v);
    elsif op = 'contains' then
      ok := (cv is not null and v is not null and position(lower(v) in lower(cv)) > 0);
    elsif op = 'in' then
      ok := (cv is not null and v is not null and cv = any (string_to_array(replace(v, ' ', ''), ',')));
    elsif op = 'is_true' then
      ok := (lower(coalesce(cv, '')) in ('true', 't', '1', 'yes'));
    elsif op in ('exceeds', 'gte', 'falls_below', 'pending_for') then
      begin
        cn := cv::numeric;
        vn := v::numeric;
        if op = 'exceeds' then
          ok := cn > vn;
        elsif op = 'gte' then
          ok := cn >= vn;
        elsif op = 'falls_below' then
          ok := cn < vn;
        elsif op = 'pending_for' then
          ok := cn >= vn;
        end if;
      exception when others then
        ok := false;
      end;
    else
      ok := true;  -- unknown operator: do not block
    end if;

    if not ok then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notification helper: resolve an action target (user_id / email / blank) to a
-- recipient and write an in-app notification. Blank/unresolved -> admins+managers.
-- ---------------------------------------------------------------------------
create or replace function fp_wf_notify(p_org uuid, p_target text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u   record;
  uid uuid;
begin
  if p_target is not null and btrim(p_target) <> '' then
    if p_target ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      if exists (select 1 from fp_users_orgs where org_id = p_org and user_id = p_target::uuid) then
        insert into fp_notifications (org_id, user_id, kind, title, body)
        values (p_org, p_target::uuid, 'workflow', p_title, p_body);
        return;
      end if;
    elsif position('@' in p_target) > 0 then
      select uo.user_id into uid
        from fp_users_orgs uo
        join auth.users au on au.id = uo.user_id
        where uo.org_id = p_org and lower(au.email) = lower(p_target)
        limit 1;
      if uid is not null then
        insert into fp_notifications (org_id, user_id, kind, title, body)
        values (p_org, uid, 'workflow', p_title, p_body);
        return;
      end if;
    end if;
  end if;

  -- Fallback: notify all admins and managers.
  for u in
    select user_id from fp_users_orgs
    where org_id = p_org and role in ('org_admin', 'manager')
  loop
    insert into fp_notifications (org_id, user_id, kind, title, body)
    values (p_org, u.user_id, 'workflow', p_title, p_body);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute a single workflow action.
-- ---------------------------------------------------------------------------
create or replace function fp_run_workflow_action(p_org uuid, p_action jsonb, p_context jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a_type   text := p_action->>'type';
  a_target text := p_action->>'target';
  a_value  text := p_action->>'value';
  v_ft     uuid;
  v_loc    text;
begin
  if a_type in ('send_email', 'send_approval_email', 'alert_account', 'assign', 'send_survey') then
    perform fp_wf_notify(
      p_org,
      a_target,
      case a_type
        when 'send_email'          then 'Workflow: email'
        when 'send_approval_email' then 'Workflow: approval required'
        when 'alert_account'       then 'Workflow: alert'
        when 'assign'              then 'Workflow: assignment'
        when 'send_survey'         then 'Workflow: survey'
      end,
      coalesce(
        nullif(a_value, ''),
        case when a_type = 'send_survey' then 'Survey: ' || coalesce(a_target, '') else '' end
      )
    );

  elsif a_type = 'create_request' then
    v_ft := null;
    v_loc := p_context->>'location_tag';
    if a_target ~ '^[0-9a-fA-F-]{36}$' then
      v_ft := a_target::uuid;
    end if;
    insert into fp_requests (org_id, title, fault_type_id, location_id, priority, status, channel)
    values (
      p_org,
      coalesce(nullif(a_value, ''), 'Workflow-created request'),
      v_ft,
      case when v_loc ~ '^[0-9a-fA-F-]{36}$' then v_loc::uuid else null end,
      coalesce(p_context->>'priority', 'medium'),
      'new',
      'web'
    );

  elsif a_type = 'create_expenditure' then
    insert into fp_finance_expenditures (org_id, description, category, amount)
    values (p_org, coalesce(nullif(a_value, ''), 'Workflow expenditure'), 'Workflow', 0);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Engine: evaluate + execute every active workflow for a trigger.
-- ---------------------------------------------------------------------------
create or replace function fp_run_workflows(
  p_trigger_type text,
  p_trigger_ref  text default null,
  p_context      jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  wf     record;
  n      int := 0;
  run_id uuid;
  a      jsonb;
  passed boolean;
begin
  -- Suppress cascades: rows created by actions below must not re-trigger workflows.
  perform set_config('fp.in_workflow', 'on', true);

  for wf in
    select * from fp_workflows
    where is_active = true and trigger_type = p_trigger_type
    order by run_order, created_at
  loop
    insert into fp_workflow_runs (workflow_id, trigger_ref, status, started_at, context)
    values (wf.id, p_trigger_ref, 'success', now(), p_context)
    returning id into run_id;

    passed := fp_eval_condition(wf.conditions->'rules', p_context);

    if not passed then
      update fp_workflow_runs set status = 'skipped', finished_at = now() where id = run_id;
      continue;
    end if;

    begin
      for a in select value from jsonb_array_elements(coalesce(wf.actions, '[]'::jsonb)) loop
        perform fp_run_workflow_action(wf.org_id, a, p_context);
      end loop;
      update fp_workflows set run_count = run_count + 1, last_run_at = now() where id = wf.id;
      update fp_workflow_runs set status = 'success', finished_at = now() where id = run_id;
      n := n + 1;
    exception when others then
      update fp_workflow_runs set status = 'failed', finished_at = now(), error = SQLERRM where id = run_id;
    end;
  end loop;

  perform set_config('fp.in_workflow', 'off', true);
  return n;
end;
$$;

grant execute on function fp_run_workflows(text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Event source triggers. Each bails out when invoked from inside a workflow.
-- ---------------------------------------------------------------------------
create or replace function fp_wf_on_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform fp_run_workflows('service_request', new.id::text, jsonb_build_object(
      'priority', new.priority, 'type', new.fault_type_id, 'location_tag', new.location_id,
      'status', new.status, 'is_complete', 'false'));
  elsif tg_op = 'UPDATE' and new.status in ('resolved', 'closed') and new.status is distinct from old.status then
    perform fp_run_workflows('service_request', new.id::text, jsonb_build_object(
      'priority', new.priority, 'type', new.fault_type_id, 'location_tag', new.location_id,
      'status', new.status, 'is_complete', 'true'));
  end if;
  return new;
end; $$;

create trigger trg_fp_wf_on_request
  after insert or update on fp_requests
  for each row execute function fp_wf_on_request();

create or replace function fp_wf_on_meter_reading()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then
    return new;
  end if;
  perform fp_run_workflows('meter_reading', new.id::text, jsonb_build_object(
    'meter_value', new.value, 'meter', new.meter_id));
  return new;
end; $$;

create trigger trg_fp_wf_on_meter_reading
  after insert on fp_meter_readings
  for each row execute function fp_wf_on_meter_reading();

create or replace function fp_wf_on_part()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then
    return new;
  end if;
  if new.stock_balance < old.stock_balance then
    perform fp_run_workflows('parts_quantity', new.id::text, jsonb_build_object(
      'quantity', new.stock_balance, 'part', new.id));
  end if;
  return new;
end; $$;

create trigger trg_fp_wf_on_part
  after update on fp_parts
  for each row execute function fp_wf_on_part();

create or replace function fp_wf_on_desk_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_zone uuid;
begin
  if current_setting('fp.in_workflow', true) = 'on' then
    return new;
  end if;
  select zone_id into v_zone from fp_desks where id = new.desk_id;
  perform fp_run_workflows('desk_booking', new.id::text, jsonb_build_object(
    'zone', v_zone, 'desk', new.desk_id, 'booker', new.booker_name));
  return new;
end; $$;

create trigger trg_fp_wf_on_desk_booking
  after insert on fp_desk_bookings
  for each row execute function fp_wf_on_desk_booking();

create or replace function fp_wf_on_facility_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_loc uuid;
begin
  if current_setting('fp.in_workflow', true) = 'on' then
    return new;
  end if;
  select location_id into v_loc from fp_facilities where id = new.facility_id;
  perform fp_run_workflows('facilities_booking', new.id::text, jsonb_build_object(
    'facility', new.facility_id, 'location', v_loc, 'booker', new.booker_name));
  return new;
end; $$;

create trigger trg_fp_wf_on_facility_booking
  after insert on fp_facility_bookings
  for each row execute function fp_wf_on_facility_booking();

create or replace function fp_wf_on_expenditure()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then
    return new;
  end if;
  perform fp_run_workflows('expenditure_budget_exceeded', new.id::text, jsonb_build_object(
    'budget_amount', new.amount, 'category', new.category));
  return new;
end; $$;

create trigger trg_fp_wf_on_expenditure
  after insert on fp_finance_expenditures
  for each row execute function fp_wf_on_expenditure();
