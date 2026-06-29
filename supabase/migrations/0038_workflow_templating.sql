-- 0038_workflow_templating.sql
-- Email subject/body templating for workflow actions. Action authors can write
-- {{placeholders}} that are filled from the event context at send time, e.g.
--   Subject: "Request {{type}} is {{status}}"
--   Body:    "Priority {{priority}} at {{location_tag}}."
-- Unresolved placeholders are stripped. Applies to email/sms/push/alert bodies.

create or replace function fp_render_template(p_tpl text, p_ctx jsonb)
returns text
language plpgsql
as $$
declare
  out text;
  k   text;
begin
  if p_tpl is null then
    return null;
  end if;
  -- Normalise "{{ key }}" -> "{{key}}", then substitute each context key.
  out := regexp_replace(p_tpl, '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', '{{\1}}', 'g');
  if p_ctx is not null then
    for k in select jsonb_object_keys(p_ctx) loop
      out := replace(out, '{{' || k || '}}', coalesce(p_ctx ->> k, ''));
    end loop;
  end if;
  -- Drop any placeholders with no matching context key.
  out := regexp_replace(out, '\{\{[a-zA-Z0-9_]+\}\}', '', 'g');
  return out;
end;
$$;

-- Action execution with template rendering (subject + body).
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
