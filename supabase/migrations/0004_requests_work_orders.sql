-- 0004_requests_work_orders.sql
-- Fault reporting + work orders (foundation schema; Phase 1 builds the UI).

create table fp_fault_types (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references fp_organizations(id) on delete cascade,
  name_i18n        jsonb not null,
  default_priority text not null default 'medium',
  created_at       timestamptz not null default now()
);

create table fp_requests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references fp_organizations(id) on delete cascade,
  asset_id        uuid references fp_assets(id) on delete set null,
  location_id     uuid references fp_locations(id) on delete set null,
  fault_type_id   uuid references fp_fault_types(id) on delete set null,
  title           text,
  body_original   text,
  source_lng      text not null default 'en',
  body_i18n       jsonb not null default '{}'::jsonb,
  severity        text,
  priority        text not null default 'medium',
  channel         text not null default 'web'
                    check (channel in ('web','qr','email','whatsapp','telegram','messenger','line','zalo')),
  reporter_contact text,
  status          text not null default 'new'
                    check (status in ('new','triaged','assigned','in_progress','on_hold','resolved','closed','rejected')),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table fp_work_orders (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references fp_organizations(id) on delete cascade,
  request_id     uuid references fp_requests(id) on delete set null,
  asset_id       uuid references fp_assets(id) on delete set null,
  assigned_to    uuid references auth.users(id) on delete set null,
  title          text,
  instructions   text,
  priority       text not null default 'medium',
  status         text not null default 'assigned'
                   check (status in ('assigned','in_progress','on_hold','resolved','closed')),
  due_at         timestamptz,
  closed_at      timestamptz,
  labour_minutes int not null default 0,
  cost           numeric(14,2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index fp_requests_org_status_idx    on fp_requests (org_id, status);
create index fp_work_orders_org_status_idx on fp_work_orders (org_id, status);
create index fp_work_orders_assignee_idx   on fp_work_orders (assigned_to);

create trigger trg_fp_requests_touch
  before update on fp_requests
  for each row execute function fp_touch_updated_at();

create trigger trg_fp_work_orders_touch
  before update on fp_work_orders
  for each row execute function fp_touch_updated_at();
