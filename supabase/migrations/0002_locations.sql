-- 0002_locations.sql
-- Sites and hierarchical locations. Names are i18n (JSONB).

create table fp_sites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  name_i18n  jsonb not null,
  address    text,
  lat        numeric,
  lng        numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fp_locations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  site_id    uuid references fp_sites(id) on delete cascade,
  parent_id  uuid references fp_locations(id) on delete cascade,
  name_i18n  jsonb not null,
  kind       text not null check (kind in ('building','floor','room','zone')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fp_sites_org_idx     on fp_sites (org_id);
create index fp_locations_org_idx on fp_locations (org_id);
create index fp_locations_parent_idx on fp_locations (parent_id);

create trigger trg_fp_sites_touch
  before update on fp_sites
  for each row execute function fp_touch_updated_at();

create trigger trg_fp_locations_touch
  before update on fp_locations
  for each row execute function fp_touch_updated_at();
