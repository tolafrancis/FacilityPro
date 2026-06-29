-- 0014_vendors_contracts.sql
-- Vendor directory, contracts, and licenses with expiry tracking.

create table fp_vendors (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  name       text not null,
  category   text,
  email      text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fp_contracts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references fp_organizations(id) on delete cascade,
  vendor_id    uuid references fp_vendors(id) on delete set null,
  title        text not null,
  document_url text,
  start_date   date,
  expiry_date  date,
  reminder_days int not null default 30,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table fp_licenses (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references fp_organizations(id) on delete cascade,
  name         text not null,
  holder       text,
  document_url text,
  expiry_date  date,
  reminder_days int not null default 30,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index fp_vendors_org_idx   on fp_vendors (org_id);
create index fp_contracts_org_idx on fp_contracts (org_id, expiry_date);
create index fp_licenses_org_idx  on fp_licenses (org_id, expiry_date);

create trigger trg_fp_vendors_touch
  before update on fp_vendors for each row execute function fp_touch_updated_at();
create trigger trg_fp_contracts_touch
  before update on fp_contracts for each row execute function fp_touch_updated_at();
create trigger trg_fp_licenses_touch
  before update on fp_licenses for each row execute function fp_touch_updated_at();

alter table fp_vendors   enable row level security;
alter table fp_contracts enable row level security;
alter table fp_licenses  enable row level security;

create policy vendors_select on fp_vendors for select to authenticated
  using ( fp_is_member(org_id) );
create policy vendors_write on fp_vendors for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy contracts_select on fp_contracts for select to authenticated
  using ( fp_is_member(org_id) );
create policy contracts_write on fp_contracts for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy licenses_select on fp_licenses for select to authenticated
  using ( fp_is_member(org_id) );
create policy licenses_write on fp_licenses for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create trigger trg_audit_vendors after insert or update or delete
  on fp_vendors for each row execute function fp_audit();
create trigger trg_audit_contracts after insert or update or delete
  on fp_contracts for each row execute function fp_audit();
create trigger trg_audit_licenses after insert or update or delete
  on fp_licenses for each row execute function fp_audit();
