-- 0034_workflow_delivery_and_scheduler.sql
-- Two additions on top of 0033:
--  1) Email delivery: workflow "send email" actions enqueue directly into
--     fp_notification_outbox (so external addresses are reached and delivery does
--     not depend on the recipient being an opted-in org member). The existing
--     process-outbox Edge Function (see 0017 + supabase/functions/process-outbox)
--     sends the queued rows via Resend.
--  2) Scheduler: fp_run_scheduled_workflows() fires the time-based triggers that
--     have no source event — "request pending for N minutes", asset useful life,
--     and warranty-expiry-near. Run it on a schedule (pg_cron or the
--     run-scheduled-workflows Edge Function).
--
-- The per-workflow execution body is refactored into fp_exec_workflow() so both
-- the event-driven engine (fp_run_workflows) and the scheduler reuse it.

-- ---------------------------------------------------------------------------
-- Action execution (updated: email actions enqueue the outbox).
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
  v_subject text;
begin
  if a_type in ('send_email', 'send_approval_email') then
    v_subject := case a_type
      when 'send_approval_email' then 'FacilitySpace: approval required'
      else 'FacilitySpace: workflow notification'
    end;
    if a_target is not null and position('@' in a_target) > 0 then
      -- Direct email to the specified address (member or external).
      insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
      values (null, 'email', a_target, v_subject, coalesce(nullif(a_value, ''), v_subject));
    else
      -- Target is a user_id (or blank): in-app notification (which itself emails
      -- the recipient if they opted in, via the 0017 enqueue trigger).
      perform fp_wf_notify(p_org, a_target, v_subject, coalesce(a_value, ''));
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
-- Execute a single workflow (eval + actions + run record). Shared by the
-- event engine and the scheduler. Returns true if it executed successfully.
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

  passed := fp_eval_condition(p_wf.conditions->'rules', p_context);
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
-- Event engine, refactored to delegate to fp_exec_workflow.
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
  wf record;
  n  int := 0;
begin
  perform set_config('fp.in_workflow', 'on', true);
  for wf in
    select * from fp_workflows
    where is_active = true and trigger_type = p_trigger_type
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

grant execute on function fp_run_workflows(text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Scheduler: time-based triggers with no source event. Run periodically.
-- Dedupes per (workflow, entity) using fp_workflow_runs.trigger_ref so a
-- reminder fires once, not every tick.
-- ---------------------------------------------------------------------------
create or replace function fp_run_scheduled_workflows()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  wf  record;
  r   jsonb;
  fld text;
  val numeric;
  rec record;
  ctx jsonb;
  n   int := 0;
begin
  perform set_config('fp.in_workflow', 'on', true);

  for wf in
    select * from fp_workflows
    where is_active = true
      and trigger_type in ('service_request', 'fault_report', 'asset_field')
  loop
    for r in select value from jsonb_array_elements(coalesce(wf.conditions->'rules', '[]'::jsonb)) loop
      fld := r->>'field';
      begin
        val := (r->>'value')::numeric;
      exception when others then
        val := null;
      end;
      if val is null then
        continue;
      end if;

      -- Request pending for N minutes.
      if fld = 'has_been_pending' and wf.trigger_type in ('service_request', 'fault_report') then
        for rec in
          select * from fp_requests
          where org_id = wf.org_id
            and status not in ('resolved', 'closed', 'rejected')
            and now() - created_at >= make_interval(mins => val::int)
            and not exists (
              select 1 from fp_workflow_runs wr
              where wr.workflow_id = wf.id and wr.trigger_ref = rec.id::text
            )
        loop
          ctx := jsonb_build_object(
            'has_been_pending', round(extract(epoch from (now() - rec.created_at)) / 60.0),
            'priority', rec.priority, 'type', rec.fault_type_id,
            'location_tag', rec.location_id, 'status', rec.status, 'is_complete', 'false');
          if fp_exec_workflow(wf, rec.id::text, ctx) then n := n + 1; end if;
        end loop;

      -- Asset useful life: days since purchase date.
      elsif fld = 'days_since_purchase' and wf.trigger_type = 'asset_field' then
        for rec in
          select * from fp_assets
          where org_id = wf.org_id and purchase_date is not null
            and (current_date - purchase_date) >= val
            and not exists (
              select 1 from fp_workflow_runs wr
              where wr.workflow_id = wf.id and wr.trigger_ref = rec.id::text
            )
        loop
          ctx := jsonb_build_object('days_since_purchase', current_date - rec.purchase_date, 'asset', rec.id);
          if fp_exec_workflow(wf, rec.id::text, ctx) then n := n + 1; end if;
        end loop;

      -- Warranty expiry near: days before warranty_expiry.
      elsif fld = 'days_before_expiry' and wf.trigger_type = 'asset_field' then
        for rec in
          select * from fp_assets
          where org_id = wf.org_id and warranty_expiry is not null
            and warranty_expiry >= current_date
            and (warranty_expiry - current_date) <= val
            and not exists (
              select 1 from fp_workflow_runs wr
              where wr.workflow_id = wf.id and wr.trigger_ref = rec.id::text
            )
        loop
          ctx := jsonb_build_object('days_before_expiry', rec.warranty_expiry - current_date, 'asset', rec.id);
          if fp_exec_workflow(wf, rec.id::text, ctx) then n := n + 1; end if;
        end loop;
      end if;
    end loop;
  end loop;

  perform set_config('fp.in_workflow', 'off', true);
  return n;
end;
$$;

grant execute on function fp_run_scheduled_workflows() to service_role;

-- Optional: schedule with pg_cron (run from the SQL editor once pg_cron is enabled):
--   select cron.schedule('fp-scheduled-workflows', '*/15 * * * *',
--     $$ select fp_run_scheduled_workflows(); $$);
-- Or deploy supabase/functions/run-scheduled-workflows and add a Schedule for it.
