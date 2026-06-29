-- 0003_assets.sql
-- Asset registry (foundation schema; Phase 1 builds the asset UI).

create table fp_asset_types (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  name_i18n  jsonb not null,
  created_at timestamptz not null default now()
);

create table fp_assets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references fp_organizations(id) on delete cascade,
  location_id    uuid references fp_locations(id) on delete set null,
  asset_type_id  uuid references fp_asset_types(id) on delete set null,
  parent_id      uuid references fp_assets(id) on delete set null,
  name_i18n      jsonb not null,
  serial         text,
  manufacturer   text,
  model          text,
  purchase_date  date,
  purchase_cost  numeric(14,2),
  warranty_expiry date,
  specs          jsonb not null default '{}'::jsonb,
  qr_code        text unique,
  status         text not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index fp_assets_org_idx on fp_assets (org_id);
create index fp_assets_location_idx on fp_assets (location_id);
create index fp_assets_name_gin on fp_assets using gin (name_i18n);

create trigger trg_fp_assets_touch
  before update on fp_assets
  for each row execute function fp_touch_updated_at();
