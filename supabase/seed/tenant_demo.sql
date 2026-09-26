-- ============================================================================
-- DEMO DATA — "Harbourview Properties (Demo)"
-- ============================================================================
-- One fully populated, fictional organisation for demos, training and the
-- user guide's screenshots: 3 sites → buildings → floors → rooms → assets →
-- preventive-maintenance plans → work orders → technicians → completion
-- records, plus requests, parts and stock movements, vendors, contracts,
-- purchases, invoices, budgets, documents, checklists, inspections, permits,
-- bookings, attendance, surveys, broadcasts, workflows, inbox conversations,
-- notifications and IoT devices with a week of readings and alerts.
--
-- Every person, company, address and number here is invented. People use
-- @harbourview-demo.test addresses (a reserved, non-routable domain).
-- The organisation is flagged settings.demo = true and the app shows a
-- "DEMO DATA" banner inside it.
--
-- FOR A LOCAL, STAGING OR DEDICATED DEMO DATABASE ONLY. Refuses to run unless
-- you opt in, in the same session:
--
--   set fp.allow_demo_seed = 'yes';
--   -- optional: make an existing account (already signed up) the demo org's admin
--   set fp.demo_owner_email = 'you@example.com';
--   \i supabase/seed/tenant_demo.sql
--
-- Dates are relative to when you run it, so the demo always looks current.
-- Demo staff accounts have no password (they can't sign in); use
-- fp.demo_owner_email to explore the demo as its administrator.
-- supabase/seed/tenant_demo_remove.sql removes everything it created.
-- ============================================================================

do $$
begin
  if coalesce(current_setting('fp.allow_demo_seed', true), '') <> 'yes' then
    raise exception 'Demo seed refused: run "set fp.allow_demo_seed = ''yes'';" first, and only on a local, staging or demo database.';
  end if;
  if exists (select 1 from fp_organizations where settings ->> 'demo_key' = 'harbourview') then
    raise exception 'The Harbourview demo is already loaded. Run supabase/seed/tenant_demo_remove.sql first.';
  end if;
end $$;

begin;

-- Demo rows are written as-is (statuses, dates, costs and stock already
-- consistent), without firing notification/workflow/lifecycle triggers.
set session_replication_role = replica;

create temp table demo_ids (k text primary key, id uuid not null) on commit preserve rows;
create or replace function pg_temp.k(p_key text) returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from demo_ids where k = p_key;
  if v is null then
    v := gen_random_uuid();
    insert into demo_ids values (p_key, v);
  end if;
  return v;
end $$;
create or replace function pg_temp.t(p_en text, p_vi text default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('en', p_en, 'vi', coalesce(p_vi, p_en));
$$;

-- ---------------------------------------------------------------------------
-- Organisation and plan
-- ---------------------------------------------------------------------------
insert into fp_organizations (id, name, default_lng, active_languages, industry, currency, contact_name, contact_email, contact_phone,
                              address, settings, allow_public_requests, auto_create_work_orders, subdomain, created_at, last_active_at)
values (pg_temp.k('org'), 'Harbourview Properties (Demo)', 'en', '["en","vi"]', 'property_management', 'VND',
        'Alex Morgan', 'alex.morgan@harbourview-demo.test', '+84 28 0000 0100',
        '88 Demo Harbour Road, District 1, Ho Chi Minh City (fictional)',
        jsonb_build_object('demo', true, 'demo_key', 'harbourview', 'timezone', 'Asia/Ho_Chi_Minh', 'currency', 'VND'),
        true, true, 'harbourview-demo', now() - interval '200 days', now());

insert into fp_subscriptions (org_id, plan_code, status, provider, billing_interval, current_period_start, current_period_end, note)
values (pg_temp.k('org'), 'business', 'active', 'manual', 'year', now() - interval '60 days', now() + interval '305 days', 'Demo organisation');

-- ---------------------------------------------------------------------------
-- People (fictional). Demo staff have no password.
-- ---------------------------------------------------------------------------
create temp table demo_people (key text, name text, email text, role text, team text, phone text, skills text[], rate numeric, shift text) on commit preserve rows;
insert into demo_people values
  ('alex',   'Alex Morgan',     'alex.morgan',     'org_admin',  'Management', '+84 90 000 0101', null, null, null),
  ('priya',  'Priya Raman',     'priya.raman',     'manager',    'Maintenance', '+84 90 000 0102', null, null, null),
  ('daniel', 'Daniel Okafor',   'daniel.okafor',   'manager',    'Facilities', '+84 90 000 0103', null, null, null),
  ('minh',   'Minh Tran',       'minh.tran',       'technician', 'HVAC',        '+84 90 000 0111', array['HVAC','Chillers','Refrigeration'], 180000, 'Day (07:00–16:00)'),
  ('sofia',  'Sofia Lopez',     'sofia.lopez',     'technician', 'Electrical',  '+84 90 000 0112', array['Electrical','UPS','Lighting'], 170000, 'Day (07:00–16:00)'),
  ('kenji',  'Kenji Watanabe',  'kenji.watanabe',  'technician', 'Plumbing',    '+84 90 000 0113', array['Plumbing','Pumps','Water treatment'], 160000, 'Day (08:00–17:00)'),
  ('grace',  'Grace Mensah',    'grace.mensah',    'technician', 'General',     '+84 90 000 0114', array['General maintenance','Carpentry','Painting'], 150000, 'Swing (12:00–21:00)'),
  ('tomas',  'Tomás Silva',     'tomas.silva',     'technician', 'Fire & Life Safety', '+84 90 000 0115', array['Fire systems','Generators'], 175000, 'Night (21:00–06:00)'),
  ('olivia', 'Olivia Chen',     'olivia.chen',     'occupant',   'Marine Co (Suite 1201)', null, null, null, null),
  ('ethan',  'Ethan Brooks',    'ethan.brooks',    'occupant',   'Resident, Apt 10-05', null, null, null, null),
  ('rahul',  'Rahul Mehta',     'rahul.mehta',     'vendor',     'CoolAir Services', null, null, null, null);

do $$
declare p record;
begin
  for p in select * from demo_people loop
    insert into auth.users (id, email, raw_user_meta_data, created_at, email_confirmed_at, last_sign_in_at)
    values (pg_temp.k('user:' || p.key), p.email || '@harbourview-demo.test',
            jsonb_build_object('full_name', p.name, 'demo', true), now() - interval '190 days', now() - interval '190 days',
            now() - make_interval(hours => (length(p.key) * 7) % 48));
    insert into fp_users_orgs (user_id, org_id, role, team, preferred_lng, created_at)
    values (pg_temp.k('user:' || p.key), pg_temp.k('org'), p.role, p.team, 'en', now() - interval '190 days');
    if p.role = 'technician' then
      insert into fp_technician_profiles (id, org_id, user_id, employee_id, phone, labor_rate, shift, skills)
      values (pg_temp.k('tech:' || p.key), pg_temp.k('org'), pg_temp.k('user:' || p.key), 'HV-' || lpad((100 + length(p.key) * 3)::text, 4, '0'),
              p.phone, p.rate, p.shift, p.skills);
    end if;
  end loop;
end $$;

insert into fp_technician_certifications (org_id, technician_profile_id, name, issuer, expiry_date) values
  (pg_temp.k('org'), pg_temp.k('tech:minh'),  'Refrigerant handling (Level 2)', 'Demo HVAC Institute', current_date + 420),
  (pg_temp.k('org'), pg_temp.k('tech:sofia'), 'Licensed electrician (LV)', 'Demo Electrical Board', current_date + 200),
  (pg_temp.k('org'), pg_temp.k('tech:tomas'), 'Fire system inspector', 'Demo Fire Academy', current_date + 25),
  (pg_temp.k('org'), pg_temp.k('tech:kenji'), 'Confined space entry', 'Demo Safety Council', current_date + 300);

-- Optional: an existing account becomes the demo's administrator.
do $$
declare v_owner uuid;
begin
  select id into v_owner from auth.users
   where lower(email) = lower(nullif(current_setting('fp.demo_owner_email', true), ''));
  if v_owner is not null then
    insert into fp_users_orgs (user_id, org_id, role, team, preferred_lng)
    values (v_owner, pg_temp.k('org'), 'org_admin', 'Management', 'en')
    on conflict (user_id, org_id) do update set role = 'org_admin';
  end if;
end $$;

insert into fp_notification_prefs (user_id, email_enabled, sms_enabled, push_enabled)
select pg_temp.k('user:' || key), true, false, key in ('minh', 'sofia', 'kenji') from demo_people
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Sites → buildings → floors → rooms / zones
-- ---------------------------------------------------------------------------
insert into fp_sites (id, org_id, name_i18n, address, lat, lng) values
  (pg_temp.k('site:tower'),    pg_temp.k('org'), pg_temp.t('Harbourview Tower', 'Tòa Harbourview'),       '88 Demo Harbour Road, District 1 (fictional)', 10.7760, 106.7040),
  (pg_temp.k('site:riverside'), pg_temp.k('org'), pg_temp.t('Riverside Business Park', 'Khu văn phòng Riverside'), '15 Demo Riverside Street, Thu Duc (fictional)', 10.8020, 106.7400),
  (pg_temp.k('site:lakeside'),  pg_temp.k('org'), pg_temp.t('Lakeside Residences', 'Chung cư Lakeside'),   '7 Demo Lakeview Avenue, District 7 (fictional)', 10.7300, 106.7210);

create temp table demo_locs (key text, site text, parent text, kind text, en text, vi text) on commit preserve rows;
insert into demo_locs values
  -- Harbourview Tower
  ('tower-a',   'tower', null,       'building', 'Tower A', 'Tháp A'),
  ('ta-b1',     'tower', 'tower-a',  'floor', 'Basement B1', 'Tầng hầm B1'),
  ('ta-g',      'tower', 'tower-a',  'floor', 'Ground floor', 'Tầng trệt'),
  ('ta-l5',     'tower', 'tower-a',  'floor', 'Level 5 (plant)', 'Tầng 5 (kỹ thuật)'),
  ('ta-l12',    'tower', 'tower-a',  'floor', 'Level 12', 'Tầng 12'),
  ('ta-roof',   'tower', 'tower-a',  'floor', 'Roof', 'Mái'),
  ('ta-carpark','tower', 'ta-b1',    'zone',  'Car park B1', 'Bãi xe B1'),
  ('ta-pump',   'tower', 'ta-b1',    'room',  'Pump room', 'Phòng bơm'),
  ('ta-elec',   'tower', 'ta-b1',    'room',  'Main electrical room', 'Phòng điện chính'),
  ('ta-lobby',  'tower', 'ta-g',     'zone',  'Main lobby', 'Sảnh chính'),
  ('ta-liftlobby','tower','ta-g',    'zone',  'Lift lobby', 'Sảnh thang máy'),
  ('ta-security','tower','ta-g',     'room',  'Security office', 'Phòng bảo vệ'),
  ('ta-plant5a','tower', 'ta-l5',    'room',  'Plant room 5A', 'Phòng máy 5A'),
  ('ta-501',    'tower', 'ta-l5',    'room',  'Office suite 501', 'Văn phòng 501'),
  ('ta-1201',   'tower', 'ta-l12',   'room',  'Suite 1201 (Marine Co)', 'Văn phòng 1201 (Marine Co)'),
  ('ta-12a',    'tower', 'ta-l12',   'room',  'Meeting room 12A', 'Phòng họp 12A'),
  ('ta-ctdeck', 'tower', 'ta-roof',  'zone',  'Cooling tower deck', 'Sàn tháp giải nhiệt'),
  -- Riverside Business Park
  ('block-b',   'riverside', null,   'building', 'Block B', 'Khối B'),
  ('block-c',   'riverside', null,   'building', 'Block C', 'Khối C'),
  ('bb-g',      'riverside', 'block-b', 'floor', 'Ground floor', 'Tầng trệt'),
  ('bb-l2',     'riverside', 'block-b', 'floor', 'Level 2', 'Tầng 2'),
  ('bb-server', 'riverside', 'bb-g',  'room', 'Server room', 'Phòng máy chủ'),
  ('bb-reception','riverside','bb-g', 'zone', 'Reception', 'Lễ tân'),
  ('bb-2a',     'riverside', 'bb-l2', 'zone', 'Open office 2A', 'Văn phòng mở 2A'),
  ('bb-2b',     'riverside', 'bb-l2', 'zone', 'Hot-desk zone 2B', 'Khu chỗ ngồi linh hoạt 2B'),
  ('bb-training','riverside','bb-l2', 'room', 'Training room', 'Phòng đào tạo'),
  ('bc-g',      'riverside', 'block-c', 'floor', 'Ground floor', 'Tầng trệt'),
  ('bc-workshop','riverside','bc-g',  'room', 'Maintenance workshop', 'Xưởng bảo trì'),
  ('bc-store',  'riverside', 'bc-g',  'room', 'Spare-parts store', 'Kho phụ tùng'),
  -- Lakeside Residences
  ('res-tower', 'lakeside', null,     'building', 'Residence Tower', 'Tòa căn hộ'),
  ('rt-g',      'lakeside', 'res-tower', 'floor', 'Ground floor', 'Tầng trệt'),
  ('rt-l10',    'lakeside', 'res-tower', 'floor', 'Level 10', 'Tầng 10'),
  ('rt-lobby',  'lakeside', 'rt-g',   'zone', 'Residents'' lobby', 'Sảnh cư dân'),
  ('rt-gym',    'lakeside', 'rt-g',   'room', 'Gym', 'Phòng tập'),
  ('rt-pool',   'lakeside', 'rt-g',   'zone', 'Pool deck', 'Khu hồ bơi'),
  ('rt-plant',  'lakeside', 'rt-g',   'room', 'Plant room', 'Phòng kỹ thuật'),
  ('rt-1005',   'lakeside', 'rt-l10', 'room', 'Apartment 10-05', 'Căn hộ 10-05'),
  ('rt-bbq',    'lakeside', 'rt-g',   'zone', 'BBQ terrace', 'Khu nướng BBQ');

insert into fp_locations (id, org_id, site_id, parent_id, name_i18n, kind)
select pg_temp.k('loc:' || key), pg_temp.k('org'), pg_temp.k('site:' || site),
       case when parent is null then null else pg_temp.k('loc:' || parent) end, pg_temp.t(en, vi), kind
from demo_locs;

-- Staff site access: technicians by site; managers and admin see everything.
insert into fp_user_sites (user_id, org_id, site_id) values
  (pg_temp.k('user:minh'),  pg_temp.k('org'), pg_temp.k('site:tower')),
  (pg_temp.k('user:minh'),  pg_temp.k('org'), pg_temp.k('site:riverside')),
  (pg_temp.k('user:sofia'), pg_temp.k('org'), pg_temp.k('site:tower')),
  (pg_temp.k('user:sofia'), pg_temp.k('org'), pg_temp.k('site:riverside')),
  (pg_temp.k('user:kenji'), pg_temp.k('org'), pg_temp.k('site:tower')),
  (pg_temp.k('user:kenji'), pg_temp.k('org'), pg_temp.k('site:lakeside')),
  (pg_temp.k('user:grace'), pg_temp.k('org'), pg_temp.k('site:lakeside')),
  (pg_temp.k('user:grace'), pg_temp.k('org'), pg_temp.k('site:riverside')),
  (pg_temp.k('user:tomas'), pg_temp.k('org'), pg_temp.k('site:tower')),
  (pg_temp.k('user:tomas'), pg_temp.k('org'), pg_temp.k('site:lakeside'));

-- ---------------------------------------------------------------------------
-- Catalogues: asset types, fault types, SLAs, cost centres, part categories
-- ---------------------------------------------------------------------------
insert into fp_asset_types (id, org_id, name_i18n) values
  (pg_temp.k('type:chiller'),   pg_temp.k('org'), pg_temp.t('Chiller', 'Máy làm lạnh nước')),
  (pg_temp.k('type:ahu'),       pg_temp.k('org'), pg_temp.t('Air handling unit', 'Bộ xử lý không khí (AHU)')),
  (pg_temp.k('type:ct'),        pg_temp.k('org'), pg_temp.t('Cooling tower', 'Tháp giải nhiệt')),
  (pg_temp.k('type:splitac'),   pg_temp.k('org'), pg_temp.t('Split air conditioner', 'Máy lạnh treo tường')),
  (pg_temp.k('type:lift'),      pg_temp.k('org'), pg_temp.t('Lift / elevator', 'Thang máy')),
  (pg_temp.k('type:genset'),    pg_temp.k('org'), pg_temp.t('Generator', 'Máy phát điện')),
  (pg_temp.k('type:switch'),    pg_temp.k('org'), pg_temp.t('Switchboard', 'Tủ điện')),
  (pg_temp.k('type:ups'),       pg_temp.k('org'), pg_temp.t('UPS', 'Bộ lưu điện (UPS)')),
  (pg_temp.k('type:pump'),      pg_temp.k('org'), pg_temp.t('Pump', 'Máy bơm')),
  (pg_temp.k('type:fire'),      pg_temp.k('org'), pg_temp.t('Fire protection', 'Phòng cháy chữa cháy')),
  (pg_temp.k('type:cctv'),      pg_temp.k('org'), pg_temp.t('Security / CCTV', 'An ninh / CCTV')),
  (pg_temp.k('type:gym'),       pg_temp.k('org'), pg_temp.t('Gym equipment', 'Thiết bị phòng tập')),
  (pg_temp.k('type:heater'),    pg_temp.k('org'), pg_temp.t('Water heater', 'Máy nước nóng')),
  (pg_temp.k('type:lighting'),  pg_temp.k('org'), pg_temp.t('Lighting', 'Chiếu sáng'));

insert into fp_fault_types (id, org_id, name_i18n, default_priority) values
  (pg_temp.k('fault:hvac'),     pg_temp.k('org'), pg_temp.t('Air-conditioning not cooling', 'Máy lạnh không mát'), 'high'),
  (pg_temp.k('fault:leak'),     pg_temp.k('org'), pg_temp.t('Water leak', 'Rò rỉ nước'), 'high'),
  (pg_temp.k('fault:elec'),     pg_temp.k('org'), pg_temp.t('Electrical fault', 'Sự cố điện'), 'high'),
  (pg_temp.k('fault:light'),    pg_temp.k('org'), pg_temp.t('Lighting out', 'Hỏng đèn'), 'low'),
  (pg_temp.k('fault:lift'),     pg_temp.k('org'), pg_temp.t('Lift fault', 'Sự cố thang máy'), 'critical'),
  (pg_temp.k('fault:plumb'),    pg_temp.k('org'), pg_temp.t('Blocked drain / toilet', 'Tắc cống / bồn cầu'), 'medium'),
  (pg_temp.k('fault:noise'),    pg_temp.k('org'), pg_temp.t('Noise / vibration', 'Tiếng ồn / rung'), 'medium'),
  (pg_temp.k('fault:clean'),    pg_temp.k('org'), pg_temp.t('Cleaning needed', 'Cần vệ sinh'), 'low'),
  (pg_temp.k('fault:door'),     pg_temp.k('org'), pg_temp.t('Door / lock', 'Cửa / khóa'), 'medium');

insert into fp_sla_policies (org_id, priority, resolution_hours) values
  (pg_temp.k('org'), 'critical', 4), (pg_temp.k('org'), 'high', 24), (pg_temp.k('org'), 'medium', 72), (pg_temp.k('org'), 'low', 168);

insert into fp_cost_centers (id, org_id, name, code) values
  (pg_temp.k('cc:tower'),     pg_temp.k('org'), 'Harbourview Tower operations', 'CC-100'),
  (pg_temp.k('cc:riverside'), pg_temp.k('org'), 'Riverside Business Park', 'CC-200'),
  (pg_temp.k('cc:lakeside'),  pg_temp.k('org'), 'Lakeside Residences', 'CC-300');

insert into fp_part_categories (id, org_id, name_i18n) values
  (pg_temp.k('pcat:hvac'),  pg_temp.k('org'), pg_temp.t('HVAC', 'Điều hòa')),
  (pg_temp.k('pcat:elec'),  pg_temp.k('org'), pg_temp.t('Electrical', 'Điện')),
  (pg_temp.k('pcat:plumb'), pg_temp.k('org'), pg_temp.t('Plumbing', 'Cấp thoát nước')),
  (pg_temp.k('pcat:mech'),  pg_temp.k('org'), pg_temp.t('Mechanical', 'Cơ khí')),
  (pg_temp.k('pcat:cons'),  pg_temp.k('org'), pg_temp.t('Consumables', 'Vật tư tiêu hao'));

insert into fp_expense_categories (id, org_id, name) values
  (pg_temp.k('ecat:repairs'), pg_temp.k('org'), 'Repairs'),
  (pg_temp.k('ecat:parts'),   pg_temp.k('org'), 'Spare parts'),
  (pg_temp.k('ecat:contr'),   pg_temp.k('org'), 'Contractors'),
  (pg_temp.k('ecat:util'),    pg_temp.k('org'), 'Utilities');

-- ---------------------------------------------------------------------------
-- Vendors, contracts, licences
-- ---------------------------------------------------------------------------
insert into fp_vendors (id, org_id, name, category, email, phone) values
  (pg_temp.k('vendor:coolair'),  pg_temp.k('org'), 'CoolAir Services (Demo)',        'HVAC contractor',        'service@coolair-demo.test',   '+84 28 0000 0201'),
  (pg_temp.k('vendor:liftcare'), pg_temp.k('org'), 'LiftCare Vietnam (Demo)',        'Lift maintenance',       'callout@liftcare-demo.test',  '+84 28 0000 0202'),
  (pg_temp.k('vendor:powergen'), pg_temp.k('org'), 'PowerGen Solutions (Demo)',      'Generators',             'support@powergen-demo.test',  '+84 28 0000 0203'),
  (pg_temp.k('vendor:aqua'),     pg_temp.k('org'), 'AquaFlow Plumbing (Demo)',       'Plumbing',               'jobs@aquaflow-demo.test',     '+84 28 0000 0204'),
  (pg_temp.k('vendor:safeguard'),pg_temp.k('org'), 'SafeGuard Fire Protection (Demo)','Fire protection',       'inspect@safeguard-demo.test', '+84 28 0000 0205'),
  (pg_temp.k('vendor:bright'),   pg_temp.k('org'), 'BrightSpark Supplies (Demo)',    'Electrical & parts supplier', 'orders@brightspark-demo.test', '+84 28 0000 0206'),
  (pg_temp.k('vendor:cleanpro'), pg_temp.k('org'), 'CleanPro Facility Services (Demo)', 'Cleaning',            'ops@cleanpro-demo.test',      '+84 28 0000 0207');

insert into fp_contracts (org_id, vendor_id, title, document_url, start_date, expiry_date, reminder_days) values
  (pg_temp.k('org'), pg_temp.k('vendor:liftcare'),  'Lift maintenance contract – Tower A & Residence Tower', 'https://example.com/demo/lift-contract.pdf', current_date - 345, current_date + 20, 30),
  (pg_temp.k('org'), pg_temp.k('vendor:coolair'),   'Chiller & cooling tower service agreement', 'https://example.com/demo/chiller-agreement.pdf', current_date - 120, current_date + 245, 30),
  (pg_temp.k('org'), pg_temp.k('vendor:safeguard'), 'Fire protection inspection contract', 'https://example.com/demo/fire-contract.pdf', current_date - 200, current_date + 165, 45),
  (pg_temp.k('org'), pg_temp.k('vendor:cleanpro'),  'Cleaning services – all sites', null, current_date - 30, current_date + 335, 30);

insert into fp_licenses (org_id, name, holder, document_url, expiry_date, reminder_days) values
  (pg_temp.k('org'), 'Fire safety certificate – Harbourview Tower', 'Harbourview Properties (Demo)', 'https://example.com/demo/fire-cert.pdf', current_date + 45, 60),
  (pg_temp.k('org'), 'Lift operating permit – Tower A', 'Harbourview Properties (Demo)', null, current_date + 150, 30),
  (pg_temp.k('org'), 'Generator emission permit – GEN-01', 'Harbourview Properties (Demo)', null, current_date - 5, 30);

-- ---------------------------------------------------------------------------
-- Assets (with specifications) and meters
-- ---------------------------------------------------------------------------
create temp table demo_assets (key text, loc text, type text, en text, serial text, mfr text, model text, bought int, cost numeric, warranty int, specs jsonb, status text) on commit preserve rows;
insert into demo_assets values
  ('ch01',  'ta-plant5a', 'chiller', 'Chiller CH-01',            'CH01-2019-4471', 'Carrier', '30XA-352', 2400, 2850000000, 400, '{"Capacity":"350 RT","Refrigerant":"R134a","Power":"225 kW","Chilled water":"6.7 °C / 12.2 °C"}', 'active'),
  ('ch02',  'ta-plant5a', 'chiller', 'Chiller CH-02',            'CH02-2019-4472', 'Carrier', '30XA-352', 2400, 2850000000, 400, '{"Capacity":"350 RT","Refrigerant":"R134a","Power":"225 kW","Role":"Standby / lead-lag"}', 'active'),
  ('ahu05', 'ta-plant5a', 'ahu',     'AHU-05 (Levels 5–8)',      'AHU05-2020-118', 'Daikin',  'DAHU-40',  2100, 420000000, -60, '{"Airflow":"18,000 m³/h","Filters":"G4 + F7","Fan motor":"15 kW"}', 'active'),
  ('ct01',  'ta-ctdeck',  'ct',      'Cooling tower CT-01',      'CT01-2019-2210', 'Liang Chi', 'LBC-300', 2400, 610000000, 0, '{"Capacity":"300 RT","Fan motor":"11 kW","Basin":"Stainless steel"}', 'active'),
  ('liftl1','ta-liftlobby','lift',   'Passenger lift L1',        'L1-2018-8810', 'Otis', 'Gen2 Premier', 2800, 1450000000, -900, '{"Capacity":"1,350 kg / 18 persons","Speed":"2.5 m/s","Floors served":"B1–Roof"}', 'active'),
  ('liftl2','ta-liftlobby','lift',   'Passenger lift L2',        'L2-2018-8811', 'Otis', 'Gen2 Premier', 2800, 1450000000, -900, '{"Capacity":"1,350 kg / 18 persons","Speed":"2.5 m/s","Floors served":"B1–Roof"}', 'active'),
  ('gen01', 'ta-elec',    'genset',  'Generator GEN-01',         'GEN01-2017-3302', 'Cummins', 'C1100 D5', 3100, 3900000000, -1500, '{"Rating":"1,100 kVA","Fuel":"Diesel","Tank":"2,000 L","Service interval":"250 run hours"}', 'active'),
  ('msb01', 'ta-elec',    'switch',  'Main switchboard MSB-01',  'MSB01-2017-0001', 'Schneider', 'Okken', 3100, 1200000000, -1400, '{"Incomer":"2,500 A","Voltage":"400 V / 3 phase"}', 'active'),
  ('fp01',  'ta-pump',    'fire',    'Fire pump FP-01',          'FP01-2017-7710', 'Grundfos', 'NKF 100-250', 3100, 380000000, -1400, '{"Flow":"150 m³/h","Head":"80 m","Driver":"Electric 55 kW"}', 'active'),
  ('wp01',  'ta-pump',    'pump',    'Domestic water pump WP-01','WP01-2019-5521', 'Grundfos', 'CR 32-4', 2300, 145000000, -500, '{"Flow":"32 m³/h","Head":"60 m","Motor":"7.5 kW"}', 'active'),
  ('nvr01', 'ta-security','cctv',    'CCTV recorder NVR-01',     'NVR01-2022-0091', 'Hikvision', 'DS-9664NI', 900, 95000000, 200, '{"Channels":"64","Storage":"8 × 8 TB"}', 'active'),
  ('ac1201','ta-1201',    'splitac', 'Split AC – Suite 1201',    'AC1201-2021-331', 'Daikin', 'FTKF50', 1300, 18500000, -200, '{"Capacity":"18,000 BTU","Refrigerant":"R32"}', 'active'),
  ('led-lobby','ta-lobby','lighting','Lobby lighting circuit',   null, 'Philips', 'CoreLine DN140', 1000, 65000000, 0, '{"Fittings":"64 × 18 W LED downlights"}', 'active'),
  ('crac01','bb-server',  'splitac', 'Server room CRAC-01',      'CRAC01-2021-12', 'Vertiv', 'Liebert PDX', 1200, 520000000, 90, '{"Cooling":"35 kW","Set point":"22 °C / 45% RH"}', 'active'),
  ('ups01', 'bb-server',  'ups',     'UPS-01 (server room)',     'UPS01-2021-48', 'APC', 'Symmetra PX 40', 1200, 410000000, 90, '{"Rating":"40 kVA","Battery autonomy":"15 min at full load"}', 'active'),
  ('ac2a',  'bb-2a',      'splitac', 'Split AC – Open office 2A','AC2A-2020-554', 'LG', 'ATNQ48', 1700, 32000000, -300, '{"Capacity":"48,000 BTU cassette"}', 'active'),
  ('comp01','bc-workshop','pump',    'Workshop air compressor',  'COMP01-2016-9', 'Atlas Copco', 'GA11', 3500, 150000000, -2000, '{"Output":"1.9 m³/min at 7.5 bar"}', 'active'),
  ('lp-b2', 'bb-l2',      'lighting','Lighting panel LP-B2',     null, 'Schneider', 'Prisma', 1700, 45000000, -300, '{"Circuits":"24"}', 'active'),
  ('poolpump','rt-plant', 'pump',    'Pool circulation pump',    'PP-2020-77', 'Pentair', 'IntelliFlo', 1600, 58000000, -200, '{"Flow":"25 m³/h","Variable speed":"Yes"}', 'active'),
  ('liftr1','rt-lobby',   'lift',    'Residence lift R1',        'R1-2020-4410', 'Mitsubishi', 'NexWay', 1650, 1250000000, -250, '{"Capacity":"1,000 kg / 13 persons","Floors served":"G–L20"}', 'active'),
  ('heater01','rt-plant', 'heater',  'Central water heater WH-01','WH01-2020-3', 'Ariston', 'NT 500', 1600, 76000000, -250, '{"Capacity":"500 L","Power":"12 kW"}', 'active'),
  ('genr1', 'rt-plant',   'genset',  'Generator GEN-R1',         'GENR1-2020-51', 'Cummins', 'C500 D5', 1650, 1600000000, -250, '{"Rating":"500 kVA","Fuel":"Diesel"}', 'active'),
  ('treadmill','rt-gym',  'gym',     'Treadmill T-03',           'TM03-2019-10', 'Life Fitness', 'Integrity', 2200, 145000000, -1500, '{"Max user weight":"180 kg"}', 'active'),
  ('treadmill-old','rt-gym','gym',   'Treadmill T-01 (replaced)', 'TM01-2016-02', 'Life Fitness', 'T5', 3300, 95000000, -2600, '{"Note":"Replaced by T-03"}', 'retired');

insert into fp_assets (id, org_id, location_id, asset_type_id, name_i18n, serial, manufacturer, model, purchase_date, purchase_cost, warranty_expiry, specs, qr_code, status, created_at, retired_at)
select pg_temp.k('asset:' || key), pg_temp.k('org'), pg_temp.k('loc:' || loc), pg_temp.k('type:' || type), pg_temp.t(en), serial, mfr, model,
       current_date - bought, cost, current_date + warranty, specs,
       'HV-' || upper(replace(key, '-', '')), status, now() - interval '190 days',
       case when status = 'retired' then now() - interval '40 days' end
from demo_assets;

insert into fp_meters (id, org_id, asset_id, name_i18n, unit) values
  (pg_temp.k('meter:gen01'), pg_temp.k('org'), pg_temp.k('asset:gen01'), pg_temp.t('GEN-01 run hours', 'Giờ chạy GEN-01'), 'h'),
  (pg_temp.k('meter:ch01'),  pg_temp.k('org'), pg_temp.k('asset:ch01'),  pg_temp.t('CH-01 run hours', 'Giờ chạy CH-01'), 'h'),
  (pg_temp.k('meter:liftl1'),pg_temp.k('org'), pg_temp.k('asset:liftl1'),pg_temp.t('Lift L1 trips', 'Số chuyến thang L1'), 'trips');

insert into fp_meter_readings (org_id, meter_id, value, read_at, read_by)
select pg_temp.k('org'), pg_temp.k('meter:gen01'), 4180 + g * 3.5, now() - make_interval(days => (26 - g) * 7), pg_temp.k('user:tomas') from generate_series(0, 26) g
union all
select pg_temp.k('org'), pg_temp.k('meter:ch01'), 21300 + g * 118, now() - make_interval(days => (26 - g) * 7), pg_temp.k('user:minh') from generate_series(0, 26) g
union all
select pg_temp.k('org'), pg_temp.k('meter:liftl1'), 812000 + g * 6400, now() - make_interval(days => (12 - g) * 14), pg_temp.k('user:grace') from generate_series(0, 12) g;

-- ---------------------------------------------------------------------------
-- Parts and stock
-- ---------------------------------------------------------------------------
create temp table demo_parts (key text, cat text, en text, sku text, unit text, stock numeric, reorder numeric, cost numeric, vendor text) on commit preserve rows;
insert into demo_parts values
  ('filter-g4',   'hvac',  'AHU pre-filter G4 (592×592)',  'HV-FLT-G4',   'pcs', 24, 12, 185000,  'coolair'),
  ('filter-f7',   'hvac',  'AHU bag filter F7 (592×592)',  'HV-FLT-F7',   'pcs', 10, 8,  640000,  'coolair'),
  ('oilfilter-ch','hvac',  'Chiller oil filter',           'HV-CH-OF',    'pcs', 4,  2,  1450000, 'coolair'),
  ('r134a',       'hvac',  'Refrigerant R134a',            'HV-R134A',    'kg',  36, 20, 320000,  'coolair'),
  ('capacitor',   'elec',  'Run capacitor 45/5 µF',        'EL-CAP-455',  'pcs', 0,  4,  95000,   'bright'),
  ('led18',       'elec',  'LED downlight 18 W',           'EL-LED-18',   'pcs', 6,  15, 210000,  'bright'),
  ('fuse63',      'elec',  'Fuse 63 A (gG)',               'EL-FUS-63',   'pcs', 30, 10, 48000,   'bright'),
  ('ups-batt',    'elec',  'UPS battery 12 V 100 Ah',      'EL-BAT-100',  'pcs', 8,  8,  4200000, 'bright'),
  ('vbelt',       'mech',  'V-belt B52',                   'ME-VB-B52',   'pcs', 9,  4,  135000,  null),
  ('door-roller', 'mech',  'Lift door roller',             'ME-LFT-DR',   'pcs', 6,  4,  380000,  'liftcare'),
  ('gen-oilfilter','mech', 'Generator oil filter',         'ME-GEN-OF',   'pcs', 1,  3,  690000,  'powergen'),
  ('engine-oil',  'mech',  'Engine oil 15W-40',            'ME-OIL-1540', 'L',   60, 40, 98000,   'powergen'),
  ('pipe-fit',    'plumb', 'Pipe coupling DN25',           'PL-CPL-25',   'pcs', 40, 15, 42000,   'aqua'),
  ('sprinkler',   'plumb', 'Sprinkler head 68 °C',         'PL-SPR-68',   'pcs', 24, 12, 115000,  'safeguard'),
  ('cleaner',     'cons',  'Coil cleaner (5 L)',           'CN-COIL-5',   'can', 7,  4,  560000,  'coolair');

insert into fp_parts (id, org_id, name_i18n, sku, unit, stock_balance, reorder_level, unit_cost, preferred_vendor_id, category_id)
select pg_temp.k('part:' || key), pg_temp.k('org'), pg_temp.t(en), sku, unit, stock, reorder, cost,
       case when vendor is null then null else pg_temp.k('vendor:' || vendor) end, pg_temp.k('pcat:' || cat)
from demo_parts;

-- ---------------------------------------------------------------------------
-- Checklists (inspection templates)
-- ---------------------------------------------------------------------------
insert into fp_checklist_templates (id, org_id, name_i18n) values
  (pg_temp.k('cl:chiller'),  pg_temp.k('org'), pg_temp.t('Chiller monthly inspection', 'Kiểm tra chiller hằng tháng')),
  (pg_temp.k('cl:genset'),   pg_temp.k('org'), pg_temp.t('Generator weekly test run', 'Chạy thử máy phát hằng tuần')),
  (pg_temp.k('cl:firepump'), pg_temp.k('org'), pg_temp.t('Fire pump monthly test', 'Kiểm tra bơm chữa cháy hằng tháng')),
  (pg_temp.k('cl:ahu'),      pg_temp.k('org'), pg_temp.t('AHU filter change', 'Thay lọc AHU')),
  (pg_temp.k('cl:lift'),     pg_temp.k('org'), pg_temp.t('Lift monthly safety check', 'Kiểm tra an toàn thang máy hằng tháng'));

insert into fp_checklist_items (org_id, template_id, ord, label_i18n, item_type, required) values
  (pg_temp.k('org'), pg_temp.k('cl:chiller'), 1, pg_temp.t('Chilled water supply temperature (°C)'), 'value', true),
  (pg_temp.k('org'), pg_temp.k('cl:chiller'), 2, pg_temp.t('Condenser pressure within range'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:chiller'), 3, pg_temp.t('Oil level and colour normal'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:chiller'), 4, pg_temp.t('No refrigerant leaks (sniffer test)'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:chiller'), 5, pg_temp.t('Photo of control panel readings'), 'photo', false),
  (pg_temp.k('org'), pg_temp.k('cl:chiller'), 6, pg_temp.t('Notes'), 'text', false),
  (pg_temp.k('org'), pg_temp.k('cl:genset'), 1, pg_temp.t('Fuel level (%)'), 'value', true),
  (pg_temp.k('org'), pg_temp.k('cl:genset'), 2, pg_temp.t('Started within 10 seconds'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:genset'), 3, pg_temp.t('Output voltage (V)'), 'value', true),
  (pg_temp.k('org'), pg_temp.k('cl:genset'), 4, pg_temp.t('No leaks or abnormal noise'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:firepump'), 1, pg_temp.t('Pump starts on pressure drop'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:firepump'), 2, pg_temp.t('Discharge pressure (bar)'), 'value', true),
  (pg_temp.k('org'), pg_temp.k('cl:firepump'), 3, pg_temp.t('Valves in correct position'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:ahu'), 1, pg_temp.t('Old filters removed and bagged'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:ahu'), 2, pg_temp.t('New filters fitted, correct direction'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:ahu'), 3, pg_temp.t('Differential pressure after change (Pa)'), 'value', false),
  (pg_temp.k('org'), pg_temp.k('cl:lift'), 1, pg_temp.t('Emergency phone works'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:lift'), 2, pg_temp.t('Doors re-open on obstruction'), 'pass_fail', true),
  (pg_temp.k('org'), pg_temp.k('cl:lift'), 3, pg_temp.t('Levelling accuracy at each floor'), 'pass_fail', true);

-- ---------------------------------------------------------------------------
-- Preventive maintenance plans
-- ---------------------------------------------------------------------------
insert into fp_pm_schedules (id, org_id, asset_id, name_i18n, interval_days, checklist_template_id, assigned_to, priority, next_due_at, last_run_at,
                             active, trigger_type, meter_id, meter_threshold, last_meter_value, lead_time_days) values
  (pg_temp.k('pm:ch01'),  pg_temp.k('org'), pg_temp.k('asset:ch01'),  pg_temp.t('Chiller CH-01 monthly inspection'), 30, pg_temp.k('cl:chiller'), pg_temp.k('user:minh'), 'medium', now() + interval '5 days', now() - interval '25 days', true, 'calendar', null, null, null, 3),
  (pg_temp.k('pm:ch02'),  pg_temp.k('org'), pg_temp.k('asset:ch02'),  pg_temp.t('Chiller CH-02 monthly inspection'), 30, pg_temp.k('cl:chiller'), pg_temp.k('user:minh'), 'medium', now() + interval '1 day', now() - interval '29 days', true, 'calendar', null, null, null, 3),
  (pg_temp.k('pm:gen01'), pg_temp.k('org'), pg_temp.k('asset:gen01'), pg_temp.t('GEN-01 weekly test run'), 7, pg_temp.k('cl:genset'), pg_temp.k('user:tomas'), 'high', now() - interval '1 day', now() - interval '8 days', true, 'calendar', null, null, null, 1),
  (pg_temp.k('pm:gen01-250h'), pg_temp.k('org'), pg_temp.k('asset:gen01'), pg_temp.t('GEN-01 250-hour service'), 365, null, pg_temp.k('user:tomas'), 'medium', null, now() - interval '150 days', true, 'meter', pg_temp.k('meter:gen01'), 250, 4180, 0),
  (pg_temp.k('pm:fp01'),  pg_temp.k('org'), pg_temp.k('asset:fp01'),  pg_temp.t('Fire pump FP-01 monthly test'), 30, pg_temp.k('cl:firepump'), pg_temp.k('user:tomas'), 'high', now() + interval '12 days', now() - interval '18 days', true, 'calendar', null, null, null, 3),
  (pg_temp.k('pm:ahu05'), pg_temp.k('org'), pg_temp.k('asset:ahu05'), pg_temp.t('AHU-05 quarterly filter change'), 90, pg_temp.k('cl:ahu'), pg_temp.k('user:grace'), 'low', now() + interval '9 days', now() - interval '81 days', true, 'calendar', null, null, null, 7),
  (pg_temp.k('pm:liftl1'),pg_temp.k('org'), pg_temp.k('asset:liftl1'),pg_temp.t('Lift L1 monthly safety check'), 30, pg_temp.k('cl:lift'), pg_temp.k('user:grace'), 'high', now() + interval '3 days', now() - interval '27 days', true, 'calendar', null, null, null, 2),
  (pg_temp.k('pm:ct01'),  pg_temp.k('org'), pg_temp.k('asset:ct01'),  pg_temp.t('Cooling tower water treatment check'), 14, null, pg_temp.k('user:minh'), 'medium', now() + interval '6 days', now() - interval '8 days', true, 'calendar', null, null, null, 2),
  (pg_temp.k('pm:ups01'), pg_temp.k('org'), pg_temp.k('asset:ups01'), pg_temp.t('UPS-01 battery test'), 180, null, pg_temp.k('user:sofia'), 'medium', now() + interval '40 days', now() - interval '140 days', true, 'calendar', null, null, null, 7),
  (pg_temp.k('pm:pool'),  pg_temp.k('org'), pg_temp.k('asset:poolpump'), pg_temp.t('Pool pump weekly clean'), 7, null, pg_temp.k('user:kenji'), 'low', now() + interval '2 days', now() - interval '5 days', true, 'calendar', null, null, null, 1),
  (pg_temp.k('pm:old-treadmill'), pg_temp.k('org'), pg_temp.k('asset:treadmill-old'), pg_temp.t('Treadmill T-01 service (paused)'), 90, null, pg_temp.k('user:grace'), 'low', now() + interval '30 days', now() - interval '120 days', false, 'calendar', null, null, null, 7);

insert into fp_pm_required_parts (org_id, pm_schedule_id, part_id, quantity) values
  (pg_temp.k('org'), pg_temp.k('pm:ch01'), pg_temp.k('part:oilfilter-ch'), 1),
  (pg_temp.k('org'), pg_temp.k('pm:ch02'), pg_temp.k('part:oilfilter-ch'), 1),
  (pg_temp.k('org'), pg_temp.k('pm:ahu05'), pg_temp.k('part:filter-g4'), 8),
  (pg_temp.k('org'), pg_temp.k('pm:ahu05'), pg_temp.k('part:filter-f7'), 8),
  (pg_temp.k('org'), pg_temp.k('pm:gen01-250h'), pg_temp.k('part:gen-oilfilter'), 2),
  (pg_temp.k('org'), pg_temp.k('pm:gen01-250h'), pg_temp.k('part:engine-oil'), 30);

-- ---------------------------------------------------------------------------
-- Requests and work orders: a storyline plus six months of history
-- ---------------------------------------------------------------------------
-- Key work orders used in the user guide.
create temp table demo_wo (key text, title text, instr text, asset text, loc text, fault text, pri text, status text, tech text, vendor text,
                           created_h int, due_h int, started_h int, resolved_h int, closed_h int, labour int, cost numeric, pm text,
                           hold text, completion text, failure text, downtime int, cc text, req_channel text, reporter text) on commit preserve rows;
insert into demo_wo values
  ('ch01-sep',   'Chiller CH-01 monthly inspection', 'Follow the chiller checklist. Replace the oil filter if the pressure drop is above 0.5 bar.', 'ch01', 'ta-plant5a', null, 'medium', 'closed', 'minh', null, 25*24+6, 25*24-48, 25*24, 25*24-3, 24*24, 150, 1640000, 'ch01', null, 'Inspection completed – oil filter replaced', null, 0, 'tower', null, null),
  ('ch01-press', 'Chiller CH-01 high condenser pressure', 'IoT alert: condenser pressure above 11 bar. Check condenser water flow and cooling tower fans; clean strainers.', 'ch01', 'ta-plant5a', 'hvac', 'critical', 'in_progress', 'minh', null, 3, -1, 2, null, null, 45, 0, null, null, null, null, 0, 'tower', null, null),
  ('liftl2-stuck','Lift L2 stopped between floors 7 and 8', 'Passengers released by security at 08:42. Contractor to find root cause before return to service.', 'liftl2', 'ta-liftlobby', 'lift', 'critical', 'resolved', null, 'liftcare', 30, 26, 29, 22, null, 180, 8500000, null, null, 'Door lock contact replaced; tested 20 cycles', 'Door interlock fault', 420, 'tower', 'web', 'Security office'),
  ('leak-b1',    'Water leak near car park bay 14', 'Leak sensor alarm in car park B1. Find the source (suspect DN25 pipe above bay 14) and repair.', 'wp01', 'ta-carpark', 'leak', 'high', 'assigned', 'kenji', null, 5, -19, null, null, null, 0, 0, null, null, null, null, 0, 'tower', 'qr', 'Car park attendant'),
  ('lobby-led',  'Replace failed LED downlights in main lobby', '6 downlights out near the reception desk. Use 18 W LED stock.', 'led-lobby', 'ta-lobby', 'light', 'low', 'open', null, null, 20, -148, null, null, null, 0, 0, null, null, null, null, 0, 'tower', 'web', 'Reception'),
  ('ac1201',     'Suite 1201 air-conditioning not cooling', 'Tenant reports warm office since this morning. Suspect failed run capacitor.', 'ac1201', 'ta-1201', 'hvac', 'high', 'on_hold', 'minh', null, 50, -26, 47, null, null, 60, 0, null, 'Waiting for run capacitor 45/5 µF (PO sent to BrightSpark)', null, null, 0, 'tower', 'web', 'Olivia Chen (Marine Co)'),
  ('gen01-wk',   'GEN-01 weekly test run', 'Run the generator on load for 30 minutes and record readings.', 'gen01', 'ta-elec', null, 'high', 'assigned', 'tomas', null, 30, 18, null, null, null, 0, 0, 'gen01', null, null, null, 0, 'tower', null, null),
  ('crac-alarm', 'Server room CRAC high-temperature alarm', 'Room temperature reached 27 °C overnight. Check refrigerant charge and condenser.', 'crac01', 'bb-server', 'hvac', 'high', 'in_progress', 'sofia', null, 14, -10, 6, null, null, 90, 0, null, null, null, null, 0, 'riverside', null, null),
  ('treadmill',  'Treadmill T-03 belt slipping and noisy', 'Adjust belt tension and lubricate deck.', 'treadmill', 'rt-gym', 'noise', 'low', 'closed', 'grace', null, 9*24, 9*24-72, 8*24, 8*24-2, 7*24, 75, 250000, null, null, 'Belt tensioned and deck lubricated', 'Belt tension low', 0, 'lakeside', 'zalo', 'Ethan Brooks (Apt 10-05)'),
  ('fp01-aug',   'Fire pump FP-01 monthly test', 'Monthly churn test per checklist.', 'fp01', 'ta-pump', null, 'high', 'verified', 'tomas', null, 18*24+4, 18*24-24, 18*24, 18*24-1, null, 60, 0, 'fp01', null, 'Test passed', null, 0, 'tower', null, null),
  ('ct-motor',   'Replace cooling tower CT-01 fan motor', 'Motor bearings noisy, insulation test low. Contractor quote attached — needs approval before ordering.', 'ct01', 'ta-ctdeck', 'noise', 'medium', 'open', null, 'coolair', 40, -200, null, null, null, 0, 0, null, null, null, null, 0, 'tower', null, null),
  ('pool-pump',  'Pool circulation pump weekly clean', 'Clean strainer basket and check pressure.', 'poolpump', 'rt-pool', null, 'low', 'assigned', 'kenji', null, 2, -46, null, null, null, 0, 0, 'pool', null, null, null, 0, 'lakeside', null, null),
  ('apt1005-leak','Water dripping from bathroom ceiling – Apt 10-05', 'Resident reports drip from ceiling. Check apartment 11-05 above for leak.', 'heater01', 'rt-1005', 'leak', 'high', 'in_progress', 'kenji', null, 20, -4, 3, null, null, 30, 0, null, null, null, null, 0, 'lakeside', 'zalo', 'Ethan Brooks (Apt 10-05)'),
  ('liftr1-noise','Residence lift R1 rattling between L5 and L8', 'Residents report noise; check guide shoes.', 'liftr1', 'rt-lobby', 'lift', 'medium', 'assigned', null, 'liftcare', 26, -46, null, null, null, 0, 0, null, null, null, null, 0, 'lakeside', 'web', 'Residents'' committee');

-- History: 70 finished jobs over the last six months, spread across assets and technicians.
insert into demo_wo
select 'hist-' || g,
       (array['AHU-05 fan belt replaced','Office 501 light flickering','Blocked drain – ground floor toilets','Lift L1 door sensor fault','Split AC 2A not cooling',
              'Pool pump pressure low','UPS-01 alarm – battery test failed','Generator GEN-R1 fails to start','Water heater WH-01 no hot water','CCTV camera 12 offline',
              'Leaking tap – gym changing room','Cooling tower CT-01 basin cleaning','Chiller CH-02 oil top-up','Car park lighting out – bays 20–26','Door closer broken – training room'])[1 + g % 15],
       'Historical job (demo).',
       (array['ahu05','lp-b2','wp01','liftl1','ac2a','poolpump','ups01','genr1','heater01','nvr01','poolpump','ct01','ch02','led-lobby','comp01'])[1 + g % 15],
       (array['ta-plant5a','ta-501','ta-g','ta-liftlobby','bb-2a','rt-pool','bb-server','rt-plant','rt-plant','ta-security','rt-gym','ta-ctdeck','ta-plant5a','ta-carpark','bb-training'])[1 + g % 15],
       (array['noise','light','plumb','lift','hvac','plumb','elec','elec','plumb','elec','leak','clean','hvac','light','door'])[1 + g % 15],
       (array['low','medium','high','medium','high','low','high','critical','medium','low','low','medium','medium','low','medium'])[1 + g % 15],
       case when g % 9 = 0 then 'verified' else 'closed' end,
       (array['grace','sofia','kenji','grace','minh','kenji','sofia','tomas','kenji','sofia','kenji','minh','minh','sofia','grace'])[1 + g % 15],
       case when g % 15 in (3, 7) then (array['liftcare','powergen'])[1 + (g % 15 = 7)::int] else null end,
       (g * 61 + 30) , null, null, null, null,
       30 + (g * 37) % 210, ((g * 37) % 5) * 350000, null, null,
       (array['Adjusted and tested','Repaired','Replaced component','Cleaned and flushed','Reset and monitored'])[1 + g % 5],
       (array['Wear','Blockage','Component failure','Misuse','Power interruption'])[1 + g % 5],
       case when g % 15 in (3, 7) then 60 + g % 120 else 0 end,
       (array['tower','tower','tower','tower','riverside','lakeside','riverside','lakeside','lakeside','tower','lakeside','tower','tower','tower','riverside'])[1 + g % 15],
       (array['web','qr','email','zalo','web'])[1 + g % 5],
       'Demo reporter'
from generate_series(1, 70) g;

-- Timing for historical jobs, spread so the weekly charts have shape.
update demo_wo set due_h = created_h - (case pri when 'critical' then 4 when 'high' then 24 when 'medium' then 72 else 168 end),
                   started_h = created_h - 2 - (length(key) % 5),
                   resolved_h = created_h - 3 - (length(key) % 5) - (case pri when 'critical' then 2 when 'high' then 10 when 'medium' then 30 else 60 end),
                   closed_h = case when status = 'closed' then created_h - 5 - (length(key) % 5) - (case pri when 'critical' then 2 when 'high' then 10 when 'medium' then 30 else 60 end) - 20 end
where key like 'hist-%';
-- A few historical jobs finished late (SLA breaches) for the reports.
update demo_wo set resolved_h = due_h - 30, closed_h = case when closed_h is null then null else due_h - 50 end
where key in ('hist-5', 'hist-20', 'hist-35', 'hist-50');

-- Requests (one per reported job) + a few that haven't become work orders.
insert into fp_requests (id, org_id, asset_id, location_id, fault_type_id, title, body_original, source_lng, severity, priority, channel, reporter_contact,
                         status, created_by, created_at, updated_at)
select pg_temp.k('req:' || key), pg_temp.k('org'), pg_temp.k('asset:' || asset), pg_temp.k('loc:' || loc),
       case when fault is null then null else pg_temp.k('fault:' || fault) end,
       title, coalesce(nullif(instr, 'Historical job (demo).'), title) , 'en', pri, pri, req_channel, reporter,
       case status when 'open' then 'triaged' when 'assigned' then 'assigned' when 'in_progress' then 'in_progress' when 'on_hold' then 'on_hold'
                   when 'resolved' then 'resolved' else 'closed' end,
       case when key = 'ac1201' then pg_temp.k('user:olivia') when key in ('apt1005-leak', 'treadmill') then pg_temp.k('user:ethan') else pg_temp.k('user:daniel') end,
       now() - make_interval(hours => created_h + 1), now() - make_interval(hours => greatest(coalesce(closed_h, resolved_h, started_h, created_h), 0))
from demo_wo where req_channel is not null;

insert into fp_requests (id, org_id, location_id, fault_type_id, title, body_original, source_lng, priority, channel, reporter_contact, status, created_by, created_at, updated_at) values
  (pg_temp.k('req:new1'), pg_temp.k('org'), pg_temp.k('loc:ta-501'), pg_temp.k('fault:hvac'), 'Office 501 too cold near windows', 'Temperature feels around 20 °C near the window desks.', 'en', 'medium', 'web', 'Office 501 tenant', 'new', pg_temp.k('user:daniel'), now() - interval '40 minutes', now() - interval '40 minutes'),
  (pg_temp.k('req:new2'), pg_temp.k('org'), pg_temp.k('loc:rt-lobby'), pg_temp.k('fault:door'), 'Lobby entrance door closes too fast', 'Door slams shut, risk to elderly residents.', 'en', 'medium', 'qr', 'Resident (via QR code)', 'new', null, now() - interval '2 hours', now() - interval '2 hours'),
  (pg_temp.k('req:new3'), pg_temp.k('org'), pg_temp.k('loc:bb-2a'), pg_temp.k('fault:clean'), 'Coffee spill on carpet near 2A pantry', null, 'en', 'low', 'email', 'facilities@tenant-demo.test', 'new', null, now() - interval '5 hours', now() - interval '5 hours'),
  (pg_temp.k('req:new4'), pg_temp.k('org'), pg_temp.k('loc:ta-12a'), pg_temp.k('fault:light'), 'Đèn phòng họp 12A nhấp nháy', 'Đèn trần phòng họp 12A bị nhấp nháy liên tục.', 'vi', 'low', 'zalo', 'Marine Co reception', 'new', pg_temp.k('user:olivia'), now() - interval '26 hours', now() - interval '26 hours'),
  (pg_temp.k('req:rej1'), pg_temp.k('org'), pg_temp.k('loc:ta-1201'), null, 'Please move our printer to the other desk', 'Not a maintenance task.', 'en', 'low', 'web', 'Olivia Chen (Marine Co)', 'rejected', pg_temp.k('user:olivia'), now() - interval '6 days', now() - interval '6 days');

insert into fp_work_orders (id, org_id, request_id, asset_id, assigned_to, vendor_id, title, instructions, priority, status, due_at, closed_at, labour_minutes, cost,
                            created_at, updated_at, checklist_template_id, pm_schedule_id, location_id, fault_type_id, severity, failure_code, completion_code,
                            downtime_minutes, cost_center_id, started_at, resolved_at, verified_at, verified_by, hold_reason)
select pg_temp.k('wo:' || key), pg_temp.k('org'),
       case when req_channel is null then null else pg_temp.k('req:' || key) end,
       pg_temp.k('asset:' || asset),
       case when tech is null then null else pg_temp.k('user:' || tech) end,
       case when vendor is null then null else pg_temp.k('vendor:' || vendor) end,
       title, instr, pri, status,
       now() - make_interval(hours => due_h),
       case when closed_h is null then null else now() - make_interval(hours => closed_h) end,
       labour, cost,
       now() - make_interval(hours => created_h),
       now() - make_interval(hours => greatest(coalesce(closed_h, resolved_h, started_h, created_h), 0)),
       case pm when 'ch01' then pg_temp.k('cl:chiller') when 'gen01' then pg_temp.k('cl:genset') when 'fp01' then pg_temp.k('cl:firepump') end,
       case when pm is null then null else pg_temp.k('pm:' || pm) end,
       pg_temp.k('loc:' || loc),
       case when fault is null then null else pg_temp.k('fault:' || fault) end,
       pri, failure, completion, downtime, pg_temp.k('cc:' || cc),
       case when started_h is null then null else now() - make_interval(hours => started_h) end,
       case when resolved_h is null then null else now() - make_interval(hours => resolved_h) end,
       case when status in ('verified', 'closed') and resolved_h is not null then now() - make_interval(hours => resolved_h - 1) end,
       case when status in ('verified', 'closed') then pg_temp.k('user:priya') end,
       hold
from demo_wo;

-- Labour entries for every job with time booked.
insert into fp_wo_labor (org_id, work_order_id, user_id, minutes, rate_snapshot, logged_at)
select pg_temp.k('org'), pg_temp.k('wo:' || w.key), pg_temp.k('user:' || w.tech), w.labour, p.rate,
       now() - make_interval(hours => coalesce(w.resolved_h, w.started_h, w.created_h))
from demo_wo w join demo_people p on p.key = w.tech
where w.labour > 0 and w.tech is not null;

-- Parts used on finished jobs (and the matching stock issues).
insert into fp_wo_parts (id, org_id, work_order_id, part_id, quantity, created_by, created_at, unit_cost_snapshot)
select pg_temp.k('wopart:' || x.wo || ':' || x.part), pg_temp.k('org'), pg_temp.k('wo:' || x.wo), pg_temp.k('part:' || x.part), x.qty,
       pg_temp.k('user:' || x.who), now() - make_interval(hours => x.h), dp.cost
from (values
  ('ch01-sep', 'oilfilter-ch', 1, 'minh', 25*24-2),
  ('ch01-sep', 'cleaner', 1, 'minh', 25*24-2),
  ('treadmill', 'vbelt', 1, 'grace', 8*24-1),
  ('hist-1', 'vbelt', 1, 'grace', 61*1+25),
  ('hist-2', 'led18', 2, 'sofia', 61*2+25),
  ('hist-14', 'led18', 6, 'sofia', 61*14+25),
  ('hist-7', 'ups-batt', 4, 'sofia', 61*7+25),
  ('hist-13', 'r134a', 3, 'minh', 61*13+25),
  ('hist-11', 'pipe-fit', 2, 'kenji', 61*11+25),
  ('hist-16', 'vbelt', 1, 'grace', 61*16+25),
  ('hist-29', 'led18', 4, 'sofia', 61*29+25),
  ('hist-22', 'ups-batt', 2, 'sofia', 61*22+25),
  ('hist-28', 'r134a', 2, 'minh', 61*28+25)
) as x(wo, part, qty, who, h)
join demo_parts dp on dp.key = x.part;

insert into fp_inventory_transactions (org_id, part_id, type, quantity_delta, ref_table, ref_id, note, created_by, created_at, pre_applied)
select wp.org_id, wp.part_id, 'issue', -wp.quantity, 'fp_wo_parts', wp.id, 'Issued to work order', wp.created_by, wp.created_at, true
from fp_wo_parts wp where wp.org_id = pg_temp.k('org');

-- Cost = labour + parts, as fp_recalc_wo_cost (0046) would have set it.
update fp_work_orders w
   set labour_minutes = coalesce(l.minutes, 0),
       cost = coalesce(l.cost, 0) + coalesce(p.cost, 0)
  from (select id from fp_work_orders where org_id = pg_temp.k('org')) x
  left join (select work_order_id, sum(minutes) minutes, sum(minutes / 60.0 * rate_snapshot) cost from fp_wo_labor group by 1) l on l.work_order_id = x.id
  left join (select work_order_id, sum(quantity * coalesce(unit_cost_snapshot, 0)) cost from fp_wo_parts group by 1) p on p.work_order_id = x.id
 where w.id = x.id;

-- Checklist results for finished PM jobs.
insert into fp_checklist_runs (org_id, template_id, work_order_id, performed_by, results, completed_at) values
  (pg_temp.k('org'), pg_temp.k('cl:chiller'), pg_temp.k('wo:ch01-sep'), pg_temp.k('user:minh'),
   '{"Chilled water supply temperature (°C)": "6.8", "Condenser pressure within range": "pass", "Oil level and colour normal": "pass", "No refrigerant leaks (sniffer test)": "pass", "Notes": "Oil filter pressure drop 0.6 bar – replaced. Coil cleaned."}',
   now() - interval '25 days' + interval '3 hours'),
  (pg_temp.k('org'), pg_temp.k('cl:firepump'), pg_temp.k('wo:fp01-aug'), pg_temp.k('user:tomas'),
   '{"Pump starts on pressure drop": "pass", "Discharge pressure (bar)": "8.2", "Valves in correct position": "pass"}',
   now() - interval '18 days' + interval '1 hour');

-- Pending approval for the expensive cooling-tower motor.
insert into fp_approvals (org_id, work_order_id, status, note, requested_by, created_at) values
  (pg_temp.k('org'), pg_temp.k('wo:ct-motor'), 'pending', 'Contractor quote 48,500,000 VND for a new 11 kW motor and installation.', pg_temp.k('user:priya'), now() - interval '38 hours'),
  (pg_temp.k('org'), pg_temp.k('wo:hist-8'), 'approved', 'Emergency starter-motor replacement approved.', pg_temp.k('user:priya'), now() - interval '40 days');
update fp_approvals set decided_by = pg_temp.k('user:alex'), decided_at = created_at + interval '2 hours'
 where org_id = pg_temp.k('org') and status = 'approved';

-- ---------------------------------------------------------------------------
-- Purchasing: POs, receipts, invoices, payments, budgets, expenditure
-- ---------------------------------------------------------------------------
insert into fp_finance_procurement (id, org_id, title, vendor, vendor_id, amount, status, notes, po_number, cost_center_id, created_at, updated_at) values
  (pg_temp.k('po:filters'),   pg_temp.k('org'), 'AHU filters and chiller consumables', 'CoolAir Services (Demo)', pg_temp.k('vendor:coolair'), 22080000, 'received', 'Quarterly restock.', 'PO-2026-0101', pg_temp.k('cc:tower'), now() - interval '34 days', now() - interval '27 days'),
  (pg_temp.k('po:caps'),      pg_temp.k('org'), 'Run capacitors and LED downlights', 'BrightSpark Supplies (Demo)', pg_temp.k('vendor:bright'), 5530000, 'po', 'Urgent – Suite 1201 AC is waiting for a capacitor.', 'PO-2026-0102', pg_temp.k('cc:tower'), now() - interval '2 days', now() - interval '2 days'),
  (pg_temp.k('po:ctmotor'),   pg_temp.k('org'), 'Cooling tower CT-01 fan motor (quote)', 'CoolAir Services (Demo)', pg_temp.k('vendor:coolair'), 48500000, 'rfq', 'Awaiting approval of work order.', null, pg_temp.k('cc:tower'), now() - interval '36 hours', now() - interval '36 hours'),
  (pg_temp.k('po:genoil'),    pg_temp.k('org'), 'Generator oil filters and engine oil', 'PowerGen Solutions (Demo)', pg_temp.k('vendor:powergen'), 5310000, 'approved', 'For GEN-01 250-hour service.', 'PO-2026-0103', pg_temp.k('cc:tower'), now() - interval '5 days', now() - interval '4 days');

insert into fp_procurement_lines (id, org_id, procurement_id, part_id, description, quantity, unit_cost) values
  (pg_temp.k('pol:f1'), pg_temp.k('org'), pg_temp.k('po:filters'), pg_temp.k('part:filter-g4'), 'AHU pre-filter G4', 24, 185000),
  (pg_temp.k('pol:f2'), pg_temp.k('org'), pg_temp.k('po:filters'), pg_temp.k('part:filter-f7'), 'AHU bag filter F7', 16, 640000),
  (pg_temp.k('pol:f3'), pg_temp.k('org'), pg_temp.k('po:filters'), pg_temp.k('part:oilfilter-ch'), 'Chiller oil filter', 4, 1450000),
  (pg_temp.k('pol:c1'), pg_temp.k('org'), pg_temp.k('po:caps'), pg_temp.k('part:capacitor'), 'Run capacitor 45/5 µF', 10, 95000),
  (pg_temp.k('pol:c2'), pg_temp.k('org'), pg_temp.k('po:caps'), pg_temp.k('part:led18'), 'LED downlight 18 W', 22, 208181),
  (pg_temp.k('pol:m1'), pg_temp.k('org'), pg_temp.k('po:ctmotor'), null, '11 kW fan motor supply and installation', 1, 48500000),
  (pg_temp.k('pol:g1'), pg_temp.k('org'), pg_temp.k('po:genoil'), pg_temp.k('part:gen-oilfilter'), 'Generator oil filter', 3, 690000),
  (pg_temp.k('pol:g2'), pg_temp.k('org'), pg_temp.k('po:genoil'), pg_temp.k('part:engine-oil'), 'Engine oil 15W-40', 33, 98000);

insert into fp_procurement_receipts (id, org_id, procurement_id, received_by, received_at, note) values
  (pg_temp.k('rcpt:filters'), pg_temp.k('org'), pg_temp.k('po:filters'), pg_temp.k('user:grace'), now() - interval '27 days', 'All items received in good condition.');
insert into fp_procurement_receipt_lines (org_id, receipt_id, procurement_line_id, quantity_received) values
  (pg_temp.k('org'), pg_temp.k('rcpt:filters'), pg_temp.k('pol:f1'), 24),
  (pg_temp.k('org'), pg_temp.k('rcpt:filters'), pg_temp.k('pol:f2'), 16),
  (pg_temp.k('org'), pg_temp.k('rcpt:filters'), pg_temp.k('pol:f3'), 4);
insert into fp_inventory_transactions (org_id, part_id, type, quantity_delta, ref_table, ref_id, note, created_by, created_at, pre_applied) values
  (pg_temp.k('org'), pg_temp.k('part:filter-g4'), 'receipt', 24, 'fp_procurement_receipts', pg_temp.k('rcpt:filters'), 'PO-2026-0101', pg_temp.k('user:grace'), now() - interval '27 days', true),
  (pg_temp.k('org'), pg_temp.k('part:filter-f7'), 'receipt', 16, 'fp_procurement_receipts', pg_temp.k('rcpt:filters'), 'PO-2026-0101', pg_temp.k('user:grace'), now() - interval '27 days', true),
  (pg_temp.k('org'), pg_temp.k('part:oilfilter-ch'), 'receipt', 4, 'fp_procurement_receipts', pg_temp.k('rcpt:filters'), 'PO-2026-0101', pg_temp.k('user:grace'), now() - interval '27 days', true),
  (pg_temp.k('org'), pg_temp.k('part:filter-f7'), 'issue', -6, null, null, 'Used on AHU-05 filter change (Q2)', pg_temp.k('user:grace'), now() - interval '81 days', true),
  (pg_temp.k('org'), pg_temp.k('part:engine-oil'), 'adjustment', -4, null, null, 'Stock count correction', pg_temp.k('user:priya'), now() - interval '12 days', true),
  (pg_temp.k('org'), pg_temp.k('part:fuse63'), 'cycle_count', 0, null, null, 'Quarterly count – matches', pg_temp.k('user:grace'), now() - interval '10 days', true);

insert into fp_po_counters (org_id, next_seq) values (pg_temp.k('org'), 104) on conflict (org_id) do update set next_seq = 104;

insert into fp_vendor_invoices (id, org_id, procurement_id, vendor_id, invoice_number, amount, invoice_date, status, notes, created_at) values
  (pg_temp.k('vinv:filters'), pg_temp.k('org'), pg_temp.k('po:filters'), pg_temp.k('vendor:coolair'), 'CA-INV-88213', 22080000, current_date - 26, 'paid', 'Matched to PO-2026-0101 and receipt.', now() - interval '26 days'),
  (pg_temp.k('vinv:lift'),    pg_temp.k('org'), null, pg_temp.k('vendor:liftcare'), 'LC-2026-0419', 8500000, current_date - 1, 'pending', 'Emergency call-out – lift L2.', now() - interval '1 day'),
  (pg_temp.k('vinv:clean'),   pg_temp.k('org'), null, pg_temp.k('vendor:cleanpro'), 'CP-0927', 64000000, current_date - 6, 'disputed', 'Hours billed exceed the contract for Riverside – query raised.', now() - interval '6 days');

insert into fp_finance_payments (org_id, description, amount, method, reference, status, procurement_id, vendor_id, invoice_id, created_at) values
  (pg_temp.k('org'), 'CoolAir – AHU filters & consumables', 22080000, 'Bank transfer', 'TT-2026-0931', 'completed', pg_temp.k('po:filters'), pg_temp.k('vendor:coolair'), pg_temp.k('vinv:filters'), now() - interval '20 days'),
  (pg_temp.k('org'), 'LiftCare – L2 emergency call-out', 8500000, 'Bank transfer', null, 'pending', null, pg_temp.k('vendor:liftcare'), pg_temp.k('vinv:lift'), now() - interval '1 day');

insert into fp_finance_budgets (org_id, name, amount, period, notes, cost_center_id) values
  (pg_temp.k('org'), 'Tower A – planned maintenance', 650000000, to_char(now(), 'YYYY') || ' Q' || extract(quarter from now()), 'Chillers, lifts, fire systems.', pg_temp.k('cc:tower')),
  (pg_temp.k('org'), 'Riverside – repairs', 180000000, to_char(now(), 'YYYY') || ' Q' || extract(quarter from now()), null, pg_temp.k('cc:riverside')),
  (pg_temp.k('org'), 'Lakeside – repairs & amenities', 220000000, to_char(now(), 'YYYY') || ' Q' || extract(quarter from now()), 'Pool, gym, lifts.', pg_temp.k('cc:lakeside'));

insert into fp_finance_expenditures (org_id, description, category, category_id, amount, vendor, vendor_id, work_order_id, asset_id, cost_center_id, created_at) values
  (pg_temp.k('org'), 'Lift L2 emergency call-out', 'Contractors', pg_temp.k('ecat:contr'), 8500000, 'LiftCare Vietnam (Demo)', pg_temp.k('vendor:liftcare'), pg_temp.k('wo:liftl2-stuck'), pg_temp.k('asset:liftl2'), pg_temp.k('cc:tower'), now() - interval '22 hours'),
  (pg_temp.k('org'), 'AHU filters and chiller consumables', 'Spare parts', pg_temp.k('ecat:parts'), 22080000, 'CoolAir Services (Demo)', pg_temp.k('vendor:coolair'), null, null, pg_temp.k('cc:tower'), now() - interval '26 days'),
  (pg_temp.k('org'), 'UPS-01 replacement batteries', 'Spare parts', pg_temp.k('ecat:parts'), 16800000, 'BrightSpark Supplies (Demo)', pg_temp.k('vendor:bright'), pg_temp.k('wo:hist-7'), pg_temp.k('asset:ups01'), pg_temp.k('cc:riverside'), now() - interval '17 days'),
  (pg_temp.k('org'), 'Generator GEN-R1 starter motor', 'Repairs', pg_temp.k('ecat:repairs'), 12400000, 'PowerGen Solutions (Demo)', pg_temp.k('vendor:powergen'), pg_temp.k('wo:hist-8'), pg_temp.k('asset:genr1'), pg_temp.k('cc:lakeside'), now() - interval '40 days'),
  (pg_temp.k('org'), 'Cleaning services – September', 'Contractors', pg_temp.k('ecat:contr'), 58000000, 'CleanPro Facility Services (Demo)', pg_temp.k('vendor:cleanpro'), null, null, pg_temp.k('cc:tower'), now() - interval '6 days'),
  (pg_temp.k('org'), 'Electricity – Tower A (August)', 'Utilities', pg_temp.k('ecat:util'), 412000000, null, null, null, null, pg_temp.k('cc:tower'), now() - interval '26 days');

insert into fp_finance_rates (org_id, service, unit, rate, currency) values
  (pg_temp.k('org'), 'Technician labour (normal hours)', 'hour', 180000, 'VND'),
  (pg_temp.k('org'), 'After-hours call-out', 'call-out', 750000, 'VND'),
  (pg_temp.k('org'), 'Aircon cleaning (split unit)', 'unit', 350000, 'VND'),
  (pg_temp.k('org'), 'Meeting room hire (Level 12)', 'hour', 400000, 'VND');

insert into fp_finance_customers (org_id, name, company, email, phone, notes) values
  (pg_temp.k('org'), 'Olivia Chen', 'Marine Co Ltd (Demo)', 'olivia.chen@harbourview-demo.test', null, 'Tenant, Suite 1201 – billable after-hours HVAC.'),
  (pg_temp.k('org'), 'Blue Lotus Café (Demo)', 'Blue Lotus Café', 'manager@bluelotus-demo.test', null, 'Retail tenant, ground floor.');

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
insert into fp_documents (id, org_id, title, category, owner, summary, link, visibility, created_at) values
  (pg_temp.k('doc:ch01'),  pg_temp.k('org'), 'Chiller CH-01/CH-02 operation & maintenance manual', 'Manual', 'Priya Raman', 'Manufacturer O&M manual: start-up, alarms, maintenance intervals.', 'https://example.com/demo/chiller-om-manual.pdf', 'staff', now() - interval '180 days'),
  (pg_temp.k('doc:gen'),   pg_temp.k('org'), 'GEN-01 service report (last 250-hour service)', 'Report', 'Tomás Silva', 'Oil, filters and load-bank test results.', 'https://example.com/demo/gen01-service-report.pdf', 'staff', now() - interval '150 days'),
  (pg_temp.k('doc:evac'),  pg_temp.k('org'), 'Fire evacuation plan – Harbourview Tower', 'Safety', 'Daniel Okafor', 'Assembly points, wardens and evacuation routes per floor.', 'https://example.com/demo/evacuation-plan.pdf', 'everyone', now() - interval '160 days'),
  (pg_temp.k('doc:fitout'),pg_temp.k('org'), 'Tenant fit-out guidelines', 'Policy', 'Alex Morgan', 'Rules and approvals for tenant renovations.', 'https://example.com/demo/fit-out-guidelines.pdf', 'everyone', now() - interval '120 days'),
  (pg_temp.k('doc:lift'),  pg_temp.k('org'), 'Lift L1/L2 inspection certificates', 'Certificate', 'Priya Raman', 'Annual statutory inspection certificates.', 'https://example.com/demo/lift-certificates.pdf', 'staff', now() - interval '90 days'),
  (pg_temp.k('doc:sop'),   pg_temp.k('org'), 'SOP – Chiller changeover CH-01 ↔ CH-02', 'SOP', 'Minh Tran', 'Step-by-step lead/lag changeover procedure.', 'https://example.com/demo/chiller-changeover-sop.pdf', 'staff', now() - interval '60 days');

insert into fp_document_links (org_id, document_id, entity_type, entity_id) values
  (pg_temp.k('org'), pg_temp.k('doc:ch01'), 'asset', pg_temp.k('asset:ch01')),
  (pg_temp.k('org'), pg_temp.k('doc:ch01'), 'asset', pg_temp.k('asset:ch02')),
  (pg_temp.k('org'), pg_temp.k('doc:sop'),  'asset', pg_temp.k('asset:ch01')),
  (pg_temp.k('org'), pg_temp.k('doc:gen'),  'asset', pg_temp.k('asset:gen01')),
  (pg_temp.k('org'), pg_temp.k('doc:lift'), 'asset', pg_temp.k('asset:liftl1')),
  (pg_temp.k('org'), pg_temp.k('doc:lift'), 'asset', pg_temp.k('asset:liftl2'));

-- ---------------------------------------------------------------------------
-- Spaces: desks and bookable facilities
-- ---------------------------------------------------------------------------
insert into fp_desks (id, org_id, name_i18n, zone_id)
select pg_temp.k('desk:' || g), pg_temp.k('org'), pg_temp.t('Desk 2B-' || lpad(g::text, 2, '0')), pg_temp.k('loc:bb-2b') from generate_series(1, 12) g;
insert into fp_desk_bookings (org_id, desk_id, booked_by, booker_name, booked_for)
select pg_temp.k('org'), pg_temp.k('desk:' || g), null, (array['Demo visitor A','Demo visitor B','Priya Raman','Daniel Okafor','Demo visitor C'])[1 + g % 5], current_date + (g % 3)
from generate_series(1, 9) g;

insert into fp_facilities (id, org_id, name_i18n, location_id, capacity) values
  (pg_temp.k('fac:12a'),   pg_temp.k('org'), pg_temp.t('Meeting room 12A', 'Phòng họp 12A'), pg_temp.k('loc:ta-12a'), 10),
  (pg_temp.k('fac:train'), pg_temp.k('org'), pg_temp.t('Riverside training room', 'Phòng đào tạo Riverside'), pg_temp.k('loc:bb-training'), 24),
  (pg_temp.k('fac:bbq'),   pg_temp.k('org'), pg_temp.t('Lakeside BBQ terrace', 'Khu BBQ Lakeside'), pg_temp.k('loc:rt-bbq'), 16);
insert into fp_facility_bookings (org_id, facility_id, booked_by, booker_name, booked_for) values
  (pg_temp.k('org'), pg_temp.k('fac:12a'),   pg_temp.k('user:olivia'), 'Olivia Chen (Marine Co)', current_date + 1),
  (pg_temp.k('org'), pg_temp.k('fac:12a'),   null, 'Demo tenant meeting', current_date + 3),
  (pg_temp.k('org'), pg_temp.k('fac:train'), pg_temp.k('user:priya'), 'Priya Raman – safety training', current_date + 2),
  (pg_temp.k('org'), pg_temp.k('fac:bbq'),   pg_temp.k('user:ethan'), 'Ethan Brooks (Apt 10-05)', current_date + 5);

-- ---------------------------------------------------------------------------
-- Permits, attendance, surveys, broadcasts
-- ---------------------------------------------------------------------------
insert into fp_permits (org_id, title, asset, requester, approver, due_date, status, notes, created_at) values
  (pg_temp.k('org'), 'Hot work – welding cooling tower CT-01 frame', 'Cooling tower CT-01', 'CoolAir Services (Demo)', 'Priya Raman', current_date + 4, 'submitted', 'Fire watch required for 60 minutes after work.', now() - interval '1 day'),
  (pg_temp.k('org'), 'Confined space – domestic water tank cleaning', 'Domestic water pump WP-01', 'Kenji Watanabe', 'Priya Raman', current_date - 3, 'approved', 'Gas test before entry; standby person at hatch.', now() - interval '8 days'),
  (pg_temp.k('org'), 'Working at height – façade lighting repair', 'Lobby lighting circuit', 'Sofia Lopez', 'Daniel Okafor', current_date + 10, 'draft', null, now() - interval '3 hours'),
  (pg_temp.k('org'), 'Electrical isolation – MSB-01 thermal scan', 'Main switchboard MSB-01', 'Sofia Lopez', 'Priya Raman', current_date - 20, 'rejected', 'Reschedule outside business hours.', now() - interval '25 days');

insert into fp_attendance (org_id, technician, technician_id, site, location_id, action, note, checked_at)
select pg_temp.k('org'), p.name, pg_temp.k('user:' || p.key),
       (array['Harbourview Tower','Riverside Business Park','Lakeside Residences'])[1 + (d + length(p.key)) % 3],
       pg_temp.k('loc:' || (array['ta-g','bb-g','rt-g'])[1 + (d + length(p.key)) % 3]),
       a.action, null,
       date_trunc('day', now()) - make_interval(days => d) + case a.action when 'Checked in' then interval '7 hours' + make_interval(mins => length(p.key) * 3)
                                                                           else interval '16 hours' + make_interval(mins => length(p.key) * 5) end
from demo_people p
cross join generate_series(0, 6) d
cross join (values ('Checked in'), ('Checked out')) a(action)
where p.role = 'technician' and not (d = 0 and a.action = 'Checked out') and extract(isodow from now() - make_interval(days => d)) < 7;

insert into fp_surveys (org_id, name_i18n, questions, is_active) values
  (pg_temp.k('org'), pg_temp.t('Service satisfaction (after each job)', 'Mức độ hài lòng sau mỗi công việc'),
   '["How satisfied are you with how quickly we responded?", "Was the problem fixed properly the first time?", "How polite and tidy was the technician?", "Anything we could do better?"]', true),
  (pg_temp.k('org'), pg_temp.t('Annual tenant survey', 'Khảo sát khách thuê hằng năm'),
   '["How would you rate the building overall?", "How comfortable is the temperature in your office?", "How clean are the common areas?"]', false);

insert into fp_broadcasts (org_id, title, audience, message, is_published, created_at) values
  (pg_temp.k('org'), 'Planned water shutdown – Tower A, Saturday 08:00–12:00', 'all', 'Domestic water will be off while the water tank is cleaned. Please store water in advance. (Demo notice)', true, now() - interval '2 days'),
  (pg_temp.k('org'), 'Lift L2 back in service', 'all', 'Lift L2 has been repaired and tested and is back in service. Thank you for your patience. (Demo notice)', true, now() - interval '20 hours'),
  (pg_temp.k('org'), 'Fire drill – Lakeside Residences', 'all', 'Draft: annual fire drill next month.', false, now() - interval '1 hour');

-- ---------------------------------------------------------------------------
-- Workflows (automation)
-- ---------------------------------------------------------------------------
insert into fp_workflows (org_id, name, description, trigger_type, conditions, actions, is_active, run_count, last_run_at, created_by) values
  (pg_temp.k('org'), 'Critical work orders go to the on-call technician', 'Any new critical work order is assigned to Minh (on call this week).', 'workorder.created',
   '{"logic":"and","rules":[{"field":"priority","operator":"equals","value":"critical"}]}',
   jsonb_build_array(jsonb_build_object('type', 'assign', 'target', pg_temp.k('user:minh')::text, 'value', '')), true, 9, now() - interval '3 hours', pg_temp.k('user:priya')),
  (pg_temp.k('org'), 'Route: HVAC faults → Minh (HVAC)', 'New work orders of this fault type are assigned automatically.', 'workorder.created',
   jsonb_build_object('logic', 'and', 'rules', jsonb_build_array(jsonb_build_object('field', 'type', 'operator', 'equals', 'value', pg_temp.k('fault:hvac')::text))),
   jsonb_build_array(jsonb_build_object('type', 'assign', 'target', pg_temp.k('user:minh')::text, 'value', '')), true, 12, now() - interval '5 hours', pg_temp.k('user:priya')),
  (pg_temp.k('org'), 'Route: Water leaks → Kenji (Plumbing)', 'New work orders of this fault type are assigned automatically.', 'workorder.created',
   jsonb_build_object('logic', 'and', 'rules', jsonb_build_array(jsonb_build_object('field', 'type', 'operator', 'equals', 'value', pg_temp.k('fault:leak')::text))),
   jsonb_build_array(jsonb_build_object('type', 'assign', 'target', pg_temp.k('user:kenji')::text, 'value', '')), true, 12, now() - interval '5 hours', pg_temp.k('user:priya')),
  (pg_temp.k('org'), 'Route: Blocked drains → Kenji (Plumbing)', 'New work orders of this fault type are assigned automatically.', 'workorder.created',
   jsonb_build_object('logic', 'and', 'rules', jsonb_build_array(jsonb_build_object('field', 'type', 'operator', 'equals', 'value', pg_temp.k('fault:plumb')::text))),
   jsonb_build_array(jsonb_build_object('type', 'assign', 'target', pg_temp.k('user:kenji')::text, 'value', '')), true, 12, now() - interval '5 hours', pg_temp.k('user:priya')),
  (pg_temp.k('org'), 'Route: Electrical faults → Sofia (Electrical)', 'New work orders of this fault type are assigned automatically.', 'workorder.created',
   jsonb_build_object('logic', 'and', 'rules', jsonb_build_array(jsonb_build_object('field', 'type', 'operator', 'equals', 'value', pg_temp.k('fault:elec')::text))),
   jsonb_build_array(jsonb_build_object('type', 'assign', 'target', pg_temp.k('user:sofia')::text, 'value', '')), true, 12, now() - interval '5 hours', pg_temp.k('user:priya')),
  (pg_temp.k('org'), 'Route: Lighting faults → Sofia (Electrical)', 'New work orders of this fault type are assigned automatically.', 'workorder.created',
   jsonb_build_object('logic', 'and', 'rules', jsonb_build_array(jsonb_build_object('field', 'type', 'operator', 'equals', 'value', pg_temp.k('fault:light')::text))),
   jsonb_build_array(jsonb_build_object('type', 'assign', 'target', pg_temp.k('user:sofia')::text, 'value', '')), true, 12, now() - interval '5 hours', pg_temp.k('user:priya')),
  (pg_temp.k('org'), 'Remind the manager about requests pending over 1 hour', 'Email the maintenance manager when a request has been waiting 60 minutes.', 'service_request',
   '{"logic":"and","rules":[{"field":"has_been_pending","operator":"pending_for","value":"60"}]}',
   '[{"type":"send_email","target":"priya.raman@harbourview-demo.test","value":"A request is still waiting to be triaged."}]', true, 17, now() - interval '1 day', pg_temp.k('user:priya')),
  (pg_temp.k('org'), 'Tell stores when a part runs low', 'Email the storekeeper so parts are reordered in time.', 'parts_quantity',
   '{"logic":"and","rules":[{"field":"quantity","operator":"falls_below","value":"5"}]}',
   '[{"type":"send_email","target":"grace.mensah@harbourview-demo.test","value":"Part below reorder level"}]', true, 6, now() - interval '2 days', pg_temp.k('user:alex'));

-- ---------------------------------------------------------------------------
-- Inbox (Zalo / email conversations)
-- ---------------------------------------------------------------------------
insert into fp_conversations (id, org_id, channel, contact_name, contact_handle, status, last_message_at, created_at) values
  (pg_temp.k('conv:ethan'),  pg_temp.k('org'), 'zalo',  'Ethan Brooks (Apt 10-05)', 'zalo-demo-10051', 'open',   now() - interval '18 hours', now() - interval '20 hours'),
  (pg_temp.k('conv:marine'), pg_temp.k('org'), 'email', 'Olivia Chen (Marine Co)',  'olivia.chen@harbourview-demo.test', 'open', now() - interval '45 hours', now() - interval '50 hours'),
  (pg_temp.k('conv:cafe'),   pg_temp.k('org'), 'web',   'Blue Lotus Café (Demo)',   'manager@bluelotus-demo.test', 'closed', now() - interval '6 days', now() - interval '7 days');
insert into fp_messages (org_id, conversation_id, direction, body, sender, created_at, sentiment, sentiment_score, delivery_status) values
  (pg_temp.k('org'), pg_temp.k('conv:ethan'),  'in',  'Hi, water is dripping from my bathroom ceiling again. Third time this month!', null, now() - interval '20 hours', 'low', -0.7, null),
  (pg_temp.k('org'), pg_temp.k('conv:ethan'),  'out', 'Sorry about this, Ethan. Kenji from our plumbing team is on the way and will check the apartment above.', pg_temp.k('user:daniel'), now() - interval '19 hours', null, null, 'delivered'),
  (pg_temp.k('org'), pg_temp.k('conv:ethan'),  'in',  'Thanks, he just arrived.', null, now() - interval '18 hours', 'neutral', 0.1, null),
  (pg_temp.k('org'), pg_temp.k('conv:marine'), 'in',  'Our office AC is not cooling at all, it is very hot in here.', null, now() - interval '50 hours', 'low', -0.5, null),
  (pg_temp.k('org'), pg_temp.k('conv:marine'), 'out', 'We have found the fault and ordered the part. A portable cooler will be delivered this afternoon.', pg_temp.k('user:priya'), now() - interval '45 hours', null, null, 'sent'),
  (pg_temp.k('org'), pg_temp.k('conv:cafe'),   'in',  'Grease trap was cleaned perfectly, thank you!', null, now() - interval '6 days', 'high', 0.8, null);

-- ---------------------------------------------------------------------------
-- IoT: gateway, devices, data points, rules, a week of readings, alerts
-- ---------------------------------------------------------------------------
insert into fp_iot_gateways (id, org_id, site_id, location_id, name, gateway_key, protocols, serial, firmware_version, last_seen_at, active) values
  (pg_temp.k('gw:tower'), pg_temp.k('org'), pg_temp.k('site:tower'), pg_temp.k('loc:ta-elec'), 'Tower A edge gateway', 'demo-gw-' || substr(md5(random()::text), 1, 20),
   array['mqtt','modbus_tcp'], 'GW-DEMO-0001', '2.4.1', now() - interval '30 seconds', true);

create temp table demo_devices (key text, name text, asset text, loc text, site text, protocol text, kind text, offline_min int, last_seen interval) on commit preserve rows;
insert into demo_devices values
  ('ch01mon',  'CH-01 chiller monitor',        'ch01',   'ta-plant5a', 'tower',     'modbus_tcp', 'sensor', 15, interval '40 seconds'),
  ('energy',   'Main energy meter (MSB-01)',   'msb01',  'ta-elec',    'tower',     'modbus_tcp', 'meter',  15, interval '1 minute'),
  ('leakb1',   'Car park B1 leak sensor',      'wp01',   'ta-carpark', 'tower',     'lorawan',    'sensor', 120, interval '6 minutes'),
  ('aq12',     'Level 12 air-quality sensor',  null,     'ta-1201',    'tower',     'mqtt',       'sensor', 30, interval '2 minutes'),
  ('server',   'Server room environment',      'crac01', 'bb-server',  'riverside', 'mqtt',       'sensor', 30, interval '1 minute'),
  ('genmon',   'GEN-01 generator monitor',     'gen01',  'ta-elec',    'tower',     'modbus_tcp', 'sensor', 60, interval '3 minutes'),
  ('liftmon',  'Lift L1 condition monitor',    'liftl1', 'ta-liftlobby','tower',    'mqtt',       'sensor', 60, interval '2 minutes'),
  ('poolmeter','Pool pump energy meter',       'poolpump','rt-plant',  'lakeside',  'mqtt',       'meter',  60, interval '4 minutes'),
  ('weather',  'Roof weather station',         null,     'ta-roof',    'tower',     'lorawan',    'sensor', 120, interval '2 days 5 hours');

insert into fp_devices (id, org_id, asset_id, name, kind, device_key, last_seen_at, active, offline_after_minutes, location_id, site_id, protocol, external_id,
                        gateway_id, firmware_version, offline_alerted_at, created_at)
select pg_temp.k('dev:' || key), pg_temp.k('org'), case when asset is null then null else pg_temp.k('asset:' || asset) end, name, kind,
       'demo-dev-' || substr(md5(key || random()::text), 1, 24), now() - last_seen, true, offline_min, pg_temp.k('loc:' || loc), pg_temp.k('site:' || site),
       protocol, upper(key) || '-DEMO',
       case when protocol = 'modbus_tcp' then pg_temp.k('gw:tower') end,
       '1.' || (length(key) % 5) || '.0',
       case when key = 'weather' then now() - interval '2 days 3 hours' end,
       now() - interval '150 days'
from demo_devices;

-- Metrics per device: (device, metric, name, unit, base, amplitude, noise)
create temp table demo_metrics (dev text, metric text, name text, unit text, base numeric, amp numeric, noise numeric) on commit preserve rows;
insert into demo_metrics values
  ('ch01mon', 'temperature', 'Chilled water supply', '°C', 6.8, 0.4, 0.15),
  ('ch01mon', 'pressure',    'Condenser pressure',   'bar', 9.6, 0.6, 0.15),
  ('ch01mon', 'power',       'Compressor power',     'kW', 160, 45, 6),
  ('energy',  'power',       'Building load',        'kW', 470, 150, 12),
  ('energy',  'voltage',     'Voltage L1-N',         'V', 229, 2, 0.8),
  ('leakb1',  'leak',        'Water detected',       null, 0, 0, 0),
  ('leakb1',  'battery',     'Battery',              '%', 87, 0, 0.2),
  ('aq12',    'co2',         'CO₂',                  'ppm', 650, 280, 25),
  ('aq12',    'temperature', 'Temperature',          '°C', 24.2, 1.2, 0.2),
  ('aq12',    'humidity',    'Humidity',             '%', 58, 6, 1),
  ('server',  'temperature', 'Room temperature',     '°C', 22.5, 0.6, 0.2),
  ('server',  'humidity',    'Room humidity',        '%', 46, 3, 0.8),
  ('genmon',  'voltage',     'Battery voltage',      'V', 25.4, 0.3, 0.05),
  ('genmon',  'runtime',     'Run hours',            'h', 4271, 0, 0),
  ('liftmon', 'vibration',   'Car vibration',        'mm/s', 2.1, 0.6, 0.2),
  ('liftmon', 'people_count','Trips per hour',       null, 35, 30, 4),
  ('poolmeter','power',      'Pump power',           'kW', 3.1, 0.8, 0.1),
  ('weather', 'temperature', 'Outdoor temperature',  '°C', 30.5, 3.5, 0.4),
  ('weather', 'humidity',    'Outdoor humidity',     '%', 72, 12, 2);

insert into fp_device_data_points (org_id, device_id, key, metric, name, unit, source, discovered, active)
select pg_temp.k('org'), pg_temp.k('dev:' || dev), metric, metric, name, unit, '{}'::jsonb, false, true from demo_metrics;

-- (due_h: hours ago the job was due; negative = due in the future)
-- A reading every 30 minutes for 7 days, following a daily pattern (busy
-- during office hours), with two stories: CH-01 condenser pressure climbing
-- over the last few hours, and the server room overheating last night.
insert into fp_telemetry (org_id, device_id, metric, value, unit, ts)
select pg_temp.k('org'), pg_temp.k('dev:' || m.dev), m.metric,
       round((case
         when m.metric = 'leak' then (case when s.ts > now() - interval '5 hours' then 1 else 0 end)
         when m.metric = 'runtime' then m.base - extract(epoch from (now() - s.ts)) / 3600 * 0.05
         when m.dev = 'ch01mon' and m.metric = 'pressure' and s.ts > now() - interval '6 hours'
           then m.base + 0.3 + (6 - extract(epoch from (now() - s.ts)) / 3600) * 0.33
         when m.dev = 'server' and m.metric = 'temperature' and s.ts between now() - interval '16 hours' and now() - interval '9 hours'
           then 26.2 + random() * 1.1
         else m.base + m.amp * greatest(0, sin(pi() * ((extract(hour from s.ts at time zone 'Asia/Ho_Chi_Minh') - 7) / 12.0)))
              + (random() - 0.5) * 2 * m.noise
       end)::numeric, 2),
       m.unit, s.ts
from demo_metrics m
cross join lateral (
  select generate_series(now() - interval '7 days', now() - interval '5 minutes', interval '30 minutes') as ts
) s
where m.dev <> 'weather' or s.ts < now() - interval '2 days 5 hours';

insert into fp_device_latest (device_id, metric, org_id, value, unit, ts, quality)
select distinct on (t.device_id, t.metric) t.device_id, t.metric, t.org_id, t.value, t.unit, t.ts, 'good'
from fp_telemetry t where t.org_id = pg_temp.k('org')
order by t.device_id, t.metric, t.ts desc;

insert into fp_device_rules (id, org_id, device_id, name, metric, op, threshold, action, severity, alert_severity, message, cooldown_minutes, active,
                             conditions, notify_roles, escalate_after_minutes, auto_resolve, last_fired_at) values
  (pg_temp.k('rule:ch01'),  pg_temp.k('org'), pg_temp.k('dev:ch01mon'), 'Condenser pressure high', 'pressure', 'gt', 11, 'both', 'critical', 'critical',
   'CH-01 condenser pressure above 11 bar', 60, true, '[]', array['manager','technician'], 30, false, now() - interval '3 hours'),
  (pg_temp.k('rule:leak'),  pg_temp.k('org'), pg_temp.k('dev:leakb1'), 'Water detected in car park', 'leak', 'eq', 1, 'alert', 'critical', 'critical',
   'Leak sensor B1 detected water', 30, true, '[]', array['manager','technician'], 15, true, now() - interval '5 hours'),
  (pg_temp.k('rule:server'),pg_temp.k('org'), pg_temp.k('dev:server'), 'Server room too warm', 'temperature', 'gt', 26, 'alert', 'warning', 'warning',
   'Server room above 26 °C', 60, true, '[]', array['manager','technician'], 60, true, now() - interval '15 hours'),
  (pg_temp.k('rule:co2'),   pg_temp.k('org'), pg_temp.k('dev:aq12'), 'CO₂ high on Level 12', 'co2', 'gt', 1000, 'notify', 'warning', 'warning',
   'Increase fresh air to Level 12', 120, true, '[]', array['manager'], null, true, now() - interval '3 days');

insert into fp_device_alerts (org_id, device_id, rule_id, severity, status, title, message, metric, value, occurrences, opened_at, last_at,
                              acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution, request_id) values
  (pg_temp.k('org'), pg_temp.k('dev:ch01mon'), pg_temp.k('rule:ch01'), 'critical', 'acknowledged', 'Condenser pressure high', 'CH-01 condenser pressure above 11 bar', 'pressure', 11.6, 5,
   now() - interval '3 hours', now() - interval '10 minutes', pg_temp.k('user:minh'), now() - interval '2 hours 40 minutes', null, null, null, null),
  (pg_temp.k('org'), pg_temp.k('dev:leakb1'), pg_temp.k('rule:leak'), 'critical', 'open', 'Water detected in car park', 'Leak sensor B1 detected water', 'leak', 1, 9,
   now() - interval '5 hours', now() - interval '6 minutes', null, null, null, null, null, pg_temp.k('req:leak-b1')),
  (pg_temp.k('org'), pg_temp.k('dev:server'), pg_temp.k('rule:server'), 'warning', 'resolved', 'Server room too warm', 'Server room above 26 °C', 'temperature', 27.1, 14,
   now() - interval '16 hours', now() - interval '9 hours', pg_temp.k('user:sofia'), now() - interval '14 hours', pg_temp.k('user:sofia'), now() - interval '8 hours', 'CRAC reset; refrigerant check booked (see work order).', null),
  (pg_temp.k('org'), pg_temp.k('dev:aq12'), pg_temp.k('rule:co2'), 'warning', 'resolved', 'CO₂ high on Level 12', 'Increase fresh air to Level 12', 'co2', 1140, 3,
   now() - interval '3 days', now() - interval '3 days' + interval '40 minutes', null, null, pg_temp.k('user:priya'), now() - interval '3 days' + interval '2 hours', 'Fresh-air damper opened to 40%.', null),
  (pg_temp.k('org'), pg_temp.k('dev:weather'), null, 'warning', 'open', 'Device offline', 'Roof weather station has not reported for over 2 hours.', null, null, 1,
   now() - interval '2 days 3 hours', now() - interval '2 days 3 hours', null, null, null, null, null, null);

-- ---------------------------------------------------------------------------
-- Notifications (in-app bell)
-- ---------------------------------------------------------------------------
insert into fp_notifications (org_id, user_id, kind, title, body, link, read_at, created_at)
select pg_temp.k('org'), pg_temp.k('user:' || u), kind, title, body, link, case when rd then now() - interval '1 hour' end, now() - make_interval(mins => mins)
from (values
  ('alex',  'iot_alert',   'Critical IoT alert: Water detected in car park', 'Car park B1 leak sensor', '/devices', false, 300),
  ('alex',  'approval',    'Approval needed: Replace cooling tower CT-01 fan motor', 'Quote 48,500,000 VND', '/approvals', false, 2280),
  ('alex',  'wo_resolved', 'Work order resolved: Lift L2 stopped between floors 7 and 8', 'Please verify and close.', '/work-orders', false, 1320),
  ('alex',  'contract',    'Contract expiring in 20 days', 'Lift maintenance contract – Tower A & Residence Tower', '/vendors', true, 4000),
  ('priya', 'iot_alert',   'Critical IoT alert: CH-01 condenser pressure high', 'CH-01 chiller monitor', '/devices', false, 180),
  ('priya', 'iot_alert',   'Critical IoT alert: Water detected in car park', 'Car park B1 leak sensor', '/devices', false, 300),
  ('priya', 'request_new', 'New request: Office 501 too cold near windows', 'Harbourview Tower · Level 5', '/requests', false, 40),
  ('priya', 'wo_resolved', 'Work order resolved: Lift L2 stopped between floors 7 and 8', 'Please verify and close.', '/work-orders', true, 1320),
  ('priya', 'low_stock',   'Low stock: Run capacitor 45/5 µF', '0 in stock (reorder at 4)', '/parts', true, 3000),
  ('daniel','request_new', 'New request: Lobby entrance door closes too fast', 'Lakeside Residences', '/requests', false, 120),
  ('minh',  'wo_assigned', 'Assigned to you: Chiller CH-01 high condenser pressure', 'Critical · due in 1 hour', '/my-work', false, 175),
  ('minh',  'pm_due',      'Preventive maintenance due: Chiller CH-02 monthly inspection', 'Due tomorrow', '/my-work', true, 1440),
  ('kenji', 'wo_assigned', 'Assigned to you: Water leak near car park bay 14', 'High · due today', '/my-work', false, 290),
  ('kenji', 'wo_assigned', 'Assigned to you: Water dripping from bathroom ceiling – Apt 10-05', 'High', '/my-work', true, 1180),
  ('tomas', 'pm_due',      'Overdue: GEN-01 weekly test run', 'Was due yesterday', '/my-work', false, 360),
  ('sofia', 'wo_assigned', 'Assigned to you: Server room CRAC high-temperature alarm', 'High', '/my-work', true, 830),
  ('olivia','wo_status',   'Your request is on hold: Suite 1201 air-conditioning not cooling', 'Waiting for a replacement part.', '/requests', false, 2700),
  ('ethan', 'wo_status',   'Your request is in progress: Water dripping from bathroom ceiling', 'Kenji is on site.', '/requests', false, 180)
) as n(u, kind, title, body, link, rd, mins);

-- Admin audit-style activity for the dashboard feed comes from the rows above.

-- Invitations and join links
insert into fp_invites (org_id, email, role, invited_by, expires_at, created_at) values
  (pg_temp.k('org'), 'new.technician@harbourview-demo.test', 'technician', pg_temp.k('user:alex'), now() + interval '5 days', now() - interval '2 days');
insert into fp_join_links (org_id, role, label, created_by, created_at) values
  (pg_temp.k('org'), 'occupant', 'Lakeside lobby poster', pg_temp.k('user:alex'), now() - interval '30 days');

-- Activity log (Reports → Activity log): what the triggers would have recorded.
insert into fp_audit_log (org_id, actor, entity_type, entity_id, action, at)
select org_id, created_by, 'fp_requests', id, 'INSERT', created_at from fp_requests
 where org_id = pg_temp.k('org') and created_at > now() - interval '30 days'
union all
select org_id, pg_temp.k('user:priya'), 'fp_work_orders', id, 'INSERT', created_at from fp_work_orders
 where org_id = pg_temp.k('org') and created_at > now() - interval '30 days'
union all
select org_id, assigned_to, 'fp_work_orders', id, 'UPDATE', updated_at from fp_work_orders
 where org_id = pg_temp.k('org') and updated_at > now() - interval '30 days' and assigned_to is not null;

reset session_replication_role;
commit;

select 'Harbourview Properties (Demo) loaded' as status,
  (select count(*) from fp_locations where org_id = pg_temp.k('org')) as locations,
  (select count(*) from fp_assets where org_id = pg_temp.k('org')) as assets,
  (select count(*) from fp_work_orders where org_id = pg_temp.k('org')) as work_orders,
  (select count(*) from fp_requests where org_id = pg_temp.k('org')) as requests,
  (select count(*) from fp_telemetry where org_id = pg_temp.k('org')) as readings;

-- ============================================================================
-- To remove the demo completely: supabase/seed/tenant_demo_remove.sql
-- ============================================================================
