-- 0077_iot_platform.sql
-- Universal IoT integration layer (docs/IOT_ARCHITECTURE.md), built on the
-- 0024/0043/0063/0067 device layer rather than beside it.
-- Covered by supabase/security-tests/iot_platform.sql.
--
--   Catalog (hardware-agnostic, extendable without code changes)
--     * fp_iot_quantities   canonical metrics + their canonical unit
--     * fp_iot_units        unit conversions (°F→°C, kW→W, MWh→kWh, bar→kPa…)
--     * fp_iot_device_types taxonomy (energy / hvac / water / environment /
--                           occupancy / safety / asset_monitoring)
--     * fp_iot_manufacturers, fp_iot_device_models (data-point templates,
--                           Modbus register maps, supported commands)
--     Global rows (org_id null) are maintained by platform admins; an org
--     can add its own types, manufacturers and models.
--
--   Devices
--     * fp_devices gains location (building/floor/zone/room → site), type,
--       model, protocol, external id (DevEUI, serial, Modbus unit…), gateway,
--       non-secret connection settings and firmware. Battery and signal are
--       ordinary metrics.
--     * fp_device_credentials: per-device secrets (LoRaWAN AppKey, vendor API
--       tokens). Admins can write them; no client can read them back.
--     * fp_device_directory: the device list without device keys, for every
--       member (technicians included), with computed status.
--     * fp_iot_gateways: edge gateways (Modbus / LoRaWAN / BACnet adapters)
--       with their own key; one gateway reports for many devices.
--
--   Data points & normalisation
--     * fp_device_data_points maps what a device sends (its key) to a
--       canonical metric, with scale/offset, source unit and the protocol
--       address (Modbus register, BACnet object, LoRaWAN field). Unknown keys
--       are recorded as "discovered" so an admin can map them.
--     * Every reading is normalised on ingest: key → metric, scale/offset,
--       unit → the metric's canonical unit. The raw reading is kept in meta.
--     * fp_device_latest: latest value per device and metric (live data;
--       published to Supabase Realtime).
--
--   Alerts & rules
--     * fp_device_alerts with severity info / warning / critical / emergency;
--       one open alert per rule (repeats are counted), auto-resolved when the
--       condition clears, acknowledged/resolved by staff, escalated when left
--       unacknowledged.
--     * fp_device_rules gains AND-conditions on other metrics/devices,
--       a baseline-deviation operator, recipients, working hours, suppression
--       and escalation.
--
--   Commands (two-way)
--     * fp_device_commands: requested through fp_device_command() only, which
--       checks role, site, the data point's writability and range, that the
--       device is online, and a rate limit; commands expire and are never
--       delivered after that. Gateways/devices claim and report results with
--       their key. Every command is audited.

-- ===========================================================================
-- Catalog
-- ===========================================================================
create table if not exists fp_iot_quantities (
  code           text primary key,              -- canonical metric name
  canonical_unit text,                          -- null = dimensionless / state
  category       text not null,
  name_i18n      jsonb not null
);

create table if not exists fp_iot_units (
  unit      text primary key,                   -- as devices send it (case-sensitive aliases listed)
  base_unit text not null,                      -- units sharing a base convert to each other
  factor    numeric not null,                   -- base = value * factor + "offset"
  "offset"  numeric not null default 0
);

create table if not exists fp_iot_device_types (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references fp_organizations(id) on delete cascade,   -- null = global
  code       text not null,
  category   text not null check (category in ('energy','hvac','water','environment','occupancy','safety','asset_monitoring','gateway','other')),
  name_i18n  jsonb not null,
  metrics    text[] not null default '{}',                             -- typical canonical metrics
  created_at timestamptz not null default now()
);
create unique index if not exists fp_iot_device_types_code_uk
  on fp_iot_device_types (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

create table if not exists fp_iot_manufacturers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references fp_organizations(id) on delete cascade,
  name       text not null,
  website    text,
  created_at timestamptz not null default now()
);
create unique index if not exists fp_iot_manufacturers_name_uk
  on fp_iot_manufacturers (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- data_points: [{key, metric, name, unit, scale, offset, writable, dangerous,
--                min, max, source: {…protocol address…}}]
-- commands:    [{code, label, data_point, value?, dangerous?}]
create table if not exists fp_iot_device_models (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references fp_organizations(id) on delete cascade,
  manufacturer_id uuid not null references fp_iot_manufacturers(id) on delete cascade,
  device_type_id  uuid references fp_iot_device_types(id) on delete set null,
  model           text not null,
  protocols       text[] not null default '{}',
  data_points     jsonb not null default '[]'::jsonb check (jsonb_typeof(data_points) = 'array'),
  commands        jsonb not null default '[]'::jsonb check (jsonb_typeof(commands) = 'array'),
  notes           text,
  created_at      timestamptz not null default now()
);
create unique index if not exists fp_iot_device_models_uk
  on fp_iot_device_models (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), manufacturer_id, lower(model));

alter table fp_iot_quantities   enable row level security;
alter table fp_iot_units        enable row level security;
alter table fp_iot_device_types enable row level security;
alter table fp_iot_manufacturers enable row level security;
alter table fp_iot_device_models enable row level security;

drop policy if exists iot_quantities_read on fp_iot_quantities;
create policy iot_quantities_read on fp_iot_quantities for select to authenticated using (true);
drop policy if exists iot_quantities_write on fp_iot_quantities;
create policy iot_quantities_write on fp_iot_quantities for all to authenticated
  using (fp_is_platform_admin()) with check (fp_is_platform_admin());
drop policy if exists iot_units_read on fp_iot_units;
create policy iot_units_read on fp_iot_units for select to authenticated using (true);
drop policy if exists iot_units_write on fp_iot_units;
create policy iot_units_write on fp_iot_units for all to authenticated
  using (fp_is_platform_admin()) with check (fp_is_platform_admin());

do $$
declare t text;
begin
  foreach t in array array['fp_iot_device_types','fp_iot_manufacturers','fp_iot_device_models'] loop
    execute format('drop policy if exists catalog_read on %I', t);
    execute format($p$create policy catalog_read on %I for select to authenticated
      using (org_id is null or fp_is_member(org_id))$p$, t);
    execute format('drop policy if exists catalog_write on %I', t);
    execute format($p$create policy catalog_write on %I for all to authenticated
      using ((org_id is null and fp_is_platform_admin()) or (org_id is not null and fp_has_role(org_id, array['org_admin'])))
      with check ((org_id is null and fp_is_platform_admin()) or (org_id is not null and fp_has_role(org_id, array['org_admin'])))$p$, t);
  end loop;
end $$;

-- Converts between units of the same base; null when there is no path.
create or replace function fp_iot_convert(p_value numeric, p_from text, p_to text)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when p_value is null then null
    when p_from = p_to then p_value
    -- rounded so 212 °F is exactly 100 °C, not 99.999…
    else (select round(((p_value * f.factor + f."offset") - t."offset") / t.factor, 9)
            from fp_iot_units f join fp_iot_units t on t.base_unit = f.base_unit
            where f.unit = p_from and t.unit = p_to)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog seed (global)
