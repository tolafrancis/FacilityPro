-- 0071_workflows_and_member_access.sql
-- Audit findings S1-M4 (workflow engine side effects), S1-M5 (approvals),
-- S2-M1 (member emails visible to everyone) and S2-M2 (any member could
-- feed fake data into automation). Covered by
-- supabase/security-tests/workflows_access.sql.
--
--   * Workflows may nest one level: a work order created by a workflow now
--     gets its own workorder.created automation (auto-assign). Deeper chains
--     stop, so workflows still can't loop.
--   * The "assign" action only fills an empty assignee.
--   * A rule with an unknown operator no longer passes.
--   * Time-based workflows re-check a record that didn't match before (once
--     a day) instead of never looking at it again.
--   * Approvals are requested by the work order's assignee or a manager.
--   * Occupants and vendors see other members' names only as masked emails.
--   * Meter readings and checklist runs are recorded by staff (they can
--     create PM work orders); fp_emit_workflow_event is server-only.

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
  wf      fp_workflows;
  n       int := 0;
  v_depth int := coalesce(nullif(current_setting('fp.wf_depth', true), ''), '0')::int;
  v_guard text := coalesce(nullif(current_setting('fp.in_workflow', true), ''), 'off');
begin
  -- One level of nesting is allowed (a work order created by a workflow
  -- still gets its own workorder.created automation, e.g. auto-assign);
  -- deeper chains stop, so workflows can't loop.
  if v_depth >= 2 then
    return 0;
  end if;
  perform set_config('fp.wf_depth', (v_depth + 1)::text, true);
  perform set_config('fp.in_workflow', case when v_depth + 1 >= 2 then 'on' else 'off' end, true);
  for wf in
    select * from fp_workflows
    where is_active = true and org_id = p_org and trigger_type = p_trigger_type
    order by run_order, created_at
  loop
    if coalesce(wf.cooldown_minutes, 0) > 0
       and wf.last_run_at is not null
       and now() - wf.last_run_at < make_interval(mins => wf.cooldown_minutes) then
      continue;
    end if;

    if fp_exec_workflow(wf, p_trigger_ref, p_context) then
      n := n + 1;
    end if;
  end loop;
  perform set_config('fp.wf_depth', v_depth::text, true);
  perform set_config('fp.in_workflow', v_guard, true);
  return n;
end;
$$;

create or replace function fp_eval_condition(p_conditions jsonb, p_context jsonb)
returns boolean
language plpgsql
set search_path = public
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
      -- An unknown operator must not make a rule pass (0071).
      raise warning 'fp_eval_condition: unknown operator %', op;
      ok := false;
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

