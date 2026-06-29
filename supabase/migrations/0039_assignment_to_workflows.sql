-- 0039_assignment_to_workflows.sql
-- Move auto-assignment out of Settings and into the Workflows engine.
--   * New event trigger `workorder.created` (AFTER INSERT on fp_work_orders).
--   * The `assign` action now actually sets fp_work_orders.assigned_to (when the
--     context carries a work_order), in addition to notifying.
--   * fp_apply_wo_automation keeps SLA due-date logic but no longer reads
--     fp_assignment_rules (that table is now deprecated).
--   * Existing fp_assignment_rules are migrated into equivalent workflows.

-- ---------------------------------------------------------------------------
-- Action execution: `assign` performs a real assignment.
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
  v_body    text;
  v_wo      text := p_context->>'work_order';
begin
  if a_type in ('send_email', 'send_approval_email') then
    v_subject := fp_render_template(nullif(p_action->>'subject', ''), p_context);
    if v_subject is null or v_subject = '' then
      v_subject := case a_type
        when 'send_approval_email' then 'FacilitySpace: approval required'
        else 'FacilitySpace: workflow notification'
      end;
    end if;
    v_body := coalesce(fp_render_template(nullif(a_value, ''), p_context), v_subject);
    if a_target is not null and position('@' in a_target) > 0 then
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (null, 'email', a_target, v_subject, v_body);
    else
      perform fp_wf_notify(p_org, a_target, v_subject, v_body);
    end if;

  elsif a_type = 'send_sms' then
    if a_target is not null and btrim(a_target) <> '' then
      v_body := coalesce(fp_render_template(nullif(a_value, ''), p_context), 'FacilitySpace alert');
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (null, 'sms', a_target, 'FacilitySpace alert', v_body);
    end if;

  elsif a_type = 'send_push' then
    if a_target ~ '^[0-9a-fA-F-]{36}$' then
      v_body := coalesce(fp_render_template(nullif(a_value, ''), p_context), 'FacilitySpace alert');
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (a_target::uuid, 'push', a_target, 'FacilitySpace alert', v_body);
    end if;

  elsif a_type = 'assign' then
    -- Actually assign the work order when the event carries one.
    if v_wo ~ '^[0-9a-fA-F-]{36}$' and a_target ~ '^[0-9a-fA-F-]{36}$' then
      update fp_work_orders set assigned_to = a_target::uuid
        where id = v_wo::uuid and org_id = p_org;
    end if;
    perform fp_wf_notify(p_org, a_target, 'Workflow: assignment',
      coalesce(fp_render_template(nullif(a_value, ''), p_context), ''));

  elsif a_type in ('alert_account', 'send_survey') then
    perform fp_wf_notify(
      p_org,
      a_target,
      case a_type when 'alert_account' then 'Workflow: alert' else 'Workflow: survey' end,
      coalesce(
        fp_render_template(nullif(a_value, ''), p_context),
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
      coalesce(fp_render_template(nullif(a_value, ''), p_context), 'Workflow-created request'),
      v_ft,
      case when v_loc ~ '^[0-9a-fA-F-]{36}$' then v_loc::uuid else null end,
      coalesce(p_context->>'priority', 'medium'),
      'new',
      'web'
    );

  elsif a_type = 'create_expenditure' then
    insert into fp_finance_expenditures (org_id, description, category, amount)
    values (p_org, coalesce(fp_render_template(nullif(a_value, ''), p_context), 'Workflow expenditure'), 'Workflow', 0);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- New event source: work order created.
-- ---------------------------------------------------------------------------
create or replace function fp_wf_on_workorder()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type uuid;
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  if new.request_id is not null then
    select fault_type_id into v_type from fp_requests where id = new.request_id;
  end if;
  perform fp_run_workflows(new.org_id, 'workorder.created', new.id::text, jsonb_build_object(
    'priority', new.priority, 'type', v_type, 'work_order', new.id, 'request', new.request_id));
  return new;
end; $$;

drop trigger if exists trg_fp_wf_on_workorder on fp_work_orders;
create trigger trg_fp_wf_on_workorder
  after insert on fp_work_orders
  for each row execute function fp_wf_on_workorder();

-- ---------------------------------------------------------------------------
-- SLA-only automation: drop the assignment-rule lookup (now handled by workflows).
-- ---------------------------------------------------------------------------
create or replace function fp_apply_wo_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h int;
begin
  if new.due_at is null then
    select resolution_hours into h
      from fp_sla_policies
      where org_id = new.org_id and priority = new.priority;
    if h is not null then
      new.due_at := now() + (h || ' hours')::interval;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Migrate existing assignment rules into equivalent workflows.
-- ---------------------------------------------------------------------------
insert into fp_workflows (org_id, name, description, trigger_type, conditions, actions, labels, is_active, run_order, version)
select
  r.org_id,
  'Auto-assign (migrated)',
  'Migrated from the old assignment rules',
  'workorder.created',
  jsonb_build_object('logic', 'and', 'rules',
    (case when r.priority is not null
       then jsonb_build_array(jsonb_build_object('field', 'priority', 'operator', 'equals', 'value', r.priority))
       else '[]'::jsonb end)
    ||
    (case when r.fault_type_id is not null
       then jsonb_build_array(jsonb_build_object('field', 'type', 'operator', 'equals', 'value', r.fault_type_id::text))
       else '[]'::jsonb end)
  ),
  jsonb_build_array(jsonb_build_object('type', 'assign', 'target', r.assigned_to::text, 'value', '')),
  array['workorder.created'],
  true,
  r.ord,
  1
from fp_assignment_rules r;