-- ---------------------------------------------------------------------------
insert into fp_iot_quantities (code, canonical_unit, category, name_i18n) values
  ('temperature',       '°C',    'environment', '{"en":"Temperature","vi":"Nhiệt độ"}'),
  ('humidity',          '%',     'environment', '{"en":"Humidity","vi":"Độ ẩm"}'),
  ('co2',               'ppm',   'environment', '{"en":"CO₂","vi":"CO₂"}'),
  ('pm2_5',             'µg/m³', 'environment', '{"en":"PM2.5","vi":"PM2.5"}'),
  ('pm10',              'µg/m³', 'environment', '{"en":"PM10","vi":"PM10"}'),
  ('tvoc',              'ppb',   'environment', '{"en":"TVOC","vi":"TVOC"}'),
  ('noise',             'dB',    'environment', '{"en":"Noise","vi":"Tiếng ồn"}'),
  ('illuminance',       'lx',    'environment', '{"en":"Light","vi":"Ánh sáng"}'),
  ('voltage',           'V',     'energy',      '{"en":"Voltage","vi":"Điện áp"}'),
  ('voltage_l1',        'V',     'energy',      '{"en":"Voltage L1","vi":"Điện áp L1"}'),
  ('voltage_l2',        'V',     'energy',      '{"en":"Voltage L2","vi":"Điện áp L2"}'),
  ('voltage_l3',        'V',     'energy',      '{"en":"Voltage L3","vi":"Điện áp L3"}'),
  ('current',           'A',     'energy',      '{"en":"Current","vi":"Dòng điện"}'),
  ('current_l1',        'A',     'energy',      '{"en":"Current L1","vi":"Dòng điện L1"}'),
  ('current_l2',        'A',     'energy',      '{"en":"Current L2","vi":"Dòng điện L2"}'),
  ('current_l3',        'A',     'energy',      '{"en":"Current L3","vi":"Dòng điện L3"}'),
  ('power',             'W',     'energy',      '{"en":"Active power","vi":"Công suất tác dụng"}'),
  ('reactive_power',    'var',   'energy',      '{"en":"Reactive power","vi":"Công suất phản kháng"}'),
  ('apparent_power',    'VA',    'energy',      '{"en":"Apparent power","vi":"Công suất biểu kiến"}'),
  ('power_factor',      null,    'energy',      '{"en":"Power factor","vi":"Hệ số công suất"}'),
  ('frequency',         'Hz',    'energy',      '{"en":"Frequency","vi":"Tần số"}'),
  ('energy',            'kWh',   'energy',      '{"en":"Energy","vi":"Điện năng"}'),
  ('pressure',          'kPa',   'hvac',        '{"en":"Pressure","vi":"Áp suất"}'),
  ('differential_pressure', 'Pa','hvac',        '{"en":"Differential pressure","vi":"Chênh áp"}'),
  ('airflow',           'm³/h',  'hvac',        '{"en":"Airflow","vi":"Lưu lượng gió"}'),
  ('setpoint',          '°C',    'hvac',        '{"en":"Setpoint","vi":"Nhiệt độ cài đặt"}'),
  ('power_state',       null,    'hvac',        '{"en":"On/off","vi":"Bật/tắt"}'),
  ('mode',              null,    'hvac',        '{"en":"Operating mode","vi":"Chế độ vận hành"}'),
  ('fan_speed',         null,    'hvac',        '{"en":"Fan speed","vi":"Tốc độ quạt"}'),
  ('flow',              'L/min', 'water',       '{"en":"Flow","vi":"Lưu lượng"}'),
  ('water_volume',      'm³',    'water',       '{"en":"Water volume","vi":"Thể tích nước"}'),
  ('water_level',       'm',     'water',       '{"en":"Water level","vi":"Mực nước"}'),
  ('leak',              null,    'water',       '{"en":"Leak","vi":"Rò rỉ"}'),
  ('occupancy',         null,    'occupancy',   '{"en":"Occupancy","vi":"Có người"}'),
  ('people_count',      null,    'occupancy',   '{"en":"People count","vi":"Số người"}'),
  ('motion',            null,    'occupancy',   '{"en":"Motion","vi":"Chuyển động"}'),
  ('door_open',         null,    'occupancy',   '{"en":"Door open","vi":"Cửa mở"}'),
  ('smoke',             null,    'safety',      '{"en":"Smoke","vi":"Khói"}'),
  ('alarm',             null,    'safety',      '{"en":"Alarm","vi":"Báo động"}'),
  ('vibration',         'mm/s',  'asset_monitoring', '{"en":"Vibration","vi":"Độ rung"}'),
  ('runtime',           'h',     'asset_monitoring', '{"en":"Runtime","vi":"Thời gian chạy"}'),
  ('motor_state',       null,    'asset_monitoring', '{"en":"Motor status","vi":"Trạng thái động cơ"}'),
  ('fault',             null,    'asset_monitoring', '{"en":"Fault","vi":"Lỗi"}'),
  ('battery',           '%',     'health',      '{"en":"Battery","vi":"Pin"}'),
  ('rssi',              'dBm',   'health',      '{"en":"Signal strength","vi":"Cường độ tín hiệu"}'),
  ('snr',               'dB',    'health',      '{"en":"Signal-to-noise","vi":"Tỉ số tín hiệu/nhiễu"}')
on conflict (code) do update set canonical_unit = excluded.canonical_unit, category = excluded.category, name_i18n = excluded.name_i18n;

insert into fp_iot_units (unit, base_unit, factor, "offset") values
  -- temperature (base °C)
  ('°C', '°C', 1, 0), ('C', '°C', 1, 0), ('degC', '°C', 1, 0), ('celsius', '°C', 1, 0),
  ('°F', '°C', 5.0/9, -160.0/9), ('F', '°C', 5.0/9, -160.0/9), ('degF', '°C', 5.0/9, -160.0/9),
  ('K', '°C', 1, -273.15),
  -- power (base W)
  ('W', 'W', 1, 0), ('kW', 'W', 1000, 0), ('MW', 'W', 1000000, 0),
  ('var', 'var', 1, 0), ('kvar', 'var', 1000, 0), ('VA', 'VA', 1, 0), ('kVA', 'VA', 1000, 0),
  -- energy (base kWh)
  ('kWh', 'kWh', 1, 0), ('Wh', 'kWh', 0.001, 0), ('MWh', 'kWh', 1000, 0),
  -- electrical
  ('V', 'V', 1, 0), ('mV', 'V', 0.001, 0), ('kV', 'V', 1000, 0),
  ('A', 'A', 1, 0), ('mA', 'A', 0.001, 0),
  ('Hz', 'Hz', 1, 0),
  -- pressure (base kPa)
  ('kPa', 'kPa', 1, 0), ('Pa', 'kPa', 0.001, 0), ('hPa', 'kPa', 0.1, 0), ('bar', 'kPa', 100, 0),
  ('mbar', 'kPa', 0.1, 0), ('psi', 'kPa', 6.894757, 0), ('inH2O', 'kPa', 0.249089, 0),
  -- flow (base L/min)
  ('L/min', 'L/min', 1, 0), ('L/s', 'L/min', 60, 0), ('m³/h', 'L/min', 1000.0/60, 0), ('m3/h', 'L/min', 1000.0/60, 0),
  ('gpm', 'L/min', 3.785412, 0),
  -- volume (base m³)
  ('m³', 'm³', 1, 0), ('m3', 'm³', 1, 0), ('L', 'm³', 0.001, 0),
  -- misc
  ('%', '%', 1, 0), ('ppm', 'ppm', 1, 0), ('ppb', 'ppb', 1, 0), ('µg/m³', 'µg/m³', 1, 0), ('ug/m3', 'µg/m³', 1, 0),
  ('dB', 'dB', 1, 0), ('dBA', 'dB', 1, 0), ('lx', 'lx', 1, 0), ('lux', 'lx', 1, 0), ('dBm', 'dBm', 1, 0),
  ('mm/s', 'mm/s', 1, 0), ('m/s', 'm/s', 1, 0),
  ('h', 'h', 1, 0), ('min', 'h', 1.0/60, 0), ('s', 'h', 1.0/3600, 0),
  ('m', 'm', 1, 0), ('cm', 'm', 0.01, 0), ('mm', 'm', 0.001, 0)
on conflict (unit) do update set base_unit = excluded.base_unit, factor = excluded.factor, "offset" = excluded."offset";

insert into fp_iot_device_types (org_id, code, category, name_i18n, metrics) values
  (null, 'electricity_meter',  'energy', '{"en":"Electricity meter","vi":"Đồng hồ điện"}', '{energy,power,voltage,current,power_factor,frequency}'),
  (null, 'power_meter',        'energy', '{"en":"Power meter","vi":"Đồng hồ công suất"}', '{power,voltage_l1,voltage_l2,voltage_l3,current_l1,current_l2,current_l3,power_factor,frequency,energy}'),
  (null, 'current_transformer','energy', '{"en":"Current transformer","vi":"Biến dòng"}', '{current}'),
  (null, 'voltage_sensor',     'energy', '{"en":"Voltage sensor","vi":"Cảm biến điện áp"}', '{voltage}'),
  (null, 'power_quality_meter','energy', '{"en":"Power-quality meter","vi":"Đồng hồ chất lượng điện"}', '{voltage,current,power_factor,frequency}'),
  (null, 'temperature_sensor', 'hvac', '{"en":"Temperature sensor","vi":"Cảm biến nhiệt độ"}', '{temperature}'),
  (null, 'humidity_sensor',    'hvac', '{"en":"Humidity sensor","vi":"Cảm biến độ ẩm"}', '{humidity}'),
  (null, 'temperature_humidity','hvac', '{"en":"Temperature/humidity sensor","vi":"Cảm biến nhiệt độ/độ ẩm"}', '{temperature,humidity}'),
  (null, 'co2_sensor',         'hvac', '{"en":"CO₂ sensor","vi":"Cảm biến CO₂"}', '{co2}'),
  (null, 'differential_pressure_sensor','hvac', '{"en":"Differential pressure sensor","vi":"Cảm biến chênh áp"}', '{differential_pressure}'),
  (null, 'airflow_sensor',     'hvac', '{"en":"Airflow sensor","vi":"Cảm biến lưu lượng gió"}', '{airflow}'),
  (null, 'ahu_controller',     'hvac', '{"en":"AHU controller","vi":"Bộ điều khiển AHU"}', '{temperature,setpoint,power_state,mode,fan_speed}'),
  (null, 'fcu_controller',     'hvac', '{"en":"FCU controller","vi":"Bộ điều khiển FCU"}', '{temperature,setpoint,power_state,mode,fan_speed}'),
  (null, 'chiller',            'hvac', '{"en":"Chiller","vi":"Máy làm lạnh (chiller)"}', '{temperature,setpoint,power_state,power,fault}'),
  (null, 'vrf_system',         'hvac', '{"en":"VRF/VRV system","vi":"Hệ thống VRF/VRV"}', '{temperature,setpoint,power_state,mode,fault}'),
  (null, 'water_meter',        'water', '{"en":"Water meter","vi":"Đồng hồ nước"}', '{water_volume,flow}'),
  (null, 'flow_meter',         'water', '{"en":"Flow meter","vi":"Lưu lượng kế"}', '{flow}'),
  (null, 'water_level_sensor', 'water', '{"en":"Water-level sensor","vi":"Cảm biến mực nước"}', '{water_level}'),
  (null, 'leak_sensor',        'water', '{"en":"Leak sensor","vi":"Cảm biến rò rỉ"}', '{leak}'),
  (null, 'pressure_sensor',    'water', '{"en":"Pressure sensor","vi":"Cảm biến áp suất"}', '{pressure}'),
  (null, 'iaq_sensor',         'environment', '{"en":"Indoor air-quality sensor","vi":"Cảm biến chất lượng không khí"}', '{co2,pm2_5,pm10,tvoc,temperature,humidity,noise,illuminance}'),
  (null, 'pir_sensor',         'occupancy', '{"en":"PIR sensor","vi":"Cảm biến PIR"}', '{motion,occupancy}'),
  (null, 'mmwave_sensor',      'occupancy', '{"en":"mmWave presence sensor","vi":"Cảm biến hiện diện mmWave"}', '{occupancy,people_count}'),
  (null, 'people_counter',     'occupancy', '{"en":"People counter","vi":"Bộ đếm người"}', '{people_count}'),
  (null, 'door_sensor',        'occupancy', '{"en":"Door sensor","vi":"Cảm biến cửa"}', '{door_open}'),
  (null, 'occupancy_sensor',   'occupancy', '{"en":"Occupancy sensor","vi":"Cảm biến hiện diện"}', '{occupancy}'),
  (null, 'smoke_detection',    'safety', '{"en":"Smoke detection integration","vi":"Tích hợp báo khói"}', '{smoke,alarm}'),
  (null, 'fire_alarm',         'safety', '{"en":"Fire alarm integration","vi":"Tích hợp báo cháy"}', '{alarm,fault}'),
  (null, 'emergency_alarm',    'safety', '{"en":"Emergency alarm","vi":"Báo động khẩn cấp"}', '{alarm}'),
  (null, 'access_control',     'safety', '{"en":"Door access integration","vi":"Tích hợp kiểm soát ra vào"}', '{door_open,alarm}'),
  (null, 'vibration_sensor',   'asset_monitoring', '{"en":"Vibration sensor","vi":"Cảm biến rung"}', '{vibration,temperature}'),
  (null, 'motor_monitor',      'asset_monitoring', '{"en":"Motor monitor","vi":"Giám sát động cơ"}', '{current,temperature,vibration,runtime,motor_state,fault}'),
  (null, 'iot_gateway',        'gateway', '{"en":"IoT gateway","vi":"Gateway IoT"}', '{}'),
  (null, 'other',              'other', '{"en":"Other","vi":"Khác"}', '{}')
