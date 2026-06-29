-- 0036_workflow_event_sources.sql
-- Wire the remaining workflow triggers to real source events:
--   * sensor_integration  -> emitted from fp_device_ingest (covers both the
--                            iot-ingest Edge Function and direct device RPC).
--   * low_sentiment        -> DB trigger on inbound fp_messages, using a simple
--                            negative-keyword heuristic (placeholder until a real
--                            AI sentiment pass calls fp_emit_workflow_event).
--   * sor_submitted        -> DB trigger on fp_finance_procurement insert (a
--                            quote / RFQ against the rate schedule).

-- ---------------------------------------------------------------------------
-- fp_device_ingest: same as 0024 plus a sensor_integration workflow emit.
-- ---------------------------------------------------------------------------
create or replace function fp_device_ingest(
  p_key    text,
  p_metric text,
  p_value  numeric default null,
  p_unit   text default null,
  p_ts     timestamptz default now(),
  p_meta   jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  dev record;
  tele_id uuid;
  target_meter uuid;
  r record;
  crossed boolean;
  u record;
  msg text;
  sym text;
begin
  select id, org_id, asset_id, name, meter_id, metric_map, active
    into dev
    from fp_devices
    where device_key = p_key;

  if dev.id is null or not dev.active then
    raise exception 'Invalid or inactive device key';
  end if;

  insert into fp_telemetry (org_id, device_id, metric, value, unit, ts, meta)
  values (dev.org_id, dev.id, p_metric, p_value, p_unit, coalesce(p_ts, now()), p_meta)
  returning id into tele_id;

  update fp_devices set last_seen_at = now() where id = dev.id;

  -- Fire sensor_integration workflows (condition fields: sensor_score / metric).
  if p_value is not null then
    perform fp_run_workflows(dev.org_id, 'sensor_integration', dev.id::text,
      jsonb_build_object('sensor_score', p_value, 'metric', p_metric, 'device', dev.id));
  end if;

  -- Mirror into a meter when this metric (or the device default) maps to one.
  if p_value is not null then
    target_meter := nullif(dev.metric_map ->> p_metric, '')::uuid;
    if target_meter is null then
      target_meter := dev.meter_id;
    end if;
    if target_meter is not null then
      insert into fp_meter_readings (org_id, meter_id, value, read_at)
      values (dev.org_id, target_meter, p_value, coalesce(p_ts, now()));
    end if;
  end if;

  -- Evaluate threshold rules.
  if p_value is not null then
    for r in
      select * from fp_device_rules
      where device_id = dev.id and active
        and (metric is null or metric = p_metric)
    loop
      crossed := case r.op
        when 'gt'  then p_value >  r.threshold
        when 'gte' then p_value >= r.threshold
        when 'lt'  then p_value <  r.threshold
        when 'lte' then p_value <= r.threshold
        when 'eq'  then p_value =  r.threshold
        else false end;

      if crossed and (r.last_fired_at is null
            or now() - r.last_fired_at > make_interval(mins => r.cooldown_minutes)) then
        update fp_device_rules set last_fired_at = now() where id = r.id;

        sym := case r.op when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<'
                         when 'lte' then '<=' else '=' end;
        msg := coalesce(nullif(r.message, ''),
                        p_metric || ' ' || sym || ' ' || r.threshold);

        if r.action in ('work_order','both') then
          insert into fp_requests
            (org_id, title, body_original, source_lng, asset_id, severity, priority, channel, created_by)
          values
            (dev.org_id, dev.name || ': ' || msg,
             'Automatic alert from device ' || dev.name || ' — ' || p_metric || ' = ' || p_value
               || coalesce(' ' || p_unit, ''),
             'en', dev.asset_id, r.severity, r.severity, 'web', null);
        end if;

        if r.action in ('notify','both') then
          for u in
            select user_id from fp_users_orgs
            where org_id = dev.org_id and role in ('org_admin','manager')
          loop
            insert into fp_notifications (org_id, user_id, kind, title, body, link)
            values (dev.org_id, u.user_id, 'device_alert',
                    dev.name, msg, '/devices/' || dev.id);
          end loop;
        end if;
      end if;
    end loop;
  end if;

  return tele_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Low sentiment: inbound message with negative wording. This is a lexical
-- placeholder — a real AI pass should instead call fp_emit_workflow_event(
-- org, 'low_sentiment', ref, '{"sentiment":"low"}') with its own scoring.
-- ---------------------------------------------------------------------------
create or replace function fp_wf_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  if new.direction = 'in'
     and lower(coalesce(new.body, '')) ~ '(bad|terrible|awful|horrible|worst|disappoint|angry|unacceptable|poor|rubbish|useless|hate)' then
    perform fp_run_workflows(new.org_id, 'low_sentiment', new.id::text, jsonb_build_object(
      'sentiment', 'low', 'conversation', new.conversation_id, 'message', new.body));
  end if;
  return new;
end; $$;

drop trigger if exists trg_fp_wf_on_message on fp_messages;
create trigger trg_fp_wf_on_message
  after insert on fp_messages
  for each row execute function fp_wf_on_message();

-- ---------------------------------------------------------------------------
-- SOR submitted: a procurement / quote raised against the schedule of rates.
-- ---------------------------------------------------------------------------
create or replace function fp_wf_on_procurement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  perform fp_run_workflows(new.org_id, 'sor_submitted', new.id::text, jsonb_build_object(
    'service', new.title, 'vendor', new.vendor, 'amount', new.amount, 'status', new.status));
  return new;
end; $$;

drop trigger if exists trg_fp_wf_on_procurement on fp_finance_procurement;
create trigger trg_fp_wf_on_procurement
  after insert on fp_finance_procurement
  for each row execute function fp_wf_on_procurement();
