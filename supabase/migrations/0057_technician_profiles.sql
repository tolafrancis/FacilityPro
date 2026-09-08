-- 0057_technician_profiles.sql
-- Audit finding (Labor/Technicians: 30/100): a technician was a role value
-- and a free-text team string, nothing more — no rate, contact info,
-- skills, or certifications, despite fp_wo_labor already needing a rate to
-- snapshot. This adds a real profile per member and lets certifications
-- carry an expiry date (the same "track it, flag it before it lapses"
-- pattern as fp_contracts/fp_licenses).

create table fp_technician_profiles (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  employee_id   text,
  phone         text,
  labor_rate    numeric(14,2),
  shift         text,
  skills        text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, user_id)
);

create index fp_technician_profiles_org_idx on fp_technician_profiles (org_id);

create trigger trg_fp_technician_profiles_touch
  before update on fp_technician_profiles for each row execute function fp_touch_updated_at();

create table fp_technician_certifications (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references fp_organizations(id) on delete cascade,
  technician_profile_id uuid not null references fp_technician_profiles(id) on delete cascade,
  name                  text not null,
  issuer                text,
  expiry_date           date,
  created_at            timestamptz not null default now()
);

create index fp_technician_certs_profile_idx on fp_technician_certifications (technician_profile_id);

-- ---------------------------------------------------------------------------
-- RLS: a technician's rate is compensation-adjacent, so reads are limited to
-- the technician themselves and admin/manager — not every member, unlike
-- most catalog-style tables in this schema. Writes are admin/manager only.
-- ---------------------------------------------------------------------------
alter table fp_technician_profiles enable row level security;
alter table fp_technician_certifications enable row level security;

create policy technician_profiles_select on fp_technician_profiles for select to authenticated
  using ( user_id = auth.uid() or fp_has_role(org_id, array['org_admin','manager']) );
create policy technician_profiles_write on fp_technician_profiles for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy technician_certs_select on fp_technician_certifications for select to authenticated
  using (
    fp_has_role(org_id, array['org_admin','manager'])
    or exists (
      select 1 from fp_technician_profiles p
      where p.id = technician_profile_id and p.user_id = auth.uid()
    )
  );
create policy technician_certs_write on fp_technician_certifications for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create trigger trg_audit_technician_profiles after insert or update or delete
  on fp_technician_profiles for each row execute function fp_audit();
create trigger trg_audit_technician_certifications after insert or update or delete
  on fp_technician_certifications for each row execute function fp_audit();