on conflict do nothing;

insert into fp_iot_manufacturers (org_id, name, website) values
  (null, 'Generic', null),
  (null, 'Schneider Electric', 'https://www.se.com'),
  (null, 'Siemens', 'https://www.siemens.com'),
  (null, 'Daviteq', 'https://www.daviteq.com'),
  (null, 'EPCB', null),
  (null, 'Milesight', 'https://www.milesight.com'),
  (null, 'Dragino', 'https://www.dragino.com')
on conflict do nothing;

-- Models. Register addresses follow the manufacturer's register table as
-- printed (1-based; the gateway subtracts 1 when "one_based" is true).
-- Verify them against the manual of the exact firmware before relying on them.
insert into fp_iot_device_models (org_id, manufacturer_id, device_type_id, model, protocols, data_points, commands, notes)
select null, m.id, t.id, v.model, v.protocols::text[], v.data_points::jsonb, v.commands::jsonb, v.notes
from (values
  ('Generic', 'temperature_humidity', 'MQTT temperature/humidity sensor', '{mqtt,http}',
   '[{"key":"temperature","metric":"temperature","unit":"°C"},{"key":"humidity","metric":"humidity","unit":"%"},{"key":"battery","metric":"battery","unit":"%"}]',
   '[]', 'Any device publishing JSON {"temperature":…, "humidity":…}.'),
  ('Generic', 'electricity_meter', 'Modbus energy meter (template)', '{modbus_tcp,modbus_rtu}',
   '[{"key":"power","metric":"power","unit":"kW","source":{"register_type":"holding","address":0,"datatype":"float32","one_based":false}},{"key":"energy","metric":"energy","unit":"kWh","source":{"register_type":"holding","address":2,"datatype":"float32","one_based":false}}]',
   '[]', 'Template: copy the model and enter your meter''s register table.'),
  ('Generic', 'fcu_controller', 'MQTT thermostat / FCU controller', '{mqtt}',
   '[{"key":"temperature","metric":"temperature","unit":"°C"},{"key":"setpoint","metric":"setpoint","unit":"°C","writable":true,"min":16,"max":30},{"key":"power","metric":"power_state","writable":true,"min":0,"max":1},{"key":"mode","metric":"mode","writable":true,"min":0,"max":4}]',
   '[{"code":"set_setpoint","label":"Set temperature","data_point":"setpoint"},{"code":"turn_on","label":"Turn on","data_point":"power","value":1},{"code":"turn_off","label":"Turn off","data_point":"power","value":0},{"code":"set_mode","label":"Set mode","data_point":"mode"}]',
   'Commands are published to facilitypro/{org}/{site}/{device}/command.'),
  ('Schneider Electric', 'power_meter', 'iEM3250', '{modbus_rtu,modbus_tcp}',
   '[{"key":"current_l1","metric":"current_l1","unit":"A","source":{"register_type":"holding","address":3000,"datatype":"float32","one_based":true}},
     {"key":"current_l2","metric":"current_l2","unit":"A","source":{"register_type":"holding","address":3002,"datatype":"float32","one_based":true}},
     {"key":"current_l3","metric":"current_l3","unit":"A","source":{"register_type":"holding","address":3004,"datatype":"float32","one_based":true}},
     {"key":"voltage_l1","metric":"voltage_l1","unit":"V","source":{"register_type":"holding","address":3028,"datatype":"float32","one_based":true}},
     {"key":"voltage_l2","metric":"voltage_l2","unit":"V","source":{"register_type":"holding","address":3030,"datatype":"float32","one_based":true}},
     {"key":"voltage_l3","metric":"voltage_l3","unit":"V","source":{"register_type":"holding","address":3032,"datatype":"float32","one_based":true}},
     {"key":"power","metric":"power","unit":"kW","source":{"register_type":"holding","address":3060,"datatype":"float32","one_based":true}},
     {"key":"power_factor","metric":"power_factor","source":{"register_type":"holding","address":3084,"datatype":"float32","one_based":true}},
     {"key":"frequency","metric":"frequency","unit":"Hz","source":{"register_type":"holding","address":3110,"datatype":"float32","one_based":true}},
     {"key":"energy","metric":"energy","unit":"Wh","source":{"register_type":"holding","address":3204,"datatype":"int64","one_based":true}}]',
   '[]', 'Register map from the iEM3000 series user manual; verify for your firmware.'),
  ('Milesight', 'temperature_humidity', 'EM300-TH', '{lorawan}',
   '[{"key":"temperature","metric":"temperature","unit":"°C"},{"key":"humidity","metric":"humidity","unit":"%"},{"key":"battery","metric":"battery","unit":"%"}]',
   '[]', 'Decode uplinks with Milesight''s codec in your network server.'),
  ('Milesight', 'iaq_sensor', 'AM307', '{lorawan}',
   '[{"key":"temperature","metric":"temperature","unit":"°C"},{"key":"humidity","metric":"humidity","unit":"%"},{"key":"co2","metric":"co2","unit":"ppm"},{"key":"tvoc","metric":"tvoc"},{"key":"pressure","metric":"pressure","unit":"hPa"},{"key":"light_level","metric":"illuminance"},{"key":"pir","metric":"motion"},{"key":"battery","metric":"battery","unit":"%"}]',
   '[]', 'Decode uplinks with Milesight''s codec in your network server.'),
  ('Dragino', 'temperature_humidity', 'LHT65', '{lorawan}',
   '[{"key":"TempC_SHT","metric":"temperature","unit":"°C"},{"key":"Hum_SHT","metric":"humidity","unit":"%"},{"key":"BatV","metric":"battery_voltage","unit":"V"}]',
   '[]', 'Field names from Dragino''s payload decoder.'),
  ('Daviteq', 'temperature_humidity', 'WSLRW-ATH', '{lorawan}',
   '[{"key":"temperature","metric":"temperature","unit":"°C"},{"key":"humidity","metric":"humidity","unit":"%"},{"key":"battery","metric":"battery","unit":"%"}]',
   '[]', 'Map the keys to the field names your network-server decoder outputs.')
) as v(manufacturer, device_type, model, protocols, data_points, commands, notes)
join fp_iot_manufacturers m on m.org_id is null and m.name = v.manufacturer
left join fp_iot_device_types t on t.org_id is null and t.code = v.device_type
on conflict do nothing;