create or replace function fp_run_workflow_action(p_org uuid, p_action jsonb, p_context jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a_type    text := p_action->>'type';
  a_target  text := nullif(btrim(coalesce(p_action->>'target', '')), '');
  a_value   text := p_action->>'value';
  v_ft      uuid;
  v_loc     text;
  v_subject text;
  v_body    text;
  v_wo      text := p_context->>'work_order';
  v_user    uuid;
  v_addr    text;
  v_digits  text;
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
    if a_target is null then
      -- Blank target: in-app notification to admins/managers (which emails
      -- them if they opted in).
      perform fp_wf_notify(p_org, null, v_subject, v_body);
    else
      v_user := fp_wf_member(p_org, a_target);
      if v_user is null then
        raise exception 'Email recipient % is not a member of this organisation', a_target;
      end if;
      select email into v_addr from auth.users where id = v_user;
      insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
      values (p_org, v_user, 'email', v_addr, v_subject, v_body);
    end if;

  elsif a_type = 'send_sms' then
    if a_target is not null then
      v_user := fp_wf_member(p_org, a_target);
      if v_user is not null then
        v_addr := fp_wf_member_phone(p_org, v_user);
      else
        -- A raw phone number is accepted only if it is a member's number.
        v_digits := regexp_replace(a_target, '[^0-9]', '', 'g');
        select phone into v_addr from (
          select tp.phone from fp_technician_profiles tp where tp.org_id = p_org
          union all
          select np.phone from fp_notification_prefs np
            join fp_users_orgs uo on uo.user_id = np.user_id and uo.org_id = p_org
        ) m
        where length(v_digits) >= 8 and regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g') = v_digits
        limit 1;
      end if;
      if v_addr is null then
        raise exception 'SMS recipient % is not a member of this organisation (or has no phone on file)', a_target;
      end if;
      v_body := coalesce(fp_render_template(nullif(a_value, ''), p_context), 'FacilitySpace alert');
      insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
      values (p_org, v_user, 'sms', v_addr, 'FacilitySpace alert', v_body);
    end if;

  elsif a_type = 'send_push' then
    if a_target is not null then
      v_user := fp_wf_member(p_org, a_target);
      if v_user is null then
        raise exception 'Push recipient % is not a member of this organisation', a_target;
      end if;
      v_body := coalesce(fp_render_template(nullif(a_value, ''), p_context), 'FacilitySpace alert');
      insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
      values (p_org, v_user, 'push', v_user::text, 'FacilitySpace alert', v_body);
    end if;

  elsif a_type = 'assign' then
    if a_target is not null then
      v_user := fp_wf_member(p_org, a_target);
      if v_user is null then
        raise exception 'Assignee % is not a member of this organisation', a_target;
      end if;
      -- Only fills an empty assignee: a person chosen explicitly (or a PM
      -- schedule's default assignee) is never overwritten (0071).
      if v_wo ~ '^[0-9a-fA-F-]{36}$' then
        update fp_work_orders set assigned_to = v_user
          where id = v_wo::uuid and org_id = p_org and assigned_to is null;
        if found then
          perform fp_wf_notify(p_org, v_user::text, 'Workflow: assignment',
            coalesce(fp_render_template(nullif(a_value, ''), p_context), ''));
        end if;
      end if;
    end if;

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
      select id into v_ft from fp_fault_types where id = a_target::uuid and org_id = p_org;
    end if;
    insert into fp_requests (org_id, title, fault_type_id, location_id, priority, status, channel)
    values (
      p_org,
      coalesce(fp_render_template(nullif(a_value, ''), p_context), 'Workflow-created request'),
      v_ft,
      (select id from fp_locations
        where v_loc ~ '^[0-9a-fA-F-]{36}$' and id = v_loc::uuid and org_id = p_org),
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

create or replace function fp_run_scheduled_workflows()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  wf  fp_workflows;
  r   jsonb;
  fld text;
  val numeric;
  rec record;
  ctx jsonb;
  n   int := 0;
begin
  -- Same nesting rule as fp_run_workflows: the scheduler is level 1.
  perform set_config('fp.wf_depth', '1', true);
  perform set_config('fp.in_workflow', 'off', true);

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

      if fld = 'has_been_pending' and wf.trigger_type in ('service_request', 'fault_report') then
        for rec in
          select * from fp_requests
          where org_id = wf.org_id
            and status not in ('resolved', 'closed', 'rejected')
            and now() - created_at >= make_interval(mins => val::int)
            and not exists (
              select 1 from fp_workflow_runs wr
              where wr.workflow_id = wf.id and wr.trigger_ref = fp_requests.id::text
                and (wr.status <> 'skipped' or wr.started_at > now() - interval '1 day')
            )
        loop
          ctx := jsonb_build_object(
            'has_been_pending', round(extract(epoch from (now() - rec.created_at)) / 60.0),
            'priority', rec.priority, 'type', rec.fault_type_id,
            'location_tag', rec.location_id, 'status', rec.status, 'is_complete', 'false');
          if fp_exec_workflow(wf, rec.id::text, ctx) then n := n + 1; end if;
        end loop;

      elsif fld = 'days_since_purchase' and wf.trigger_type = 'asset_field' then
        for rec in
          select * from fp_assets
          where org_id = wf.org_id and purchase_date is not null
            and (current_date - purchase_date) >= val
            and not exists (
              select 1 from fp_workflow_runs wr
              where wr.workflow_id = wf.id and wr.trigger_ref = fp_assets.id::text
                and (wr.status <> 'skipped' or wr.started_at > now() - interval '1 day')
            )
        loop
          ctx := jsonb_build_object('days_since_purchase', current_date - rec.purchase_date, 'asset', rec.id);
          if fp_exec_workflow(wf, rec.id::text, ctx) then n := n + 1; end if;
        end loop;

      elsif fld = 'days_before_expiry' and wf.trigger_type = 'asset_field' then
        for rec in
          select * from fp_assets
          where org_id = wf.org_id and warranty_expiry is not null
            and warranty_expiry >= current_date
            and (warranty_expiry - current_date) <= val
            and not exists (
              select 1 from fp_workflow_runs wr
              where wr.workflow_id = wf.id and wr.trigger_ref = fp_assets.id::text
                and (wr.status <> 'skipped' or wr.started_at > now() - interval '1 day')
            )
        loop
          ctx := jsonb_build_object('days_before_expiry', rec.warranty_expiry - current_date, 'asset', rec.id);
          if fp_exec_workflow(wf, rec.id::text, ctx) then n := n + 1; end if;
        end loop;
      end if;
    end loop;
  end loop;

  perform set_config('fp.wf_depth', '0', true);
  perform set_config('fp.in_workflow', 'off', true);
  return n;
end;
$$;


-- ---------------------------------------------------------------------------
-- Approvals
-- ---------------------------------------------------------------------------
drop policy if exists appr_insert on fp_approvals;
create policy appr_insert on fp_approvals for insert to authenticated
  with check (
    requested_by = auth.uid()
    and (
      fp_has_role(org_id, array['org_admin', 'manager'])
      or exists (select 1 from fp_work_orders w
                 where w.id = work_order_id and w.org_id = fp_approvals.org_id and w.assigned_to = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Member directory
-- ---------------------------------------------------------------------------
create or replace function fp_org_members(p_org uuid)
returns table (user_id uuid, email text, role text)
language sql
security definer
stable
set search_path = public, auth
as $$
  -- Staff see email addresses; occupants and vendors see a masked form
  -- (enough to recognise a colleague, not to harvest contacts).
  select uo.user_id,
         case when fp_has_role(p_org, array['org_admin', 'manager', 'technician']) or uo.user_id = auth.uid()
              then u.email::text
              else left(split_part(u.email::text, '@', 1), 2) || '•••@' || split_part(u.email::text, '@', 2)
         end,
         uo.role
  from fp_users_orgs uo
  join auth.users u on u.id = uo.user_id
  where uo.org_id = p_org
    and fp_is_member(p_org);
$$;

-- ---------------------------------------------------------------------------
-- Data that drives automation: staff only
-- ---------------------------------------------------------------------------
drop policy if exists readings_insert on fp_meter_readings;
create policy readings_insert on fp_meter_readings for insert to authenticated
  with check ( fp_has_role(org_id, array['org_admin', 'manager', 'technician']) );

drop policy if exists clrun_insert on fp_checklist_runs;
create policy clrun_insert on fp_checklist_runs for insert to authenticated
  with check ( fp_has_role(org_id, array['org_admin', 'manager', 'technician']) );

-- Nothing in the app calls it; Edge Functions use the service role.
revoke execute on function fp_emit_workflow_event(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function fp_emit_workflow_event(uuid, text, text, jsonb) to service_role;
