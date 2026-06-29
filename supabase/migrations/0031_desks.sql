-- 0031_desks.sql
-- Desks and desk bookings: backs the "Alert when Desk Booking Is Made" workflow.
-- A desk belongs to a zone (an fp_locations row of kind 'zone'); a booking records
-- who reserved a desk and when.

create table if not exists fp_desks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  name_i18n  jsonb not null,
  zone_id    uuid references fp_locations(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fp_desk_bookings (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references fp_organizations(id) on delete cascade,
  desk_id     uuid not null references fp_desks(id) on delete cascade,
  booked_by   uuid references auth.users(id) on delete set null,
  booker_name text,
  booked_for  date,
  created_at  timestamptz not null default now()
);

create index if not exists fp_desks_org_idx on fp_desks (org_id, is_active);
create index if not exists fp_desk_bookings_desk_idx on fp_desk_bookings (desk_id, created_at desc);
create index if not exists fp_desk_bookings_org_idx on fp_desk_bookings (org_id, created_at desc);

create trigger trg_fp_desks_touch
  before update on fp_desks
  for each row execute function fp_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: members read; admin/manager manage desks. Any member can make a booking.
-- ---------------------------------------------------------------------------
alter table fp_desks enable row level security;
alter table fp_desk_bookings enable row level security;

create policy desks_select on fp_desks for select to authenticated
  using ( fp_is_member(org_id) );
create policy desks_write on fp_desks for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy desk_bookings_select on fp_desk_bookings for select to authenticated
  using ( fp_is_member(org_id) );
create policy desk_bookings_insert on fp_desk_bookings for insert to authenticated
  with check ( fp_is_member(org_id) );
create policy desk_bookings_delete on fp_desk_bookings for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );

-- Audit
create trigger trg_audit_desks after insert or update or delete
  on fp_desks for each row execute function fp_audit();
create trigger trg_audit_desk_bookings after insert or update or delete
  on fp_desk_bookings for each row execute function fp_audit();