-- ===========================================================================
-- Gateways
-- ===========================================================================
create table if not exists fp_iot_gateways (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references fp_organizations(id) on delete cascade,
  site_id          uuid references fp_sites(id) on delete set null,
  location_id      uuid references fp_locations(id) on delete set null,
  name             text not null,
  gateway_key      text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  protocols        text[] not null default '{}',
  serial           text,
  firmware_version text,
  info             jsonb,
  last_seen_at     timestamptz,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists fp_iot_gateways_org_idx on fp_iot_gateways (org_id);
drop trigger if exists trg_fp_iot_gateways_touch on fp_iot_gateways;
create trigger trg_fp_iot_gateways_touch before update on fp_iot_gateways
  for each row execute function fp_touch_updated_at();
drop trigger if exists trg_audit_iot_gateways on fp_iot_gateways;
create trigger trg_audit_iot_gateways after insert or update or delete
  on fp_iot_gateways for each row execute function fp_audit();

alter table fp_iot_gateways enable row level security;
-- Rows carry the gateway key: same visibility as device keys.
drop policy if exists gateways_select on fp_iot_gateways;
create policy gateways_select on fp_iot_gateways for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
drop policy if exists gateways_write on fp_iot_gateways;
create policy gateways_write on fp_iot_gateways for all to authenticated
  using ( fp_has_role(org_id, array['org_admin']) )
  with check ( fp_has_role(org_id, array['org_admin']) );

-- ===========================================================================
-- Devices: location, type, model, protocol, gateway, health
-- ===========================================================================
alter table fp_devices
  add column if not exists location_id       uuid references fp_locations(id) on delete set null,
  add column if not exists site_id           uuid references fp_sites(id) on delete set null,
  add column if not exists device_type_id    uuid references fp_iot_device_types(id) on delete set null,
  add column if not exists model_id          uuid references fp_iot_device_models(id) on delete set null,
  add column if not exists protocol          text,
  add column if not exists external_id       text,
  add column if not exists gateway_id        uuid references fp_iot_gateways(id) on delete set null,
  add column if not exists connection_config jsonb not null default '{}'::jsonb,
  add column if not exists firmware_version  text;
-- Battery and signal are ordinary metrics (battery, rssi, snr) and are read
-- from fp_device_latest, so a reading never rewrites (or audits) the device.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fp_devices_protocol_check') then
    alter table fp_devices add constraint fp_devices_protocol_check check (protocol is null or protocol in (
      'mqtt','http','webhook','modbus_tcp','modbus_rtu','lorawan','bacnet_ip','bacnet_mstp',
      'opcua','websocket','knx','zigbee','vendor_api'));
  end if;
end $$;
-- Case-insensitive: a DevEUI arrives as 70B3D5… from one network server and 70b3d5… from another.
create unique index if not exists fp_devices_external_uk on fp_devices (org_id, lower(external_id)) where external_id is not null;
create index if not exists fp_devices_gateway_idx on fp_devices (gateway_id) where gateway_id is not null;
create index if not exists fp_devices_site_idx on fp_devices (org_id, site_id);
create index if not exists fp_devices_location_idx on fp_devices (org_id, location_id);

-- Everything a device points at belongs to its org; site follows location.
create or replace function fp_iot_device_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.location_id is not null
     and not exists (select 1 from fp_locations where id = new.location_id and org_id = new.org_id) then
    raise exception 'location belongs to another organisation' using errcode = '23503';
  end if;
  if new.gateway_id is not null
     and not exists (select 1 from fp_iot_gateways where id = new.gateway_id and org_id = new.org_id) then
    raise exception 'gateway belongs to another organisation' using errcode = '23503';
  end if;
  if new.model_id is not null
     and not exists (select 1 from fp_iot_device_models where id = new.model_id and (org_id is null or org_id = new.org_id)) then
    raise exception 'device model belongs to another organisation' using errcode = '23503';
  end if;
  if new.device_type_id is not null
     and not exists (select 1 from fp_iot_device_types where id = new.device_type_id and (org_id is null or org_id = new.org_id)) then
    raise exception 'device type belongs to another organisation' using errcode = '23503';
  end if;
  if new.location_id is not null then
    new.site_id := coalesce(fp_location_site(new.location_id), new.site_id);
  end if;
  if new.site_id is not null
     and not exists (select 1 from fp_sites where id = new.site_id and org_id = new.org_id) then
    raise exception 'site belongs to another organisation' using errcode = '23503';
  end if;
  if jsonb_typeof(coalesce(new.connection_config, '{}'::jsonb)) <> 'object'
     or length(new.connection_config::text) > 4096 then
    raise exception 'connection_config must be an object (max 4 KB)' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fp_iot_device_guard on fp_devices;
create trigger trg_fp_iot_device_guard
  before insert or update of org_id, location_id, site_id, gateway_id, model_id, device_type_id, connection_config on fp_devices
  for each row execute function fp_iot_device_guard();

-- Same checks for gateways.
create or replace function fp_iot_gateway_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.location_id is not null then
    if not exists (select 1 from fp_locations where id = new.location_id and org_id = new.org_id) then
      raise exception 'location belongs to another organisation' using errcode = '23503';
    end if;
    new.site_id := coalesce(fp_location_site(new.location_id), new.site_id);
  end if;
  if new.site_id is not null
     and not exists (select 1 from fp_sites where id = new.site_id and org_id = new.org_id) then
    raise exception 'site belongs to another organisation' using errcode = '23503';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fp_iot_gateway_guard on fp_iot_gateways;
create trigger trg_fp_iot_gateway_guard before insert or update of org_id, location_id, site_id on fp_iot_gateways
  for each row execute function fp_iot_gateway_guard();

-- Cloud MQTT bridge (0043): where to publish commands for a device it
-- subscribes to. Default: the subscription topic with /telemetry → /command.
alter table fp_device_connections add column if not exists command_topic text
  check (command_topic is null or (length(command_topic) <= 256 and command_topic !~ '[+#]'));

-- Site of a device, for policies on per-device tables (bypasses the
-- admin-only device policy on purpose; returns only the site id).
create or replace function fp_device_site(p_device uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select site_id from fp_devices where id = p_device $$;

-- Secrets per device (LoRaWAN AppKey, vendor API tokens…): write-only for
-- admins; read by server-side connectors with the service role.
create table if not exists fp_device_credentials (
  device_id  uuid primary key references fp_devices(id) on delete cascade,
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  secrets    jsonb not null default '{}'::jsonb check (jsonb_typeof(secrets) = 'object'),
  updated_at timestamptz not null default now()
);
alter table fp_device_credentials enable row level security;
drop policy if exists devcred_insert on fp_device_credentials;
create policy devcred_insert on fp_device_credentials for insert to authenticated
  with check ( fp_has_role(org_id, array['org_admin'])
               and exists (select 1 from fp_devices d where d.id = device_id and d.org_id = fp_device_credentials.org_id) );
drop policy if exists devcred_delete on fp_device_credentials;
create policy devcred_delete on fp_device_credentials for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin']) );
-- No select/update policy: nobody reads secrets back through the API.
-- Replace with fp_device_set_credentials().
revoke select, update on fp_device_credentials from anon, authenticated;

create or replace function fp_device_set_credentials(p_device uuid, p_secrets jsonb)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from fp_devices where id = p_device;
  if v_org is null or not fp_has_role(v_org, array['org_admin']) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_secrets is null or jsonb_typeof(p_secrets) <> 'object' or length(p_secrets::text) > 4096 then
    raise exception 'secrets must be an object (max 4 KB)' using errcode = '22023';
  end if;
  insert into fp_device_credentials (device_id, org_id, secrets) values (p_device, v_org, p_secrets)
  on conflict (device_id) do update set secrets = excluded.secrets, updated_at = now();
  return array(select jsonb_object_keys(p_secrets));
end;
$$;

-- Names of the stored secrets (never their values).
create or replace function fp_device_credential_keys(p_device uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array(select jsonb_object_keys(c.secrets)), '{}')
  from fp_device_credentials c join fp_devices d on d.id = c.device_id
  where c.device_id = p_device and fp_has_role(d.org_id, array['org_admin']);
$$;

-- ===========================================================================
-- Data points & latest values
-- ===========================================================================
create table if not exists fp_device_data_points (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references fp_organizations(id) on delete cascade,
  device_id   uuid not null references fp_devices(id) on delete cascade,
  key         text not null check (length(key) between 1 and 64),  -- what the device sends
  metric      text not null check (length(metric) between 1 and 64), -- canonical metric
  name        text,
  unit        text check (length(unit) <= 16),                     -- source unit when the device omits it
  scale       numeric not null default 1,
  "offset"    numeric not null default 0,
  source      jsonb not null default '{}'::jsonb check (jsonb_typeof(source) = 'object'),
  writable    boolean not null default false,
  dangerous   boolean not null default false,
  min_value   numeric,
  max_value   numeric,
  discovered  boolean not null default false,                      -- seen in data, not yet mapped
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (device_id, key)
);
create index if not exists fp_device_data_points_org_idx on fp_device_data_points (org_id);
drop trigger if exists trg_fp_device_data_points_touch on fp_device_data_points;
create trigger trg_fp_device_data_points_touch before update on fp_device_data_points
  for each row execute function fp_touch_updated_at();
drop trigger if exists trg_audit_device_data_points on fp_device_data_points;
create trigger trg_audit_device_data_points after insert or update or delete
  on fp_device_data_points for each row execute function fp_audit();

create or replace function fp_device_child_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from fp_devices where id = new.device_id and org_id = new.org_id) then
    raise exception 'device belongs to another organisation' using errcode = '23503';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fp_device_data_points_guard on fp_device_data_points;
create trigger trg_fp_device_data_points_guard before insert or update of org_id, device_id on fp_device_data_points
  for each row execute function fp_device_child_guard();

alter table fp_device_data_points enable row level security;
drop policy if exists dp_select on fp_device_data_points;
create policy dp_select on fp_device_data_points for select to authenticated
  using ( fp_is_member(org_id) and fp_has_site_access(org_id, fp_device_site(device_id)) );
drop policy if exists dp_write on fp_device_data_points;
create policy dp_write on fp_device_data_points for all to authenticated
  using ( fp_has_role(org_id, array['org_admin']) )
  with check ( fp_has_role(org_id, array['org_admin']) );

-- Copies a model's data-point template onto a device (existing keys kept).
create or replace function fp_device_apply_model(p_device uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  v_points jsonb;
  n int;
begin
  select id, org_id, model_id into d from fp_devices where id = p_device;
  if d.id is null or not fp_has_role(d.org_id, array['org_admin']) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select data_points into v_points from fp_iot_device_models where id = d.model_id;
  if v_points is null then
    return 0;
  end if;
  insert into fp_device_data_points (org_id, device_id, key, metric, name, unit, scale, "offset", source,
                                     writable, dangerous, min_value, max_value)
  select d.org_id, d.id, p ->> 'key', coalesce(p ->> 'metric', p ->> 'key'), p ->> 'name', p ->> 'unit',
         coalesce((p ->> 'scale')::numeric, 1), coalesce((p ->> 'offset')::numeric, 0),
         coalesce(p -> 'source', '{}'::jsonb), coalesce((p ->> 'writable')::boolean, false),
         coalesce((p ->> 'dangerous')::boolean, false), (p ->> 'min')::numeric, (p ->> 'max')::numeric
  from jsonb_array_elements(v_points) p
  where nullif(p ->> 'key', '') is not null
  on conflict (device_id, key) do update set
    -- A key first seen in data takes the model's mapping.
    metric = excluded.metric, name = excluded.name, unit = excluded.unit, scale = excluded.scale,
    "offset" = excluded."offset", source = excluded.source, writable = excluded.writable,
    dangerous = excluded.dangerous, min_value = excluded.min_value, max_value = excluded.max_value,
    discovered = false
    where fp_device_data_points.discovered;
  get diagnostics n = row_count;
  return n;
end;
$$;

create table if not exists fp_device_latest (
  device_id uuid not null references fp_devices(id) on delete cascade,
  metric    text not null,
  org_id    uuid not null references fp_organizations(id) on delete cascade,
  value     numeric,
  unit      text,
  ts        timestamptz not null,
  quality   text not null default 'good' check (quality in ('good','uncertain','bad')),
  primary key (device_id, metric)
);
create index if not exists fp_device_latest_org_idx on fp_device_latest (org_id);
alter table fp_device_latest enable row level security;
drop policy if exists latest_select on fp_device_latest;
create policy latest_select on fp_device_latest for select to authenticated
  using ( fp_is_member(org_id) and fp_has_site_access(org_id, fp_device_site(device_id)) );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fp_device_latest') then
      alter publication supabase_realtime add table fp_device_latest;
    end if;
  else
    raise warning '0077: publication supabase_realtime not found; live device data will refresh by polling only.';
  end if;
end $$;

-- ===========================================================================
-- Alerts & rules
-- ===========================================================================
create table if not exists fp_device_alerts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references fp_organizations(id) on delete cascade,
  device_id       uuid not null references fp_devices(id) on delete cascade,
  rule_id         uuid references fp_device_rules(id) on delete set null,
  severity        text not null check (severity in ('info','warning','critical','emergency')),
  status          text not null default 'open' check (status in ('open','acknowledged','resolved')),
  title           text not null,
  message         text,
  metric          text,
  value           numeric,
  occurrences     int not null default 1,
  opened_at       timestamptz not null default now(),
  last_at         timestamptz not null default now(),
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by     uuid references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  resolution      text,
  escalated_at    timestamptz,
  request_id      uuid references fp_requests(id) on delete set null
);
create index if not exists fp_device_alerts_device_idx on fp_device_alerts (device_id, opened_at desc);
create index if not exists fp_device_alerts_open_idx on fp_device_alerts (org_id, status) where status <> 'resolved';
-- At most one unresolved alert per rule.
create unique index if not exists fp_device_alerts_rule_open_uk on fp_device_alerts (rule_id) where status <> 'resolved' and rule_id is not null;
drop trigger if exists trg_audit_device_alerts on fp_device_alerts;
create trigger trg_audit_device_alerts after update or delete
  on fp_device_alerts for each row execute function fp_audit();

alter table fp_device_alerts enable row level security;
drop policy if exists alerts_select on fp_device_alerts;
create policy alerts_select on fp_device_alerts for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager','technician'])
          and fp_has_site_access(org_id, fp_device_site(device_id)) );
