-- 0024_iot.sql
-- Generic IoT layer. A device is anything that can speak HTTP (directly, or via
-- an MQTT broker bridge that forwards to the ingest endpoint). Devices are
-- vendor-agnostic: they post a metric name + numeric value, optionally mapped to
-- a meter, and threshold rules can raise faults / notifications automatically.

create table fp_devices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  asset_id      uuid references fp_assets(id) on delete set null,
  name          text not null,
  kind          text,                                  -- free label: sensor, gateway, plc, meter, ...
  device_key    text not null unique default replace(gen_random_uuid()::text, '-', ''),
  meter_id      uuid references fp_meters(id) on delete set null,  -- default meter for readings
  metric_map    jsonb not null default '{}'::jsonb,    -- { "<metric>": "<meter_uuid>" } per-metric mapping
  last_seen_at  timestamptz,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table fp_telemetry (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  device_id  uuid not null references fp_devices(id) on delete cascade,
  metric     text not null,
  value      numeric,
  unit       text,
  ts         timestamptz not null default now(),
  meta       jsonb,
  created_at timestamptz not null default now()
);

create table fp_device_rules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references fp_organizations(id) on delete cascade,
  device_id       uuid not null references fp_devices(id) on delete cascade,
  metric          text,                                -- null = any metric
  op              text not null check (op in ('gt','gte','lt','lte','eq')),
  threshold       numeric not null,
  action          text not null default 'both' check (action in ('notify','work_order','both')),
  severity        text not null default 'high',
  message         text,
  cooldown_minutes int not null default 60,
  last_fired_at   timestamptz,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index fp_telemetry_device_idx on fp_telemetry (device_id, ts desc);
create index fp_telemetry_org_idx     on fp_telemetry (org_id, ts desc);
create index fp_device_rules_dev_idx   on fp_device_rules (device_id);

create trigger trg_fp_devices_touch
  before update on fp_devices for each row execute function fp_touch_updated_at();

create trigger trg_audit_devices after insert or update or delete
  on fp_devices for each row execute function fp_audit();

-- ---------------------------------------------------------------------------
-- Ingest: authenticated by the device key (not a Supabase user). Devices POST
-- to /rest/v1/rpc/fp_device_ingest with the anon apikey + their device_key.
-- Writes telemetry, mirrors to a meter when mapped, and evaluates rules.
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
-- RLS
-- ---------------------------------------------------------------------------
alter table fp_devices      enable row level security;
alter table fp_telemetry    enable row level security;
alter table fp_device_rules enable row level security;

-- Device rows carry the secret key, so restrict reads to admins/managers.
create policy dev_select on fp_devices for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
create policy dev_write on fp_devices for all to authenticated
  using ( fp_has_role(org_id, array['org_admin']) )
  with check ( fp_has_role(org_id, array['org_admin']) );

-- Telemetry has no secrets; any member can read it. Inserts are definer-only.
create policy tele_select on fp_telemetry for select to authenticated
  using ( fp_is_member(org_id) );

create policy rules_select on fp_device_rules for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
create policy rules_write on fp_device_rules for all to authenticated
  using ( fp_has_role(org_id, array['org_admin']) )
  with check ( fp_has_role(org_id, array['org_admin']) );

-- Devices authenticate with their key, so the ingest RPC is open to anon.
grant execute on function fp_device_ingest(text, text, numeric, text, timestamptz, jsonb)
  to anon, authenticated;
