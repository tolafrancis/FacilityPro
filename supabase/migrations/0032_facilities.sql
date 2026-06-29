-- 0032_facilities.sql
-- Common facilities (meeting rooms, gyms, etc.) and their bookings: backs the
-- "Alert after Facilities Booking" workflow. A facility optionally belongs to a
-- location; a booking records who reserved it and when.

create table if not exists fp_facilities (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  name_i18n  jsonb not null,
  location_id uuid references fp_locations(id) on delete set null,
  capacity   int,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fp_facility_bookings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references fp_organizations(id) on delete cascade,
  facility_id  uuid not null references fp_facilities(id) on delete cascade,
  booked_by    uuid references auth.users(id) on delete set null,
  booker_name  text,
  booked_for   date,
  created_at   timestamptz not null default now()
);

create index if not exists fp_facilities_org_idx on fp_facilities (org_id, is_active);
create index if not exists fp_facility_bookings_fac_idx on fp_facility_bookings (facility_id, created_at desc);
create index if not exists fp_facility_bookings_org_idx on fp_facility_bookings (org_id, created_at desc);

create trigger trg_fp_facilities_touch
  before update on fp_facilities
  for each row execute function fp_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: members read; admin/manager manage facilities. Any member can book.
-- ---------------------------------------------------------------------------
alter table fp_facilities enable row level security;
alter table fp_facility_bookings enable row level security;

create policy facilities_select on fp_facilities for select to authenticated
  using ( fp_is_member(org_id) );
create policy facilities_write on fp_facilities for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy facility_bookings_select on fp_facility_bookings for select to authenticated
  using ( fp_is_member(org_id) );
create policy facility_bookings_insert on fp_facility_bookings for insert to authenticated
  with check ( fp_is_member(org_id) );
create policy facility_bookings_delete on fp_facility_bookings for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );

-- Audit
create trigger trg_audit_facilities after insert or update or delete
  on fp_facilities for each row execute function fp_audit();
create trigger trg_audit_facility_bookings after insert or update or delete
  on fp_facility_bookings for each row execute function fp_audit();