-- No client writes: alerts are raised by ingest and changed via fp_device_alert_update().

alter table fp_device_rules
  add column if not exists alert_severity         text not null default 'warning',
  add column if not exists conditions             jsonb not null default '[]'::jsonb,
  add column if not exists notify_roles           text[] not null default '{org_admin,manager}',
  add column if not exists active_hours           jsonb,
  add column if not exists suppress_until         timestamptz,
  add column if not exists escalate_after_minutes int,
  add column if not exists auto_resolve           boolean not null default true,
  add column if not exists name                   text;
do $$
begin
  alter table fp_device_rules drop constraint if exists fp_device_rules_op_check;
  alter table fp_device_rules add constraint fp_device_rules_op_check
    check (op in ('gt','gte','lt','lte','eq','neq','pct_above_baseline','pct_below_baseline'));
  alter table fp_device_rules drop constraint if exists fp_device_rules_action_check;
  alter table fp_device_rules add constraint fp_device_rules_action_check
    check (action in ('alert','notify','work_order','both'));
  if not exists (select 1 from pg_constraint where conname = 'fp_device_rules_alert_severity_check') then
    alter table fp_device_rules add constraint fp_device_rules_alert_severity_check
      check (alert_severity in ('info','warning','critical','emergency'));
    alter table fp_device_rules add constraint fp_device_rules_conditions_check
      check (jsonb_typeof(conditions) = 'array' and jsonb_array_length(conditions) <= 5);
    alter table fp_device_rules add constraint fp_device_rules_notify_roles_check
      check (notify_roles <@ array['org_admin','manager','technician']::text[]);
    alter table fp_device_rules add constraint fp_device_rules_escalate_check
      check (escalate_after_minutes is null or escalate_after_minutes between 5 and 10080);
  end if;
end $$;

-- Extra conditions may only reference devices of the rule's org.
create or replace function fp_device_rules_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
begin
  if not exists (select 1 from fp_devices where id = new.device_id and org_id = new.org_id) then
    raise exception 'device belongs to another organisation' using errcode = '23503';
  end if;
  for c in select * from jsonb_array_elements(new.conditions) loop
    if nullif(c ->> 'metric', '') is null or (c ->> 'op') not in ('gt','gte','lt','lte','eq','neq')
       or (c ->> 'threshold') is null then
      raise exception 'each condition needs metric, op and threshold' using errcode = '22023';
    end if;
    if nullif(c ->> 'device_id', '') is not null
       and not exists (select 1 from fp_devices where id = (c ->> 'device_id')::uuid and org_id = new.org_id) then
      raise exception 'condition references a device outside this organisation' using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_fp_device_rules_guard on fp_device_rules;
create trigger trg_fp_device_rules_guard before insert or update on fp_device_rules
  for each row execute function fp_device_rules_guard();

create or replace function fp_iot_compare(p_value numeric, p_op text, p_threshold numeric)
returns boolean
language sql
immutable
as $$
  select case p_op
    when 'gt'  then p_value >  p_threshold
    when 'gte' then p_value >= p_threshold
    when 'lt'  then p_value <  p_threshold
    when 'lte' then p_value <= p_threshold
    when 'eq'  then p_value =  p_threshold
    when 'neq' then p_value <> p_threshold
    else false end;
$$;

