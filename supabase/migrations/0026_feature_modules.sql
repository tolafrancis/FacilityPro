-- 0026_feature_modules.sql
-- Supabase-backed modules for documents, permits, attendance, broadcasts, and AI-ready metadata.

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table if not exists fp_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  title text not null,
  category text not null default 'General',
  owner text not null default 'Operations',
  summary text,
  link text,
  file_name text,
  file_path text,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fp_permits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  title text not null,
  asset text not null default 'Site-wide',
  requester text not null default 'Operations',
  approver text not null default 'Safety lead',
  due_date date,
  status text not null default 'submitted' check (status in ('draft','submitted','approved','rejected')),
  notes text,
  file_name text,
  file_path text,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fp_attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  technician text not null,
  site text not null default 'Main site',
  action text not null default 'Checked in' check (action in ('Checked in','Checked out')),
  note text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists fp_broadcasts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  title text not null,
  audience text not null default 'All tenants',
  message text not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists fp_documents_org_idx on fp_documents (org_id, created_at desc);
create index if not exists fp_permits_org_idx on fp_permits (org_id, created_at desc);
create index if not exists fp_attendance_org_idx on fp_attendance (org_id, checked_at desc);
create index if not exists fp_broadcasts_org_idx on fp_broadcasts (org_id, created_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table fp_documents enable row level security;
alter table fp_permits enable row level security;
alter table fp_attendance enable row level security;
alter table fp_broadcasts enable row level security;

-- ─── Policies: fp_documents ───────────────────────────────────────────────────

drop policy if exists documents_select on fp_documents;
create policy documents_select on fp_documents
  for select to authenticated
  using (fp_is_member(org_id));

drop policy if exists documents_insert on fp_documents;
create policy documents_insert on fp_documents
  for insert to authenticated
  with check (fp_is_member(org_id));

drop policy if exists documents_update on fp_documents;
create policy documents_update on fp_documents
  for update to authenticated
  using (fp_is_member(org_id))
  with check (fp_is_member(org_id));

drop policy if exists documents_delete on fp_documents;
create policy documents_delete on fp_documents
  for delete to authenticated
  using (fp_is_member(org_id));

-- ─── Policies: fp_permits ─────────────────────────────────────────────────────

drop policy if exists permits_select on fp_permits;
create policy permits_select on fp_permits
  for select to authenticated
  using (fp_is_member(org_id));

drop policy if exists permits_insert on fp_permits;
create policy permits_insert on fp_permits
  for insert to authenticated
  with check (fp_is_member(org_id));

drop policy if exists permits_update on fp_permits;
create policy permits_update on fp_permits
  for update to authenticated
  using (fp_is_member(org_id))
  with check (fp_is_member(org_id));

drop policy if exists permits_delete on fp_permits;
create policy permits_delete on fp_permits
  for delete to authenticated
  using (fp_is_member(org_id));

-- ─── Policies: fp_attendance ──────────────────────────────────────────────────

drop policy if exists attendance_select on fp_attendance;
create policy attendance_select on fp_attendance
  for select to authenticated
  using (fp_is_member(org_id));

drop policy if exists attendance_insert on fp_attendance;
create policy attendance_insert on fp_attendance
  for insert to authenticated
  with check (fp_is_member(org_id));

drop policy if exists attendance_update on fp_attendance;
create policy attendance_update on fp_attendance
  for update to authenticated
  using (fp_is_member(org_id))
  with check (fp_is_member(org_id));

drop policy if exists attendance_delete on fp_attendance;
create policy attendance_delete on fp_attendance
  for delete to authenticated
  using (fp_is_member(org_id));

-- ─── Policies: fp_broadcasts ──────────────────────────────────────────────────

drop policy if exists broadcasts_select on fp_broadcasts;
create policy broadcasts_select on fp_broadcasts
  for select to authenticated
  using (fp_is_member(org_id));

drop policy if exists broadcasts_insert on fp_broadcasts;
create policy broadcasts_insert on fp_broadcasts
  for insert to authenticated
  with check (fp_is_member(org_id));

drop policy if exists broadcasts_update on fp_broadcasts;
create policy broadcasts_update on fp_broadcasts
  for update to authenticated
  using (fp_is_member(org_id))
  with check (fp_is_member(org_id));

drop policy if exists broadcasts_delete on fp_broadcasts;
create policy broadcasts_delete on fp_broadcasts
  for delete to authenticated
  using (fp_is_member(org_id));

-- ─── Triggers ─────────────────────────────────────────────────────────────────

drop trigger if exists trg_fp_documents_touch on fp_documents;
create trigger trg_fp_documents_touch
  before update on fp_documents
  for each row execute function fp_touch_updated_at();

drop trigger if exists trg_fp_permits_touch on fp_permits;
create trigger trg_fp_permits_touch
  before update on fp_permits
  for each row execute function fp_touch_updated_at();

drop trigger if exists trg_fp_broadcasts_touch on fp_broadcasts;
create trigger trg_fp_broadcasts_touch
  before update on fp_broadcasts
  for each row execute function fp_touch_updated_at();