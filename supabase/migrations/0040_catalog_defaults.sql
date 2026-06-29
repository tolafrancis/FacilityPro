-- 0040_catalog_defaults.sql
-- Fault Type & Asset Type management: add is_active, seed common defaults for
-- every org (and for new orgs), and expose a member-guarded RPC to (re)load
-- defaults from the UI. Deletion-in-use validation is handled client-side.

alter table fp_fault_types add column if not exists is_active boolean not null default true;
alter table fp_asset_types add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- Seed helpers (idempotent: only seed when the org has none of that catalog).
-- ---------------------------------------------------------------------------
create or replace function fp_seed_default_fault_types(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from fp_fault_types where org_id = p_org) then
    return;
  end if;
  insert into fp_fault_types (org_id, name_i18n, default_priority)
  select p_org, jsonb_build_object('en', n, 'vi', n), pr
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
  ) as d(n, pr);
end;
$$;

create or replace function fp_seed_default_asset_types(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from fp_asset_types where org_id = p_org) then
    return;
  end if;
  insert into fp_asset_types (org_id, name_i18n)
  select p_org, jsonb_build_object('en', n, 'vi', n)
  from (values
    ('HVAC Unit'), ('Air Conditioner'), ('Generator'), ('Chiller'), ('Boiler'),
    ('Pump'), ('Motor'), ('Electrical Panel'), ('Transformer'), ('Lighting Fixture'),
    ('Elevator'), ('Escalator'), ('Fire Alarm System'), ('CCTV Camera'),
    ('Access Control System'), ('Water Tank'), ('Plumbing Fixture'), ('Compressor'),
    ('UPS'), ('Server'), ('Computer'), ('Printer'), ('Vehicle'), ('Building'),
    ('Room'), ('Other')
  ) as d(n);
end;
$$;

-- Member-guarded RPC so admins can (re)load defaults from Settings.
create or replace function fp_load_default_catalogs(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fp_has_role(p_org, array['org_admin', 'manager']) then
    raise exception 'Not authorized';
  end if;
  perform fp_seed_default_fault_types(p_org);
  perform fp_seed_default_asset_types(p_org);
end;
$$;

grant execute on function fp_load_default_catalogs(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill existing orgs that have no catalogs yet.
-- ---------------------------------------------------------------------------
select fp_seed_default_fault_types(id) from fp_organizations;
select fp_seed_default_asset_types(id) from fp_organizations;

-- ---------------------------------------------------------------------------
-- Seed catalogs (and surveys) for newly created orgs.
-- ---------------------------------------------------------------------------
create or replace function fp_create_organization(
  p_name text,
  p_default_lng text default 'en'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into fp_organizations (name, default_lng)
  values (p_name, p_default_lng)
  returning id into v_org;

  insert into fp_users_orgs (user_id, org_id, role, preferred_lng)
  values (v_uid, v_org, 'org_admin', p_default_lng);

  insert into fp_surveys (org_id, name_i18n, questions) values
    (
      v_org,
      '{"en":"Post-completion feedback","vi":"Phản hồi sau hoàn thành"}'::jsonb,
      '["How satisfied were you with the resolution?","Was the issue resolved on time?","Any additional comments?"]'::jsonb
    ),
    (
      v_org,
      '{"en":"Service quality survey","vi":"Khảo sát chất lượng dịch vụ"}'::jsonb,
      '["How would you rate the quality of service?","How responsive was our team?","Would you recommend our facilities team?"]'::jsonb
    );

  perform fp_seed_default_fault_types(v_org);
  perform fp_seed_default_asset_types(v_org);

  return v_org;
end;
$$;