-- Is now inside the rule's working hours? {"days":[1..7 ISO], "from":"08:00", "to":"18:00"}
create or replace function fp_iot_in_hours(p_org uuid, p_hours jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_local timestamp;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then
    return true;
  end if;
  v_local := now() at time zone fp_org_timezone(p_org);
  if p_hours ? 'days' and not (extract(isodow from v_local)::int in
        (select (x)::int from jsonb_array_elements_text(p_hours -> 'days') x)) then
    return false;
  end if;
  if p_hours ? 'from' and p_hours ? 'to' then
    return v_local::time >= (p_hours ->> 'from')::time and v_local::time < (p_hours ->> 'to')::time;
  end if;
  return true;
end;
$$;

-- ===========================================================================
-- Ingest: one internal path for device keys, gateways and connectors
-- ===========================================================================
create or replace function fp_device_ingest_internal(
  p_device uuid,
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
  dp record;
  tele_id uuid;
  target_meter uuid;
  r record;
  c jsonb;
  crossed boolean;
  u record;
  msg text;
  sym text;
  v_ts timestamptz;
  v_fired int;
  v_metric text;
  v_value numeric;
  v_unit text;
  v_canonical text;
  v_conv numeric;
  v_meta jsonb;
  v_base numeric;
  v_cond numeric;
  v_alert_id uuid;
  v_new_alert boolean;
  v_req uuid;
begin
  select id, org_id, site_id, asset_id, name, meter_id, metric_map, active, last_seen_at, offline_alerted_at
    into dev
    from fp_devices
    where id = p_device;

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

  if (select count(*) from fp_telemetry
      where device_id = dev.id and created_at > now() - interval '1 minute') >= 600 then
    raise exception 'rate_limited' using errcode = 'P0001',
      detail = 'Device is sending more than 600 readings a minute.';
  end if;

  -- ---- Normalisation (0077) ------------------------------------------------
  select * into dp from fp_device_data_points where device_id = dev.id and key = p_metric;
  if not found then
    -- Record the key so an admin can map it (bounded per device).
    if (select count(*) from fp_device_data_points where device_id = dev.id) < 200 then
      insert into fp_device_data_points (org_id, device_id, key, metric, unit, discovered)
      values (dev.org_id, dev.id, p_metric, p_metric, nullif(p_unit, ''), true)
      on conflict (device_id, key) do nothing;
    end if;
    v_metric := p_metric;
    v_value  := p_value;
    v_unit   := nullif(p_unit, '');
  else
    if not dp.active then
      return null;  -- muted data point
    end if;
    v_metric := dp.metric;
    v_value  := case when p_value is null then null else p_value * dp.scale + dp."offset" end;
    v_unit   := coalesce(nullif(p_unit, ''), dp.unit);
  end if;

  select canonical_unit into v_canonical from fp_iot_quantities where code = v_metric;
  if v_canonical is not null then
    if v_unit is null then
      v_unit := v_canonical;
    elsif v_unit <> v_canonical then
      v_conv := fp_iot_convert(v_value, v_unit, v_canonical);
      if v_conv is not null or v_value is null then
        v_value := v_conv;
        v_unit := v_canonical;
      end if;
    end if;
  end if;

  v_meta := p_meta;
  if v_metric is distinct from p_metric or v_value is distinct from p_value or v_unit is distinct from nullif(p_unit, '') then
    v_meta := coalesce(p_meta, '{}'::jsonb)
      || jsonb_build_object('raw', jsonb_build_object('metric', p_metric, 'value', p_value, 'unit', p_unit));
  end if;

  -- The same reading delivered twice (MQTT QoS 1 redelivery, retries, or
  -- two deliveries racing) is stored, and acted on, once (0067).
  insert into fp_telemetry (org_id, device_id, metric, value, unit, ts, meta)
  values (dev.org_id, dev.id, v_metric, v_value, v_unit, v_ts, v_meta)
  on conflict (device_id, metric, ts) do nothing
  returning id into tele_id;
  if tele_id is null then
    select id into tele_id from fp_telemetry
      where device_id = dev.id and metric = v_metric and ts = v_ts;
    return tele_id;
  end if;

  insert into fp_device_latest as l (device_id, metric, org_id, value, unit, ts)
  values (dev.id, v_metric, dev.org_id, v_value, v_unit, v_ts)
  on conflict (device_id, metric) do update
    set value = excluded.value, unit = excluded.unit, ts = excluded.ts, quality = 'good'
    where l.ts <= excluded.ts;

  -- Firmware reported in meta (rare changes only; audited).
  if p_meta ? 'firmware' then
    update fp_devices set firmware_version = left(p_meta ->> 'firmware', 64)
      where id = dev.id and firmware_version is distinct from left(p_meta ->> 'firmware', 64);
  end if;

  if dev.last_seen_at is null or dev.last_seen_at < now() - interval '1 minute' then
    update fp_devices set last_seen_at = now() where id = dev.id;
  end if;
  -- Back online after an offline alert (0067).
  if dev.offline_alerted_at is not null then
    update fp_devices set offline_alerted_at = null where id = dev.id;
  end if;

  -- Fire sensor_integration workflows (condition fields: sensor_score / metric).
  if v_value is not null then
    perform fp_run_workflows(dev.org_id, 'sensor_integration', dev.id::text,
      jsonb_build_object('sensor_score', v_value, 'metric', v_metric, 'device', dev.id));
  end if;

  -- Mirror into a meter when this metric (or the device default) maps to one.
  if v_value is not null then
    target_meter := nullif(coalesce(dev.metric_map ->> v_metric, dev.metric_map ->> p_metric), '')::uuid;
    if target_meter is null then
      target_meter := dev.meter_id;
    end if;
    if target_meter is not null then
      insert into fp_meter_readings (org_id, meter_id, value, read_at)
      values (dev.org_id, target_meter, v_value, v_ts);
    end if;
  end if;

  -- ---- Rules → alerts, notifications, work orders --------------------------
  if v_value is null then
    return tele_id;
  end if;

  for r in
    select * from fp_device_rules
    where device_id = dev.id and active
      and (metric is null or metric = v_metric or metric = p_metric)
  loop
    if r.op in ('pct_above_baseline', 'pct_below_baseline') then
      -- Baseline: this metric's average over the previous 7 days.
      select avg(value) into v_base from fp_telemetry
        where device_id = dev.id and metric = v_metric
          and ts >= v_ts - interval '7 days' and ts < v_ts - interval '1 hour';
      crossed := v_base is not null and v_base <> 0 and case r.op
        when 'pct_above_baseline' then (v_value - v_base) / abs(v_base) * 100 > r.threshold
        else (v_base - v_value) / abs(v_base) * 100 > r.threshold end;
    else
      crossed := fp_iot_compare(v_value, r.op, r.threshold);
    end if;

    -- AND-conditions against the latest values (this or another device).
    if crossed then
      for c in select * from jsonb_array_elements(r.conditions) loop
        select value into v_cond from fp_device_latest
          where device_id = coalesce(nullif(c ->> 'device_id', '')::uuid, dev.id)
            and org_id = dev.org_id and metric = c ->> 'metric';
        if v_cond is null or not fp_iot_compare(v_cond, c ->> 'op', (c ->> 'threshold')::numeric) then
          crossed := false;
          exit;
        end if;
      end loop;
    end if;

    if not crossed then
      -- Condition cleared: close the rule's alert.
      if r.auto_resolve and r.metric is not null then
        update fp_device_alerts
          set status = 'resolved', resolved_at = now(), resolution = 'auto'
          where rule_id = r.id and status <> 'resolved';
      end if;
      continue;
    end if;

    sym := case r.op when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<'
                     when 'lte' then '<=' when 'neq' then '≠' when 'eq' then '='
                     when 'pct_above_baseline' then '% above baseline >' else '% below baseline >' end;
    msg := coalesce(nullif(r.message, ''), v_metric || ' ' || sym || ' ' || r.threshold);

    -- One unresolved alert per rule; repeats bump it.
    v_new_alert := false;
    update fp_device_alerts
      set occurrences = occurrences + 1, last_at = now(), value = v_value
      where rule_id = r.id and status <> 'resolved'
      returning id into v_alert_id;
    if v_alert_id is null then
      insert into fp_device_alerts (org_id, device_id, rule_id, severity, title, message, metric, value)
      values (dev.org_id, dev.id, r.id, r.alert_severity, dev.name || ': ' || msg,
              v_metric || ' = ' || v_value || coalesce(' ' || v_unit, ''), v_metric, v_value)
      on conflict do nothing
      returning id into v_alert_id;
      v_new_alert := v_alert_id is not null;
    end if;

    -- Claim the firing atomically: of several concurrent readings, exactly
    -- one gets past the cooldown.
    update fp_device_rules set last_fired_at = now()
      where id = r.id
        and (last_fired_at is null
             or now() - last_fired_at > make_interval(mins => cooldown_minutes));
    get diagnostics v_fired = row_count;
    continue when v_fired = 0;

    -- A work order only for a new alert, not for every repeat.
    if v_new_alert and r.action in ('work_order','both') then
      insert into fp_requests
        (org_id, title, body_original, source_lng, asset_id, severity, priority, channel, created_by)
      values
        (dev.org_id, dev.name || ': ' || msg,
         'Automatic alert from device ' || dev.name || ' — ' || v_metric || ' = ' || v_value
           || coalesce(' ' || v_unit, ''),
         'en', dev.asset_id, r.severity, r.severity, 'web', null)
      returning id into v_req;
      update fp_device_alerts set request_id = v_req where id = v_alert_id;
    end if;

    if r.action in ('notify','both')
       and (r.suppress_until is null or r.suppress_until < now())
       and fp_iot_in_hours(dev.org_id, r.active_hours) then
      for u in
        select user_id from fp_users_orgs
        where org_id = dev.org_id and role = any (r.notify_roles)
      loop
        insert into fp_notifications (org_id, user_id, kind, title, body, link)
        values (dev.org_id, u.user_id, 'device_alert',
                case when r.alert_severity in ('critical','emergency') then upper(r.alert_severity) || ': ' else '' end || dev.name,
                msg, '/devices/' || dev.id);
      end loop;
    end if;
  end loop;

  return tele_id;
end;
$$;

-- Device-key entry point (unchanged signature; devices keep working).
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
  v_dev uuid;
begin
  select id into v_dev from fp_devices where device_key = p_key and active;
  if v_dev is null then
    raise exception 'Invalid or inactive device key';
  end if;
  return fp_device_ingest_internal(v_dev, p_metric, p_value, p_unit, p_ts, p_meta);
end;
$$;

-- Gateway entry point: many devices, identified by external_id within the
-- gateway's organisation. p_readings: [{device, metric, value, unit, ts, meta}]
create or replace function fp_gateway_ingest(p_key text, p_readings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gw record;
  x jsonb;
  v_dev uuid;
  n_ok int := 0;
  errs jsonb := '[]'::jsonb;
begin
  select id, org_id into gw from fp_iot_gateways where gateway_key = p_key and active;
  if gw.id is null then
    raise exception 'Invalid or inactive gateway key';
  end if;
  if p_readings is null or jsonb_typeof(p_readings) <> 'array' or jsonb_array_length(p_readings) > 500 then
    raise exception 'readings must be an array of at most 500' using errcode = 'P0001';
  end if;
  update fp_iot_gateways set last_seen_at = now()
    where id = gw.id and (last_seen_at is null or last_seen_at < now() - interval '1 minute');

  for x in select * from jsonb_array_elements(p_readings) loop
    select id into v_dev from fp_devices
      where org_id = gw.org_id and active
        and (lower(external_id) = lower(x ->> 'device') or (x ->> 'device') = id::text);
    if v_dev is null then
      errs := errs || jsonb_build_object('device', x ->> 'device', 'error', 'unknown_device');
      continue;
    end if;
    begin
      perform fp_device_ingest_internal(v_dev, x ->> 'metric',
        case when jsonb_typeof(x -> 'value') = 'boolean' then (case when (x ->> 'value')::boolean then 1 else 0 end)
             else nullif(x ->> 'value', '')::numeric end,
        x ->> 'unit', coalesce(nullif(x ->> 'ts', '')::timestamptz, now()),
        case when jsonb_typeof(x -> 'meta') = 'object' then x -> 'meta' end);
      n_ok := n_ok + 1;
      -- Readings routed through a gateway attach the device to it.
      update fp_devices set gateway_id = gw.id where id = v_dev and gateway_id is null;
    exception when others then
      errs := errs || jsonb_build_object('device', x ->> 'device', 'error', sqlerrm);
      exit when sqlerrm = 'rate_limited';
    end;
  end loop;
  return jsonb_build_object('ingested', n_ok, 'errors', errs);
end;
$$;

-- Gateway start-up / periodic sync: records a heartbeat and returns the
-- devices it serves with their protocol addresses (no secrets).
create or replace function fp_gateway_config(p_key text, p_info jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gw record;
begin
  select id, org_id, site_id, name into gw from fp_iot_gateways where gateway_key = p_key and active;
  if gw.id is null then
    raise exception 'Invalid or inactive gateway key';
  end if;
  update fp_iot_gateways set last_seen_at = now(),
    firmware_version = coalesce(left(p_info ->> 'firmware', 64), firmware_version),
    info = case when jsonb_typeof(p_info) = 'object' and length(p_info::text) <= 4096 then p_info else info end
    where id = gw.id;
  return jsonb_build_object(
    'gateway', jsonb_build_object('id', gw.id, 'org_id', gw.org_id, 'site_id', gw.site_id, 'name', gw.name),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'org_id', d.org_id, 'site_id', d.site_id,
        'external_id', d.external_id, 'name', d.name, 'protocol', d.protocol,
        'connection', d.connection_config,
        'data_points', coalesce((
          select jsonb_agg(jsonb_build_object('key', p.key, 'metric', p.metric, 'unit', p.unit,
                                              'source', p.source, 'writable', p.writable))
          from fp_device_data_points p
          where p.device_id = d.id and p.active and p.source <> '{}'::jsonb), '[]'::jsonb)))
      from fp_devices d where d.gateway_id = gw.id and d.active), '[]'::jsonb));
