-- 0001_core_tenancy.sql
-- FacilitySpace Phase 0: organisations, membership/roles, helper functions, audit.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------
create table fp_organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  active_languages  jsonb not null default '["en","vi"]'::jsonb,
  default_lng       text not null default 'en',
  subscription_tier text not null default 'trial',
  settings          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Membership: a user belongs to an org with a role (per-org)
-- ---------------------------------------------------------------------------
create table fp_users_orgs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  role          text not null check (role in
                  ('super_admin','org_admin','manager','technician','occupant','vendor')),
  preferred_lng text default 'en',
  team          text,
  created_at    timestamptz not null default now(),
  unique (user_id, org_id)
);

create index fp_users_orgs_user_idx on fp_users_orgs (user_id);
create index fp_users_orgs_org_idx  on fp_users_orgs (org_id);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they bypass RLS safely and avoid
-- recursive policy evaluation on fp_users_orgs).
-- ---------------------------------------------------------------------------
create or replace function fp_is_member(target_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from fp_users_orgs
    where user_id = auth.uid() and org_id = target_org
  );
$$;

create or replace function fp_has_role(target_org uuid, needed text[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from fp_users_orgs
    where user_id = auth.uid()
      and org_id = target_org
      and role = any(needed)
  );
$$;

-- ---------------------------------------------------------------------------
-- updated_at touch trigger
-- ---------------------------------------------------------------------------
create or replace function fp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_fp_organizations_touch
  before update on fp_organizations
  for each row execute function fp_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table fp_audit_log (
  id          bigint generated always as identity primary key,
  org_id      uuid,
  actor       uuid,
  entity_type text,
  entity_id   uuid,
  action      text,
  diff        jsonb,
  at          timestamptz not null default now()
);

create index fp_audit_org_idx on fp_audit_log (org_id, at desc);

create or replace function fp_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  v_org := coalesce(
    (case when tg_op = 'DELETE' then old else new end)->>'org_id',
    null
  )::uuid;
  v_id := coalesce(
    (case when tg_op = 'DELETE' then old else new end)->>'id',
    null
  )::uuid;

  insert into fp_audit_log (org_id, actor, entity_type, entity_id, action, diff)
  values (
    v_org,
    auth.uid(),
    tg_table_name,
    v_id,
    tg_op,
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
