-- 0041_catalog_defaults_fill.sql
-- Fix: 0040 only seeded default catalogs for orgs whose catalog was completely
-- empty, so orgs that already had a type (e.g. "leaking water") got none.
-- Re-implement the seeders to add each default that is MISSING BY NAME, then
-- backfill every org. Safe to re-run.

alter table fp_fault_types add column if not exists is_active boolean not null default true;
alter table fp_asset_types add column if not exists is_active boolean not null default true;

create or replace function fp_seed_default_fault_types(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into fp_fault_types (org_id, name_i18n, default_priority)
  select p_org, jsonb_build_object('en', d.n, 'vi', d.n), d.pr
  from (values
    ('Mechanical Failure', 'high'),
    ('Electrical Failure', 'high'),
    ('Plumbing Issue', 'medium'),
    ('HVAC Fault', 'medium'),
    ('Air Conditioning Failure', 'medium'),
    ('Water Leak', 'high'),
    ('Gas Leak', 'critical'),
    ('Lighting Fault', 'low'),
    ('Power Outage', 'critical'),
    ('Equipment Breakdown', 'high'),
    ('Motor Failure', 'high'),
    ('Pump Failure', 'high'),
    ('Sensor Failure', 'medium'),
    ('Calibration Required', 'low'),
    ('Preventive Maintenance', 'low'),
    ('Corrective Maintenance', 'medium'),
    ('Emergency Repair', 'critical'),
    ('Safety Hazard', 'critical'),
    ('Fire Alarm Fault', 'critical'),
    ('Network / IT Equipment Fault', 'medium'),
    ('Building Fabric Damage', 'medium'),
    ('Door / Window Fault', 'low'),
    ('Roofing Issue', 'medium'),
    ('Cleaning Request', 'low'),
    ('Pest Control', 'low'),
    ('Other', 'medium')
  ) as d(n, pr)
  where not exists (
    select 1 from fp_fault_types ft
    where ft.org_id = p_org and lower(ft.name_i18n->>'en') = lower(d.n)
  );
end;
$$;

create or replace function fp_seed_default_asset_types(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into fp_asset_types (org_id, name_i18n)
  select p_org, jsonb_build_object('en', d.n, 'vi', d.n)
  from (values
    ('HVAC Unit'), ('Air Conditioner'), ('Generator'), ('Chiller'), ('Boiler'),
    ('Pump'), ('Motor'), ('Electrical Panel'), ('Transformer'), ('Lighting Fixture'),
    ('Elevator'), ('Escalator'), ('Fire Alarm System'), ('CCTV Camera'),
    ('Access Control System'), ('Water Tank'), ('Plumbing Fixture'), ('Compressor'),
    ('UPS'), ('Server'), ('Computer'), ('Printer'), ('Vehicle'), ('Building'),
    ('Room'), ('Other')
  ) as d(n)
  where not exists (
    select 1 from fp_asset_types at2
    where at2.org_id = p_org and lower(at2.name_i18n->>'en') = lower(d.n)
  );
end;
$$;

-- Backfill every org (adds only the missing defaults).
select fp_seed_default_fault_types(id) from fp_organizations;
select fp_seed_default_asset_types(id) from fp_organizations;