end;
$$;

-- ===========================================================================
-- Commands
-- ===========================================================================
create table if not exists fp_device_commands (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references fp_organizations(id) on delete cascade,
  device_id    uuid not null references fp_devices(id) on delete cascade,
  gateway_id   uuid references fp_iot_gateways(id) on delete set null,
  command      text not null,
  params       jsonb not null default '{}'::jsonb,
  payload      jsonb not null default '{}'::jsonb,   -- what the gateway executes
  dangerous    boolean not null default false,
  status       text not null default 'pending'
                 check (status in ('pending','sent','succeeded','failed','expired','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  sent_at      timestamptz,
  completed_at timestamptz,
  result       jsonb,
  error        text
);
create index if not exists fp_device_commands_device_idx on fp_device_commands (device_id, requested_at desc);
create index if not exists fp_device_commands_pending_idx on fp_device_commands (gateway_id, status) where status = 'pending';
drop trigger if exists trg_audit_device_commands on fp_device_commands;
create trigger trg_audit_device_commands after insert or update or delete
  on fp_device_commands for each row execute function fp_audit();

alter table fp_device_commands enable row level security;
drop policy if exists commands_select on fp_device_commands;
create policy commands_select on fp_device_commands for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager','technician'])
          and fp_has_site_access(org_id, fp_device_site(device_id)) );
-- No client writes: fp_device_command() / fp_device_command_cancel().

create or replace function fp_device_command(
  p_device      uuid,
  p_command     text,
  p_params      jsonb default '{}'::jsonb,
  p_ttl_seconds int default 120
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  v_def jsonb;
  dp record;
  v_value numeric;
  v_dangerous boolean := false;
  v_payload jsonb;
  v_id uuid;
  v_dp_key text;
begin
  select id, org_id, site_id, gateway_id, model_id, active, last_seen_at, offline_after_minutes
    into d from fp_devices where id = p_device;
  if d.id is null or not fp_has_role(d.org_id, array['org_admin','manager','technician'])
     or not fp_has_site_access(d.org_id, d.site_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not d.active then
    raise exception 'device_inactive' using errcode = 'P0001';
  end if;
  p_params := coalesce(p_params, '{}'::jsonb);
  if jsonb_typeof(p_params) <> 'object' or length(p_params::text) > 2048 then
    raise exception 'invalid_params' using errcode = '22023';
  end if;

  if p_command = 'request_status' then
    v_payload := jsonb_build_object('type', 'request_status');
  else
    -- A model command (turn_on, set_setpoint…) or a raw write to a data point.
    if p_command <> 'write' then
      select c into v_def
        from fp_iot_device_models m, jsonb_array_elements(m.commands) c
        where m.id = d.model_id and c ->> 'code' = p_command;
      if v_def is null then
        raise exception 'unsupported_command' using errcode = 'P0001';
      end if;
      v_dp_key := v_def ->> 'data_point';
      v_value := coalesce((v_def ->> 'value')::numeric, (p_params ->> 'value')::numeric);
      v_dangerous := coalesce((v_def ->> 'dangerous')::boolean, false);
    else
      v_dp_key := p_params ->> 'data_point';
      v_value := case when jsonb_typeof(p_params -> 'value') = 'boolean'
                      then (case when (p_params ->> 'value')::boolean then 1 else 0 end)
                      else (p_params ->> 'value')::numeric end;
    end if;

    select * into dp from fp_device_data_points where device_id = d.id and key = v_dp_key and active;
    if dp.id is null or not dp.writable then
      raise exception 'not_writable' using errcode = 'P0001';
    end if;
    if v_value is null
       or (dp.min_value is not null and v_value < dp.min_value)
       or (dp.max_value is not null and v_value > dp.max_value) then
      raise exception 'value_out_of_range' using errcode = 'P0001',
        detail = format('allowed range %s – %s', coalesce(dp.min_value::text, '…'), coalesce(dp.max_value::text, '…'));
    end if;
    v_dangerous := v_dangerous or dp.dangerous;
    v_payload := jsonb_build_object('type', 'write', 'data_point', dp.key, 'metric', dp.metric,
      -- the device expects its own scale: invert the data point's normalisation
      'value', case when dp.scale = 0 then v_value else (v_value - dp."offset") / dp.scale end,
      'source', dp.source);
  end if;

  -- Writes need a manager; dangerous controls need an admin.
  if v_payload ->> 'type' = 'write' then
    if not fp_has_role(d.org_id, case when v_dangerous then array['org_admin'] else array['org_admin','manager'] end) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    -- Never act on a device we can't currently hear from.
    if d.last_seen_at is null
       or d.last_seen_at < now() - make_interval(mins => coalesce(d.offline_after_minutes, 15)) then
      raise exception 'device_offline' using errcode = 'P0001';
    end if;
  end if;

  if (select count(*) from fp_device_commands
      where device_id = d.id and requested_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into fp_device_commands (org_id, device_id, gateway_id, command, params, payload, dangerous,
                                  requested_by, expires_at)
  values (d.org_id, d.id, d.gateway_id, p_command, p_params, v_payload, v_dangerous, auth.uid(),
          now() + make_interval(secs => least(greatest(coalesce(p_ttl_seconds, 120), 10), 3600)))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function fp_device_command_cancel(p_command uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update fp_device_commands c set status = 'cancelled', completed_at = now()
    where c.id = p_command and c.status = 'pending'
      and (c.requested_by = auth.uid() or fp_has_role(c.org_id, array['org_admin']));
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Hands pending, unexpired commands to a gateway (or, with a device key, to
-- a directly connected device). Expired ones are marked and never delivered.
create or replace function fp_iot_claim_commands(p_key text, p_limit int default 20)
returns setof fp_device_commands
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gw uuid;
  v_dev uuid;
begin
  select id into v_gw from fp_iot_gateways where gateway_key = p_key and active;
  if v_gw is null then
    select id into v_dev from fp_devices where device_key = p_key and active;
    if v_dev is null then
      raise exception 'Invalid or inactive key';
    end if;
  end if;

  update fp_device_commands set status = 'expired', completed_at = now()
    where status in ('pending','sent') and expires_at < now()
      and (gateway_id = v_gw or (v_dev is not null and device_id = v_dev));

  return query
    with claimed as (
      update fp_device_commands c set status = 'sent', sent_at = now()
      where c.id in (
        select x.id from fp_device_commands x
        where x.status = 'pending' and x.expires_at >= now()
          and ((v_gw is not null and x.gateway_id = v_gw)
               or (v_dev is not null and x.device_id = v_dev and x.gateway_id is null))
        order by x.requested_at
        limit least(greatest(coalesce(p_limit, 20), 1), 100)
        for update skip locked)
      returning c.*)
    select * from claimed;
end;
$$;

create or replace function fp_iot_command_result(p_key text, p_command uuid, p_ok boolean, p_result jsonb default null, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update fp_device_commands c
    set status = case when p_ok then 'succeeded' else 'failed' end,
        completed_at = now(),
        result = case when jsonb_typeof(p_result) = 'object' and length(p_result::text) <= 4096 then p_result end,
        error = left(p_error, 500)
    where c.id = p_command and c.status in ('pending','sent')
      and (exists (select 1 from fp_iot_gateways g where g.id = c.gateway_id and g.gateway_key = p_key and g.active)
           or exists (select 1 from fp_devices d where d.id = c.device_id and d.device_key = p_key and d.active));
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ===========================================================================
-- Alerts: acknowledge / resolve / escalate
-- ===========================================================================
create or replace function fp_device_alert_update(p_alert uuid, p_action text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  select id, org_id, device_id, status into a from fp_device_alerts where id = p_alert;
  if a.id is null or not fp_has_role(a.org_id, array['org_admin','manager','technician'])
     or not fp_has_site_access(a.org_id, fp_device_site(a.device_id)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_action = 'acknowledge' and a.status = 'open' then
    update fp_device_alerts set status = 'acknowledged', acknowledged_by = auth.uid(), acknowledged_at = now()
      where id = a.id;
  elsif p_action = 'resolve' and a.status <> 'resolved' then
    update fp_device_alerts set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
      resolution = coalesce(left(p_note, 500), 'manual')
      where id = a.id;
  else
    return false;
  end if;
  return true;
end;
$$;

create or replace function fp_escalate_device_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  n int := 0;
begin
  perform fp_assert_scheduler_or_manager(null);
  for a in
    select al.id, al.org_id, al.device_id, al.title, al.severity
    from fp_device_alerts al join fp_device_rules r on r.id = al.rule_id
    where al.status = 'open' and al.escalated_at is null and r.escalate_after_minutes is not null
      and al.opened_at < now() - make_interval(mins => r.escalate_after_minutes)
    for update of al skip locked
  loop
    insert into fp_notifications (org_id, user_id, kind, title, body, link)
    select a.org_id, uo.user_id, 'device_alert', 'Escalated: ' || a.title,
           'Not acknowledged in time (' || a.severity || ').', '/devices/' || a.device_id
    from fp_users_orgs uo where uo.org_id = a.org_id and uo.role = 'org_admin';
    update fp_device_alerts set escalated_at = now() where id = a.id;
    n := n + 1;
  end loop;
  -- Commands nobody claimed in time.
  update fp_device_commands set status = 'expired', completed_at = now()
    where status in ('pending','sent') and expires_at < now() - interval '1 minute';
  return n;
end;
$$;

insert into fp_jobs (job, description, max_silence, run_sql) values
  ('escalate_device_alerts', 'Escalate unacknowledged IoT alerts; expire stale commands', interval '1 hour', 'select fp_escalate_device_alerts()')
on conflict (job) do update set description = excluded.description, max_silence = excluded.max_silence, run_sql = excluded.run_sql;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fp-escalate-device-alerts', '*/5 * * * *', $job$select fp_run_job('escalate_device_alerts')$job$);
  else
    raise warning '0077: pg_cron is not enabled, so IoT alert escalation was NOT scheduled.';
  end if;
end $$;

-- ===========================================================================
-- History for charts: bucketed min/avg/max, raw readings plus hourly rollups
-- (older than the retention period), evaluated with the caller's RLS.
-- ===========================================================================
-- Org of a device (for invoker-rights helpers; returns only the id).
create or replace function fp_devices_org(p_device uuid)
returns table (org_id uuid)
language sql
stable
security definer
set search_path = public
as $$ select org_id from fp_devices where id = p_device $$;

create or replace function fp_device_history(
  p_device uuid,
  p_metric text,
  p_from   timestamptz,
  p_to     timestamptz default now(),
  p_points int default 200
)
returns table (bucket timestamptz, avg_value numeric, min_value numeric, max_value numeric, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select greatest(extract(epoch from (p_to - p_from)) / least(greatest(coalesce(p_points, 200), 10), 1000), 60)::numeric as secs
  ), src as (
    select t.ts, t.value as mn, t.value as mx, t.value as av, 1::bigint as cnt
      from fp_telemetry t
      where t.device_id = p_device and t.metric = p_metric and t.ts >= p_from and t.ts < p_to
    union all
    select h.hour, h.min_value, h.max_value, h.avg_value, h.n
      from fp_telemetry_hourly h
      where h.device_id = p_device and h.metric = p_metric and h.hour >= p_from and h.hour < p_to
  )
  select to_timestamp(floor(extract(epoch from src.ts) / b.secs) * b.secs) as bucket,
         round(sum(src.av * src.cnt) / nullif(sum(src.cnt), 0), 6),
         min(src.mn), max(src.mx), sum(src.cnt)::bigint
  from src, b
  where fp_has_site_access((select org_id from fp_devices_org(p_device)), fp_device_site(p_device))
  group by 1
  order by 1;
$$;

-- ===========================================================================
-- Device directory (no keys) for every member
-- ===========================================================================
create or replace view fp_device_directory as
select
  d.id, d.org_id, d.site_id, d.location_id, d.asset_id, d.gateway_id, d.device_type_id, d.model_id,
  d.name, d.kind, d.protocol, d.external_id, d.active, d.last_seen_at, d.offline_after_minutes,
  d.firmware_version, d.created_at,
  bat.value as battery_pct, sig.value as signal_rssi,
  t.code as device_type, t.category, m.model, mf.name as manufacturer,
  case
    when not d.active then 'inactive'
    when d.last_seen_at is null then 'never'
    when d.last_seen_at < now() - make_interval(mins => coalesce(d.offline_after_minutes, 15)) then 'offline'
    else 'online'
  end as status,
  (select al.severity from fp_device_alerts al
     where al.device_id = d.id and al.status <> 'resolved'
     order by array_position(array['emergency','critical','warning','info'], al.severity) limit 1) as alert_severity,
  (select count(*) from fp_device_alerts al where al.device_id = d.id and al.status <> 'resolved')::int as open_alerts,
  coalesce(bat.value < 20, false) as battery_low
from fp_devices d
left join fp_device_latest bat on bat.device_id = d.id and bat.metric = 'battery'
left join fp_device_latest sig on sig.device_id = d.id and sig.metric = 'rssi'
left join fp_iot_device_types t on t.id = d.device_type_id
left join fp_iot_device_models m on m.id = d.model_id
left join fp_iot_manufacturers mf on mf.id = m.manufacturer_id
where fp_is_member(d.org_id) and fp_has_site_access(d.org_id, d.site_id);

revoke all on fp_device_directory from anon;
grant select on fp_device_directory to authenticated;

-- ===========================================================================
-- Grants (0059 allow-list)
-- ===========================================================================
revoke execute on function fp_device_ingest_internal(uuid, text, numeric, text, timestamptz, jsonb),
  fp_escalate_device_alerts(), fp_iot_device_guard(), fp_iot_gateway_guard(), fp_device_child_guard(),
  fp_device_rules_guard(), fp_iot_in_hours(uuid, jsonb)
  from public, anon, authenticated;

-- Key-authenticated entry points (devices, gateways, connectors).
grant execute on function fp_device_ingest(text, text, numeric, text, timestamptz, jsonb) to anon, authenticated, service_role;
grant execute on function fp_gateway_ingest(text, jsonb)                          to anon, authenticated, service_role;
grant execute on function fp_gateway_config(text, jsonb)                          to anon, authenticated, service_role;
grant execute on function fp_iot_claim_commands(text, int)                        to anon, authenticated, service_role;
grant execute on function fp_iot_command_result(text, uuid, boolean, jsonb, text) to anon, authenticated, service_role;

-- App RPCs (each checks the caller's role itself) and policy helpers.
grant execute on function fp_device_command(uuid, text, jsonb, int)      to authenticated;
grant execute on function fp_device_command_cancel(uuid)                 to authenticated;
grant execute on function fp_device_alert_update(uuid, text, text)       to authenticated;
grant execute on function fp_device_apply_model(uuid)                    to authenticated;
grant execute on function fp_device_set_credentials(uuid, jsonb)         to authenticated;
grant execute on function fp_device_credential_keys(uuid)                to authenticated;
grant execute on function fp_device_site(uuid)                           to authenticated;
grant execute on function fp_devices_org(uuid)                           to authenticated;
grant execute on function fp_device_history(uuid, text, timestamptz, timestamptz, int) to authenticated;
grant execute on function fp_iot_convert(numeric, text, text)            to authenticated;
grant execute on function fp_iot_compare(numeric, text, numeric)         to authenticated;
