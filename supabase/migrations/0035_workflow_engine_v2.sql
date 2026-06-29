-- 0035_workflow_engine_v2.sql
-- Engine upgrades:
--  * Org-scope the event engine (fp_run_workflows now takes p_org — fixes
--    cross-tenant firing where an event in one org ran another org's workflows).
--  * Condition logic: honour conditions.logic = 'and' | 'or'.
--  * Accurate "expenditure budget exceeded": sum real spend per budget/period.
--  * SMS / push workflow actions (reuse fp_notification_outbox channels).
--  * External-integration triggers: approval-needed (DB trigger on fp_approvals),
--    chat-with-staff (DB trigger on fp_conversations), and a generic
--    fp_emit_workflow_event() RPC for app/integration events (low sentiment, SOR).

-- ---------------------------------------------------------------------------
-- Condition evaluation: accepts the full {logic, rules} object.
-- ---------------------------------------------------------------------------
drop function if exists fp_eval_condition(jsonb, jsonb);

create or replace function fp_eval_condition(p_conditions jsonb, p_context jsonb)
returns boolean
language plpgsql
as $$
declare
  rules jsonb;
  logic text;
  r  jsonb;
  f  text;
  op text;
  v  text;
  cv text;
  ok boolean;
  cn numeric;
  vn numeric;
  any_pass boolean := false;
begin
  rules := p_conditions->'rules';
  logic := lower(coalesce(p_conditions->>'logic', 'and'));

  if rules is null or jsonb_typeof(rules) <> 'array' or jsonb_array_length(rules) = 0 then
    return true;
  end if;

  for r in select value from jsonb_array_elements(rules) loop
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
      ok := true;
    end if;

    if logic = 'or' then
      if ok then
        any_pass := true;
      end if;
    else
      if not ok then
        return false;  -- AND: first failure ends it
      end if;
    end if;
  end loop;

  if logic = 'or' then
    return any_pass;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Action execution: + send_sms / send_push.
-- ---------------------------------------------------------------------------
create or replace function fp_run_workflow_action(p_org uuid, p_action jsonb, p_context jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a_type    text := p_action->>'type';
  a_target  text := p_action->>'target';
  a_value   text := p_action->>'value';
  v_ft      uuid;
  v_loc     text;
  v_subject text;
begin
  if a_type in ('send_email', 'send_approval_email') then
    v_subject := case a_type
      when 'send_approval_email' then 'FacilitySpace: approval required'
      else 'FacilitySpace: workflow notification'
    end;
    if a_target is not null and position('@' in a_target) > 0 then
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (null, 'email', a_target, v_subject, coalesce(nullif(a_value, ''), v_subject));
    else
      perform fp_wf_notify(p_org, a_target, v_subject, coalesce(a_value, ''));
    end if;

  elsif a_type = 'send_sms' then
    if a_target is not null and btrim(a_target) <> '' then
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (null, 'sms', a_target, 'FacilitySpace alert', coalesce(nullif(a_value, ''), 'FacilitySpace alert'));
    end if;

  elsif a_type = 'send_push' then
    if a_target ~ '^[0-9a-fA-F-]{36}$' then
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (a_target::uuid, 'push', a_target, 'FacilitySpace alert', coalesce(nullif(a_value, ''), 'FacilitySpace alert'));
    end if;

  elsif a_type in ('alert_account', 'assign', 'send_survey') then
    perform fp_wf_notify(
      p_org,
      a_target,
      case a_type
        when 'alert_account' then 'Workflow: alert'
        when 'assign'        then 'Workflow: assignment'
        when 'send_survey'   then 'Workflow: survey'
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
-- Per-workflow execution (uses the new condition signature).
-- ---------------------------------------------------------------------------
create or replace function fp_exec_workflow(p_wf fp_workflows, p_trigger_ref text, p_context jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid;
  a      jsonb;
  passed boolean;
begin
  insert into fp_workflow_runs (workflow_id, trigger_ref, status, started_at, context)
  values (p_wf.id, p_trigger_ref, 'success', now(), p_context)
  returning id into run_id;

  passed := fp_eval_condition(p_wf.conditions, p_context);
  if not passed then
    update fp_workflow_runs set status = 'skipped', finished_at = now() where id = run_id;
    return false;
  end if;

  begin
    for a in select value from jsonb_array_elements(coalesce(p_wf.actions, '[]'::jsonb)) loop
      perform fp_run_workflow_action(p_wf.org_id, a, p_context);
    end loop;
    update fp_workflows set run_count = run_count + 1, last_run_at = now() where id = p_wf.id;
    update fp_workflow_runs set status = 'success', finished_at = now() where id = run_id;
    return true;
  exception when others then
    update fp_workflow_runs set status = 'failed', finished_at = now(), error = SQLERRM where id = run_id;
    return false;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Org-scoped event engine.
-- ---------------------------------------------------------------------------
create or replace function fp_run_workflows(
  p_org          uuid,
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
  wf record;
  n  int := 0;
begin
  perform set_config('fp.in_workflow', 'on', true);
  for wf in
    select * from fp_workflows
    where is_active = true and org_id = p_org and trigger_type = p_trigger_type
    order by run_order, created_at
  loop
    if fp_exec_workflow(wf, p_trigger_ref, p_context) then
      n := n + 1;
    end if;
  end loop;
  perform set_config('fp.in_workflow', 'off', true);
  return n;
end;
$$;

grant execute on function fp_run_workflows(uuid, text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Re-point existing event triggers at the org-scoped engine.
-- ---------------------------------------------------------------------------
create or replace function fp_wf_on_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    perform fp_run_workflows(new.org_id, 'service_request', new.id::text, jsonb_build_object(
      'priority', new.priority, 'type', new.fault_type_id, 'location_tag', new.location_id,
      'status', new.status, 'is_complete', 'false'));
  elsif tg_op = 'UPDATE' and new.status in ('resolved', 'closed') and new.status is distinct from old.status then
    perform fp_run_workflows(new.org_id, 'service_request', new.id::text, jsonb_build_object(
      'priority', new.priority, 'type', new.fault_type_id, 'location_tag', new.location_id,
      'status', new.status, 'is_complete', 'true'));
  end if;
  return new;
end; $$;

create or replace function fp_wf_on_meter_reading()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  perform fp_run_workflows(new.org_id, 'meter_reading', new.id::text, jsonb_build_object(
    'meter_value', new.value, 'meter', new.meter_id));
  return new;
end; $$;

create or replace function fp_wf_on_part()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  if new.stock_balance < old.stock_balance then
    perform fp_run_workflows(new.org_id, 'parts_quantity', new.id::text, jsonb_build_object(
      'quantity', new.stock_balance, 'part', new.id));
  end if;
  return new;
end; $$;

create or replace function fp_wf_on_desk_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_zone uuid;
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  select zone_id into v_zone from fp_desks where id = new.desk_id;
  perform fp_run_workflows(new.org_id, 'desk_booking', new.id::text, jsonb_build_object(
    'zone', v_zone, 'desk', new.desk_id, 'booker', new.booker_name));
  return new;
end; $$;

create or replace function fp_wf_on_facility_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_loc uuid;
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  select location_id into v_loc from fp_facilities where id = new.facility_id;
  perform fp_run_workflows(new.org_id, 'facilities_booking', new.id::text, jsonb_build_object(
    'facility', new.facility_id, 'location', v_loc, 'booker', new.booker_name));
  return new;
end; $$;

-- Drop the old (un-scoped) engine signature now that nothing references it.
drop function if exists fp_run_workflows(text, text, jsonb);

-- ---------------------------------------------------------------------------
-- Accurate budget-exceeded: sum spend per budget/period; fire once per period.
-- ---------------------------------------------------------------------------
create or replace function fp_wf_on_expenditure()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b     record;
  wf    record;
  ws    timestamptz;
  pk    text;
  spend numeric;
  ref   text;
  ctx   jsonb;
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  perform set_config('fp.in_workflow', 'on', true);

  for b in select * from fp_finance_budgets where org_id = new.org_id loop
    if lower(b.period) like 'month%' then
      ws := date_trunc('month', now());   pk := to_char(now(), 'YYYYMM');
    elsif lower(b.period) like 'ann%' or lower(b.period) like 'year%' then
      ws := date_trunc('year', now());    pk := to_char(now(), 'YYYY');
    elsif lower(b.period) like 'quarter%' then
      ws := date_trunc('quarter', now()); pk := to_char(now(), 'YYYY"Q"Q');
    else
      ws := '-infinity'::timestamptz;     pk := 'total';
    end if;

    select coalesce(sum(amount), 0) into spend
      from fp_finance_expenditures
      where org_id = new.org_id and created_at >= ws;

    if spend > b.amount then
      ref := b.id::text || ':' || pk;
      ctx := jsonb_build_object(
        'cost_centre', b.id, 'budget_amount', spend, 'budget_limit', b.amount,
        'budget_name', b.name, 'period', b.period);
      for wf in
        select * from fp_workflows
        where org_id = new.org_id and is_active and trigger_type = 'expenditure_budget_exceeded'
        order by run_order, created_at
      loop
        if not exists (
          select 1 from fp_workflow_runs wr where wr.workflow_id = wf.id and wr.trigger_ref = ref
        ) then
          perform fp_exec_workflow(wf, ref, ctx);
        end if;
      end loop;
    end if;
  end loop;

  perform set_config('fp.in_workflow', 'off', true);
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- External-integration triggers.
-- ---------------------------------------------------------------------------
create or replace function fp_wf_on_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  if new.status = 'pending' then
    perform fp_run_workflows(new.org_id, 'expenditure_approval', new.id::text, jsonb_build_object(
      'work_order', new.work_order_id, 'status', new.status));
  end if;
  return new;
end; $$;

drop trigger if exists trg_fp_wf_on_approval on fp_approvals;
create trigger trg_fp_wf_on_approval
  after insert on fp_approvals
  for each row execute function fp_wf_on_approval();

create or replace function fp_wf_on_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  perform fp_run_workflows(new.org_id, 'chat_with_staff', new.id::text, jsonb_build_object(
    'channel', new.channel, 'contact', new.contact_name));
  return new;
end; $$;

drop trigger if exists trg_fp_wf_on_conversation on fp_conversations;
create trigger trg_fp_wf_on_conversation
  after insert on fp_conversations
  for each row execute function fp_wf_on_conversation();

-- ---------------------------------------------------------------------------
-- Generic emitter for events the DB cannot detect on its own
-- (low sentiment, SOR submitted, or any custom integration event).
-- ---------------------------------------------------------------------------
create or replace function fp_emit_workflow_event(
  p_org          uuid,
  p_trigger_type text,
  p_trigger_ref  text default null,
  p_context      jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fp_is_member(p_org) then
    raise exception 'Not authorized';
  end if;
  return fp_run_workflows(p_org, p_trigger_type, p_trigger_ref, p_context);
end;
$$;

grant execute on function fp_emit_workflow_event(uuid, text, text, jsonb) to authenticated, service_role;
