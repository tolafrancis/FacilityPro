-- 0063_public_endpoint_limits.sql
-- Audit finding S2-H3 (plus the IoT parts of S1-H7): the two endpoints that
-- anyone can call — QR fault reporting (fp_public_report) and device ingest
-- (fp_device_ingest) — had no size limits, no throttling and no validation,
-- so a script could flood a tenant with requests/work orders/notifications.
-- Covered by supabase/security-tests/public_limits.sql.
--
-- Public reports:
--   * title ≤ 200, details ≤ 4000, reporter ≤ 200 characters.
--   * asset/location must belong to the org (clear error instead of an FK one).
--   * The same problem reported twice for the same asset/location within 30
--     minutes returns the existing request instead of creating another.
--   * Throttles: 5 reports / 10 min per client IP per org, 10 / hour per
--     asset, 60 / hour per org. The client IP comes from the request headers
--     PostgREST passes through; only the service role (the optional CAPTCHA
--     Edge Function) may supply it explicitly.
--
-- Device ingest:
--   * metric ≤ 64, unit ≤ 16 characters, meta ≤ 4 KB.
--   * Timestamps in the future are clamped to now (a device with a bad clock
--     can no longer become "the latest reading" for PM and dashboards).
--   * An identical reading (device, metric, timestamp) is stored once.
--   * At most 600 readings per device per minute (a gateway flushing a buffered
--     batch of up to 500 fits; a runaway loop does not).
--   * A threshold rule fires once per cooldown even under concurrent readings.
--   * last_seen_at is written at most once a minute (it also fed the audit log
--     one full device row per reading).

-- ===========================================================================
-- Public reports
-- ===========================================================================
create table if not exists fp_public_report_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  client_key text,                -- md5 of the client IP (never the IP itself)
  asset_id   uuid,
  created_at timestamptz not null default now()
);
create index if not exists fp_public_report_log_org_idx on fp_public_report_log (org_id, created_at desc);
create index if not exists fp_public_report_log_client_idx on fp_public_report_log (org_id, client_key, created_at desc);
alter table fp_public_report_log enable row level security;  -- no policies: definer-only

-- Client IP as seen by PostgREST (Supabase sits behind a proxy).
create or replace function fp_request_client_ip()
returns text
language plpgsql
stable
as $$
declare
  h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  return nullif(btrim(coalesce(
    h->>'cf-connecting-ip',
    split_part(h->>'x-forwarded-for', ',', 1),
    h->>'x-real-ip')), '');
end;
$$;

drop function if exists fp_public_report(uuid, text, text, text, text, uuid, uuid, text);

