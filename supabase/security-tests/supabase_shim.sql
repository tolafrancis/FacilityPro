-- Minimal stand-in for a Supabase project, enough to run FacilityPro's
-- migrations and exercise RLS/grants the way PostgREST would. Used by
-- supabase/security-tests/run.sh; not a migration.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;
create extension if not exists pgcrypto;

create schema auth;
create table auth.users (
  id uuid primary key, email text,
  -- Columns Supabase has that the admin panel reads (0084).
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  last_sign_in_at timestamptz, banned_until timestamptz, email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  -- 0085
  phone text, raw_app_meta_data jsonb not null default '{}'::jsonb
);
-- Session, 2FA and sign-in tables the admin panel reads and clears (0085),
-- with Supabase's column names and types.
create type auth.aal_level as enum ('aal1', 'aal2', 'aal3');
create type auth.factor_type as enum ('totp', 'webauthn', 'phone');
create type auth.factor_status as enum ('unverified', 'verified');
create table auth.sessions (
  id uuid primary key, user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  aal auth.aal_level, not_after timestamptz, refreshed_at timestamp without time zone,
  user_agent text, ip inet, tag text
);
create table auth.refresh_tokens (
  id bigserial primary key, token varchar(255), user_id varchar(255), revoked boolean,
  created_at timestamptz default now(), updated_at timestamptz,
  session_id uuid references auth.sessions (id) on delete cascade
);
create table auth.mfa_factors (
  id uuid primary key, user_id uuid not null references auth.users (id) on delete cascade,
  friendly_name text, factor_type auth.factor_type not null, status auth.factor_status not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), secret text
);
create table auth.audit_log_entries (
  instance_id uuid, id uuid primary key, payload json,
  created_at timestamptz, ip_address varchar(64) not null default ''
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;

-- Supabase's default privileges: everything created in public by postgres is
-- reachable by the API roles (RLS and explicit revokes are the only guards).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