create or replace function fp_public_report(
  p_org       uuid,
  p_title     text,
  p_body      text default null,
  p_severity  text default 'medium',
  p_lng       text default 'en',
  p_asset     uuid default null,
  p_location  uuid default null,
  p_reporter  text default null,
  p_client_ip text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed  boolean;
  sev      text;
  v_title  text := btrim(coalesce(p_title, ''));
  v_ip     text;
  v_client text;
  existing uuid;
  new_id   uuid;
begin
  select allow_public_requests into allowed from fp_organizations where id = p_org;
  if not coalesce(allowed, false) then
    raise exception 'Public reporting is not enabled for this organization';
  end if;

  if length(v_title) > 200 or length(coalesce(p_body, '')) > 4000 or length(coalesce(p_reporter, '')) > 200 then
    raise exception 'report_too_long' using errcode = 'P0001',
      detail = 'Keep the title under 200 and the details under 4000 characters.';
  end if;
  if p_asset is not null and not exists (select 1 from fp_assets where id = p_asset and org_id = p_org) then
    raise exception 'report_invalid_asset' using errcode = 'P0001';
  end if;
  if p_location is not null and not exists (select 1 from fp_locations where id = p_location and org_id = p_org) then
    raise exception 'report_invalid_location' using errcode = 'P0001';
  end if;

  -- Only a trusted caller (the CAPTCHA Edge Function, as service_role) may
  -- say which client it is relaying for; anyone else is identified by the
  -- connection's own headers.
  v_ip := case when auth.role() = 'service_role' then nullif(btrim(p_client_ip), '') end;
  v_ip := coalesce(v_ip, fp_request_client_ip());
  v_client := case when v_ip is not null then md5(p_org::text || ':' || v_ip) end;

  -- Serialise per org so parallel submissions can't slip past the limits.
  perform pg_advisory_xact_lock(hashtext('fp_public_report:' || p_org::text));

  -- Same problem already reported moments ago (double tap, several people
  -- scanning the same broken machine): hand back that request.
  select r.id into existing
    from fp_requests r
    where r.org_id = p_org and r.channel = 'qr'
      and r.asset_id is not distinct from p_asset
      and r.location_id is not distinct from p_location
      and lower(coalesce(r.title, '')) = lower(coalesce(nullif(v_title, ''), 'Reported issue'))
      and r.created_at > now() - interval '30 minutes'
      and r.status not in ('resolved', 'closed', 'rejected')
    order by r.created_at desc
    limit 1;
  if existing is not null then
    return existing;
  end if;

  if (v_client is not null and (select count(*) from fp_public_report_log
                                where org_id = p_org and client_key = v_client
                                  and created_at > now() - interval '10 minutes') >= 5)
     or (p_asset is not null and (select count(*) from fp_public_report_log
                                  where org_id = p_org and asset_id = p_asset
                                    and created_at > now() - interval '1 hour') >= 10)
     or (select count(*) from fp_public_report_log
         where org_id = p_org and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001',
      detail = 'Too many reports right now. Please try again in a few minutes.';
  end if;

  sev := case when p_severity in ('low','medium','high','critical') then p_severity else 'medium' end;

  insert into fp_requests
    (org_id, title, body_original, source_lng, asset_id, location_id,
     severity, priority, channel, created_by)
  values
    (p_org,
     coalesce(nullif(v_title, ''), 'Reported issue'),
     nullif(trim(coalesce(p_body, '') || case when nullif(btrim(p_reporter), '') is not null
            then E'\n\n— ' || btrim(p_reporter) else '' end), ''),
     case when p_lng in ('en', 'vi') then p_lng else 'en' end,
     p_asset, p_location,
     sev, sev, 'qr', null)
  returning id into new_id;

  insert into fp_public_report_log (org_id, client_key, asset_id) values (p_org, v_client, p_asset);
  return new_id;
end;
$$;

-- ===========================================================================
-- Device ingest (same as 0036, with the limits above)
-- ===========================================================================
create index if not exists fp_telemetry_device_created_idx on fp_telemetry (device_id, created_at desc);
create index if not exists fp_telemetry_dedupe_idx on fp_telemetry (device_id, metric, ts);

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
  v_ts timestamptz;
  v_fired int;
begin
  select id, org_id, asset_id, name, meter_id, metric_map, active, last_seen_at
    into dev
    from fp_devices
    where device_key = p_key;

  if dev.id is null or not dev.active then
    raise exception 'Invalid or inactive device key';
  end if;

  if p_metric is null or btrim(p_metric) = '' or length(p_metric) > 64
     or length(coalesce(p_unit, '')) > 16
     or (p_meta is not null and length(p_meta::text) > 4096) then
    raise exception 'reading_invalid' using errcode = 'P0001',
      detail = 'metric is required (max 64 chars); unit max 16 chars; meta max 4 KB.';
  end if;

  -- A device clock in the future must not produce "latest" readings.
  v_ts := least(coalesce(p_ts, now()), now());

  -- The same reading delivered twice (MQTT QoS 1 redelivery, retries).
  select id into tele_id from fp_telemetry
    where device_id = dev.id and metric = p_metric and ts = v_ts
    limit 1;
  if tele_id is not null then
    return tele_id;
  end if;

  if (select count(*) from fp_telemetry
      where device_id = dev.id and created_at > now() - interval '1 minute') >= 600 then
    raise exception 'rate_limited' using errcode = 'P0001',
      detail = 'Device is sending more than 600 readings a minute.';
  end if;

  insert into fp_telemetry (org_id, device_id, metric, value, unit, ts, meta)
  values (dev.org_id, dev.id, p_metric, p_value, p_unit, v_ts, p_meta)
  returning id into tele_id;

  if dev.last_seen_at is null or dev.last_seen_at < now() - interval '1 minute' then
    update fp_devices set last_seen_at = now() where id = dev.id;
  end if;

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
      values (dev.org_id, target_meter, p_value, v_ts);
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
      continue when not crossed;

      -- Claim the firing atomically: of several concurrent readings, exactly
      -- one gets past the cooldown.
      update fp_device_rules set last_fired_at = now()
        where id = r.id
          and (last_fired_at is null
               or now() - last_fired_at > make_interval(mins => cooldown_minutes));
      get diagnostics v_fired = row_count;
      continue when v_fired = 0;

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
    end loop;
  end if;

  return tele_id;
end;
$$;

-- ===========================================================================
-- Grants (0059 allow-list): the public entry points stay open to anon.
-- ===========================================================================
revoke execute on function fp_request_client_ip() from public, anon, authenticated;
grant execute on function fp_public_report(uuid, text, text, text, text, uuid, uuid, text, text) to anon, authenticated, service_role;
grant execute on function fp_device_ingest(text, text, numeric, text, timestamptz, jsonb) to anon, authenticated, service_role;
