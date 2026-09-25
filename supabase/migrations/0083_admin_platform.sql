-- 0083: platform admin panel (/admin) — foundation.
--
-- Staff of the platform owner manage tenants (organisations), their users,
-- plans and billing, and the app itself. This migration adds:
--
--   * Admin roles on fp_platform_admins: super_admin, admin, support,
--     analyst (existing platform admins become super_admin), and one
--     permission check used by every policy and function:
--       fp_admin_can(permission)   fp_admin_permissions()  (for the UI)
--   * Tenant lifecycle and profile on fp_organizations: suspension, soft
--     delete, contact, address, currency, subdomain, brand colour, last
--     activity. (Enforcing suspension for tenant logins comes with the
--     tenant-management module.)
--   * Daily activity (fp_daily_activity) for DAU/MAU and "last active",
--     recorded by the tenant app once per day (fp_record_activity).
--   * Platform events (fp_platform_events): sign-ups, plan changes,
--     cancellations, failed payments — the dashboard's activity feed,
--     written by triggers.
--   * Billing: Stripe and PayPal ids on plans and subscriptions, invoices
--     (fp_platform_invoices), coupons.
--   * Support tickets and messages (internal notes), internal tenant notes,
--     feature flags and modules (global, per tenant, rollout %),
--     announcements, email/SMS templates, one row of platform settings
--     (app, maintenance mode, mobile versions, security policy).
--   * Admin audit trail (fp_admin_audit): who, what, when, IP, before/after,
--     written by triggers on every admin table.
--   * fp_admin_overview(from, to): the main dashboard in one call.
--
-- Everything here is closed to tenants: RLS allows platform staff only, by
-- permission. Covered by supabase/security-tests/admin_platform.sql.

-- ===========================================================================
-- Roles and permissions
-- ===========================================================================
alter table fp_platform_admins
  add column if not exists role         text not null default 'super_admin',
  add column if not exists display_name text,
  add column if not exists disabled_at  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fp_platform_admins_role_check') then
    alter table fp_platform_admins add constraint fp_platform_admins_role_check
      check (role in ('super_admin', 'admin', 'support', 'analyst'));
  end if;
end $$;

-- Existing platform admins (and the documented "insert into
-- fp_platform_admins (user_id) …" bootstrap) keep full access; the admin
-- panel always sets a role explicitly when adding staff.

-- The permission matrix. src/admin/permissions.ts mirrors it for typing and
-- its unit test checks the two agree (fp_admin_role_permissions).
create or replace function fp_admin_role_permissions(p_role text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_role
    when 'super_admin' then array[
      'dashboard.view', 'tenants.view', 'tenants.manage', 'tenants.impersonate',
      'users.view', 'users.manage', 'billing.view', 'billing.manage',
      'tickets.view', 'tickets.manage', 'reports.view', 'platform.manage',
      'announcements.manage', 'audit.view', 'security.manage', 'monitoring.view', 'team.manage']
    when 'admin' then array[
      'dashboard.view', 'tenants.view', 'tenants.manage', 'users.view', 'users.manage',
      'tickets.view', 'reports.view', 'announcements.manage', 'audit.view', 'monitoring.view']
    when 'support' then array[
      'dashboard.view', 'tenants.view', 'tenants.impersonate', 'users.view',
      'tickets.view', 'tickets.manage']
    when 'analyst' then array['dashboard.view', 'reports.view']
    else array[]::text[]
  end;
$$;

create or replace function fp_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from fp_platform_admins where user_id = auth.uid() and disabled_at is null;
$$;

create or replace function fp_admin_can(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_permission = any (fp_admin_role_permissions(fp_admin_role())), false);
$$;

-- For the UI: the caller's role and permissions (null role = not staff).
create or replace function fp_admin_permissions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role', fp_admin_role(),
    'permissions', to_jsonb(fp_admin_role_permissions(fp_admin_role())));
$$;

-- fp_is_platform_admin (0059) now means an enabled staff account; existing
-- platform functions keep working for super admins and admins.
create or replace function fp_is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from fp_platform_admins
                 where user_id = auth.uid() and disabled_at is null
                   and role in ('super_admin', 'admin'));
$$;

-- Staff accounts: super admins manage them; staff see the team.
alter table fp_platform_admins enable row level security;
drop policy if exists platform_admins_select on fp_platform_admins;
create policy platform_admins_select on fp_platform_admins for select to authenticated
  using ( user_id = auth.uid() or fp_admin_role() is not null );
drop policy if exists platform_admins_write on fp_platform_admins;
create policy platform_admins_write on fp_platform_admins for all to authenticated
  using ( fp_admin_can('team.manage') ) with check ( fp_admin_can('team.manage') );

-- ===========================================================================
-- Admin audit trail
-- ===========================================================================
create table if not exists fp_admin_audit (
  id          bigint generated always as identity primary key,
  admin_id    uuid,
  action      text not null,           -- insert | update | delete | or a named action
  target_type text not null,
  target_id   text,
  org_id      uuid,
  ip          text,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
create index if not exists fp_admin_audit_at_idx on fp_admin_audit (at desc);
create index if not exists fp_admin_audit_org_idx on fp_admin_audit (org_id, at desc);
create index if not exists fp_admin_audit_admin_idx on fp_admin_audit (admin_id, at desc);

alter table fp_admin_audit enable row level security;
drop policy if exists admin_audit_select on fp_admin_audit;
create policy admin_audit_select on fp_admin_audit for select to authenticated
  using ( fp_admin_can('audit.view') );
-- No insert/update/delete policies: written only by the definer functions
-- below, and never changed.

-- The caller's IP as forwarded by the API gateway (PostgREST exposes the
-- request headers), or null outside a request.
create or replace function fp_request_ip()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for',
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-real-ip', ''), ',', 1), '');
$$;

create or replace function fp_admin_log(p_action text, p_target_type text, p_target_id text, p_org uuid,
                                        p_before jsonb default null, p_after jsonb default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into fp_admin_audit (admin_id, action, target_type, target_id, org_id, ip, before, after)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_org, fp_request_ip(), p_before, p_after);
$$;

-- Trigger for admin tables: logs every change with before/after values.
create or replace function fp_admin_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  perform fp_admin_log(
    lower(tg_op), tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'key', rec ->> 'code', rec ->> 'user_id'),
    nullif(rec ->> 'org_id', '')::uuid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_admin_audit on fp_platform_admins;
create trigger trg_admin_audit after insert or update or delete on fp_platform_admins
  for each row execute function fp_admin_audit_trigger();

-- ===========================================================================
-- Tenants: lifecycle and profile
-- ===========================================================================
alter table fp_organizations
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists deleted_at       timestamptz,
  add column if not exists contact_name     text,
  add column if not exists contact_email    text,
  add column if not exists contact_phone    text,
  add column if not exists address          text,
  add column if not exists currency         text not null default 'VND',
  add column if not exists subdomain        text,
  add column if not exists brand_color      text,
  add column if not exists last_active_at   timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fp_organizations_subdomain_check') then
    alter table fp_organizations add constraint fp_organizations_subdomain_check
      check (subdomain is null or subdomain ~ '^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$');
    alter table fp_organizations add constraint fp_organizations_brand_color_check
      check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$');
    alter table fp_organizations add constraint fp_organizations_currency_check
      check (currency ~ '^[A-Z]{3}$');
  end if;
end $$;
create unique index if not exists fp_organizations_subdomain_uk on fp_organizations (subdomain) where subdomain is not null;

-- Tenants may not change these themselves (0059 grants updates column by
-- column; none of the new columns are granted). Staff change them through
-- the admin functions.

-- Staff with tenants.view read every organisation (tenants still see only
-- their own, 0006).
drop policy if exists org_admin_select on fp_organizations;
create policy org_admin_select on fp_organizations for select to authenticated
  using ( fp_admin_can('tenants.view') );

create table if not exists fp_admin_notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null default auth.uid(),
  body       text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists fp_admin_notes_org_idx on fp_admin_notes (org_id, created_at desc);
alter table fp_admin_notes enable row level security;
drop policy if exists admin_notes_select on fp_admin_notes;
create policy admin_notes_select on fp_admin_notes for select to authenticated
  using ( fp_admin_can('tenants.view') );
drop policy if exists admin_notes_insert on fp_admin_notes;
create policy admin_notes_insert on fp_admin_notes for insert to authenticated
  with check ( fp_admin_can('tenants.view') and author_id = auth.uid() );
drop policy if exists admin_notes_delete on fp_admin_notes;
create policy admin_notes_delete on fp_admin_notes for delete to authenticated
  using ( author_id = auth.uid() or fp_admin_can('tenants.manage') );
drop trigger if exists trg_admin_audit on fp_admin_notes;
create trigger trg_admin_audit after insert or update or delete on fp_admin_notes
  for each row execute function fp_admin_audit_trigger();

-- ===========================================================================
-- Activity (DAU / MAU, last active)
-- ===========================================================================
create table if not exists fp_daily_activity (
  day     date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id  uuid not null references fp_organizations(id) on delete cascade,
  primary key (day, org_id, user_id)
);
create index if not exists fp_daily_activity_user_idx on fp_daily_activity (user_id, day desc);
alter table fp_daily_activity enable row level security;
drop policy if exists daily_activity_select on fp_daily_activity;
create policy daily_activity_select on fp_daily_activity for select to authenticated
  using ( fp_admin_can('reports.view') or fp_admin_can('users.view') );

-- Called by the tenant app once a day per organisation.
create or replace function fp_record_activity(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not fp_is_member(p_org) then
    return;
  end if;
  insert into fp_daily_activity (day, user_id, org_id)
  values ((now() at time zone 'utc')::date, auth.uid(), p_org)
  on conflict do nothing;
  update fp_organizations set last_active_at = now()
   where id = p_org and (last_active_at is null or last_active_at < now() - interval '10 minutes');
end;
$$;

-- ===========================================================================
-- Billing: providers, invoices, coupons
-- ===========================================================================
alter table fp_plans
  add column if not exists price_year           numeric,
  add column if not exists stripe_price_month   text,
  add column if not exists stripe_price_year    text,
  add column if not exists paypal_plan_month    text,
  add column if not exists paypal_plan_year     text,
  add column if not exists features             jsonb not null default '[]'::jsonb;

alter table fp_subscriptions
  add column if not exists billing_interval          text not null default 'month',
  add column if not exists provider_customer_id      text,
  add column if not exists provider_subscription_id  text,
  add column if not exists trial_ends_at             timestamptz,
  add column if not exists coupon_code               text,
  add column if not exists canceled_at               timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fp_subscriptions_provider_check') then
    alter table fp_subscriptions add constraint fp_subscriptions_provider_check
      check (provider is null or provider in ('stripe', 'paypal', 'manual'));
    alter table fp_subscriptions add constraint fp_subscriptions_billing_interval_check
      check (billing_interval in ('month', 'year'));
  end if;
end $$;

drop policy if exists subs_admin_select on fp_subscriptions;
create policy subs_admin_select on fp_subscriptions for select to authenticated
  using ( fp_admin_can('tenants.view') or fp_admin_can('billing.view') );

create table if not exists fp_coupons (
  code            text primary key check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description     text,
  percent_off     numeric check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  amount_off      numeric check (amount_off is null or amount_off > 0),
  currency        text,
  duration        text not null default 'once' check (duration in ('once', 'repeating', 'forever')),
  duration_months int check (duration_months is null or duration_months > 0),
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  redemptions     int not null default 0,
  expires_at      timestamptz,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  check ((percent_off is null) <> (amount_off is null))
);

create table if not exists fp_platform_invoices (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,
  org_id          uuid not null references fp_organizations(id) on delete cascade,
  plan_code       text references fp_plans(code) on delete set null,
  amount          numeric not null check (amount >= 0),
  currency        text not null default 'USD',
  status          text not null default 'open'
                    check (status in ('draft', 'open', 'paid', 'failed', 'refunded', 'void')),
  provider        text not null default 'manual' check (provider in ('stripe', 'paypal', 'manual')),
  provider_ref    text,
  coupon_code     text references fp_coupons(code) on delete set null,
  period_start    timestamptz,
  period_end      timestamptz,
  issued_at       timestamptz not null default now(),
  due_at          timestamptz,
  paid_at         timestamptz,
  failed_at       timestamptz,
  attempts        int not null default 0,
  refunded_amount numeric not null default 0 check (refunded_amount >= 0),
  created_at      timestamptz not null default now()
);
create index if not exists fp_platform_invoices_org_idx on fp_platform_invoices (org_id, issued_at desc);
create index if not exists fp_platform_invoices_status_idx on fp_platform_invoices (status, issued_at desc);
create unique index if not exists fp_platform_invoices_provider_ref_uk
  on fp_platform_invoices (provider, provider_ref) where provider_ref is not null;

-- ===========================================================================
-- Support tickets
-- ===========================================================================
create table if not exists fp_support_tickets (
  id                uuid primary key default gen_random_uuid(),
  number            bigint generated always as identity unique,
  org_id            uuid references fp_organizations(id) on delete set null,
  requester_id      uuid references auth.users(id) on delete set null,
  requester_email   text,
  subject           text not null check (length(subject) between 1 and 200),
  status            text not null default 'open'
                      check (status in ('open', 'pending', 'on_hold', 'solved', 'closed')),
  priority          text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee_id       uuid references auth.users(id) on delete set null,
  sla_due_at        timestamptz,
  first_response_at timestamptz,
  solved_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists fp_support_tickets_status_idx on fp_support_tickets (status, priority, created_at desc);
create index if not exists fp_support_tickets_org_idx on fp_support_tickets (org_id, created_at desc);

create table if not exists fp_ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references fp_support_tickets(id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null default auth.uid(),
  body       text not null check (length(body) between 1 and 20000),
  internal   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists fp_ticket_messages_ticket_idx on fp_ticket_messages (ticket_id, created_at);

-- ===========================================================================
-- Feature flags and modules
-- ===========================================================================
create table if not exists fp_feature_flags (
  key            text primary key check (key ~ '^[a-z0-9_.-]{2,64}$'),
  kind           text not null default 'feature' check (kind in ('feature', 'module')),
  description    text,
  enabled        boolean not null default false,
  rollout_pct    int not null default 100 check (rollout_pct between 0 and 100),
  updated_at     timestamptz not null default now()
);

create table if not exists fp_feature_flag_overrides (
  flag_key text not null references fp_feature_flags(key) on delete cascade,
  org_id   uuid not null references fp_organizations(id) on delete cascade,
  enabled  boolean not null,
  primary key (flag_key, org_id)
);

-- The core modules, all on (the app's existing behaviour).
insert into fp_feature_flags (key, kind, description, enabled) values
  ('work_orders',            'module', 'Work orders', true),
  ('preventive_maintenance', 'module', 'Preventive maintenance', true),
  ('assets',                 'module', 'Assets', true),
  ('inventory',              'module', 'Inventory and parts', true),
  ('visitor_management',     'module', 'Visitor management', true),
  ('space_booking',          'module', 'Desk and facility booking', true),
  ('vendors',                'module', 'Vendors', true),
  ('inspections',            'module', 'Inspections and checklists', true),
  ('iot',                    'module', 'IoT devices', true)
on conflict (key) do nothing;

-- Is a flag on for an organisation? Override first, then global switch and
-- a stable per-organisation rollout bucket (0–99).
create or replace function fp_flag_enabled(p_key text, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select o.enabled from fp_feature_flag_overrides o where o.flag_key = p_key and o.org_id = p_org),
    (select f.enabled and (abs(hashtext(p_key || ':' || p_org::text)) % 100) < f.rollout_pct
       from fp_feature_flags f where f.key = p_key),
    false);
$$;

-- For the tenant app: the organisation's flags (members only).
create or replace function fp_org_flags(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(f.key, fp_flag_enabled(f.key, p_org)), '{}'::jsonb)
  from fp_feature_flags f
  where fp_is_member(p_org) or fp_admin_can('tenants.view');
$$;

-- ===========================================================================
-- Announcements, templates, platform settings
-- ===========================================================================
create table if not exists fp_announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(title) between 1 and 200),
  body         text not null check (length(body) between 1 and 5000),
  level        text not null default 'info' check (level in ('info', 'warning', 'critical')),
  audience     text not null default 'all' check (audience in ('all', 'plans', 'tenants')),
  plan_codes   text[] not null default '{}',
  org_ids      uuid[] not null default '{}',
  published_at timestamptz,
  expires_at   timestamptz,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create table if not exists fp_message_templates (
  key        text not null check (key ~ '^[a-z0-9_.-]{2,64}$'),
  channel    text not null check (channel in ('email', 'sms')),
  lng        text not null default 'en',
  subject    text,
  body       text not null,
  variables  text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (key, channel, lng)
);

create table if not exists fp_platform_settings (
  id                      int primary key default 1 check (id = 1),
  app_name                text not null default 'FacilityPro',
  logo_path               text,
  default_lng             text not null default 'en',
  supported_lngs          text[] not null default array['en', 'vi'],
  default_timezone        text not null default 'Asia/Ho_Chi_Minh',
  email_from_name         text not null default 'FacilityPro',
  email_from_address      text,
  maintenance_mode        boolean not null default false,
  maintenance_message     text,
  mobile_min_version      text,
  mobile_latest_version   text,
  mobile_force_update     boolean not null default false,
  admin_require_2fa       boolean not null default false,
  admin_ip_allowlist      text[] not null default '{}',
  admin_session_minutes   int not null default 480 check (admin_session_minutes between 5 and 10080),
  password_min_length     int not null default 8 check (password_min_length between 8 and 128),
  updated_at              timestamptz not null default now()
);
insert into fp_platform_settings (id) values (1) on conflict (id) do nothing;

-- What every visitor may know: maintenance mode and mobile versions.
create or replace function fp_app_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'app_name', app_name,
    'maintenance_mode', maintenance_mode,
    'maintenance_message', maintenance_message,
    'mobile_min_version', mobile_min_version,
    'mobile_latest_version', mobile_latest_version,
    'mobile_force_update', mobile_force_update)
  from fp_platform_settings where id = 1;
$$;

-- ===========================================================================
-- Platform events (activity feed)
-- ===========================================================================
create table if not exists fp_platform_events (
  id      bigint generated always as identity primary key,
  type    text not null check (type in ('signup', 'upgrade', 'downgrade', 'cancellation',
                                        'reactivation', 'trial_started', 'payment_failed',
                                        'payment_succeeded', 'suspended', 'unsuspended', 'deleted')),
  org_id  uuid references fp_organizations(id) on delete cascade,
  detail  jsonb not null default '{}'::jsonb,
  at      timestamptz not null default now()
);
create index if not exists fp_platform_events_at_idx on fp_platform_events (at desc);
create index if not exists fp_platform_events_org_idx on fp_platform_events (org_id, at desc);

create or replace function fp_event_on_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into fp_platform_events (type, org_id, detail) values ('signup', new.id, jsonb_build_object('name', new.name));
  else
    if old.suspended_at is null and new.suspended_at is not null then
      insert into fp_platform_events (type, org_id, detail) values ('suspended', new.id, jsonb_build_object('reason', new.suspended_reason));
    elsif old.suspended_at is not null and new.suspended_at is null then
      insert into fp_platform_events (type, org_id) values ('unsuspended', new.id);
    end if;
    if old.deleted_at is null and new.deleted_at is not null then
      insert into fp_platform_events (type, org_id) values ('deleted', new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fp_event_org on fp_organizations;
create trigger trg_fp_event_org after insert or update of suspended_at, deleted_at on fp_organizations
  for each row execute function fp_event_on_org();

create or replace function fp_event_on_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_price numeric;
  new_price numeric;
begin
  if tg_op = 'UPDATE' and new.plan_code is distinct from old.plan_code then
    select price into old_price from fp_plans where code = old.plan_code;
    select price into new_price from fp_plans where code = new.plan_code;
    insert into fp_platform_events (type, org_id, detail)
    values (case when coalesce(new_price, 0) >= coalesce(old_price, 0) then 'upgrade' else 'downgrade' end,
            new.org_id, jsonb_build_object('from', old.plan_code, 'to', new.plan_code));
  end if;
  if new.status = 'canceled' and (tg_op = 'INSERT' or old.status is distinct from 'canceled') then
    insert into fp_platform_events (type, org_id, detail) values ('cancellation', new.org_id, jsonb_build_object('plan', new.plan_code));
  elsif tg_op = 'UPDATE' and old.status = 'canceled' and new.status in ('active', 'trialing') then
    insert into fp_platform_events (type, org_id, detail) values ('reactivation', new.org_id, jsonb_build_object('plan', new.plan_code));
  end if;
  if new.status = 'trialing' and (tg_op = 'INSERT' or old.status is distinct from 'trialing') then
    insert into fp_platform_events (type, org_id, detail) values ('trial_started', new.org_id, jsonb_build_object('plan', new.plan_code));
  end if;
  if new.status = 'canceled' and new.canceled_at is null then
    new.canceled_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fp_event_subscription on fp_subscriptions;
create trigger trg_fp_event_subscription before insert or update of plan_code, status on fp_subscriptions
  for each row execute function fp_event_on_subscription();

create or replace function fp_event_on_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'failed' and (tg_op = 'INSERT' or old.status is distinct from 'failed') then
    insert into fp_platform_events (type, org_id, detail)
    values ('payment_failed', new.org_id, jsonb_build_object('invoice', new.number, 'amount', new.amount, 'currency', new.currency));
  elsif new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    insert into fp_platform_events (type, org_id, detail)
    values ('payment_succeeded', new.org_id, jsonb_build_object('invoice', new.number, 'amount', new.amount, 'currency', new.currency));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fp_event_invoice on fp_platform_invoices;
create trigger trg_fp_event_invoice after insert or update of status on fp_platform_invoices
  for each row execute function fp_event_on_invoice();

-- ===========================================================================
-- RLS for the admin tables (staff only, by permission) + audit triggers
-- ===========================================================================
do $$
declare
  t record;
begin
  for t in select * from (values
      -- table,                      read permission,  write permission
      ('fp_coupons',                'billing.view',   'billing.manage'),
      ('fp_platform_invoices',      'billing.view',   'billing.manage'),
      ('fp_support_tickets',        'tickets.view',   'tickets.manage'),
      ('fp_ticket_messages',        'tickets.view',   'tickets.manage'),
      ('fp_feature_flags',          'tenants.view',   'platform.manage'),
      ('fp_feature_flag_overrides', 'tenants.view',   'platform.manage'),
      ('fp_announcements',          'dashboard.view', 'announcements.manage'),
      ('fp_message_templates',      'platform.manage','platform.manage'),
      ('fp_platform_settings',      'dashboard.view', 'platform.manage'),
      ('fp_platform_events',        'dashboard.view', 'nobody')
    ) as v(tbl, rd, wr)
  loop
    execute format('alter table %I enable row level security', t.tbl);
    execute format('drop policy if exists admin_read on %I', t.tbl);
    execute format('create policy admin_read on %I for select to authenticated using ( fp_admin_can(%L) )', t.tbl, t.rd);
    execute format('drop policy if exists admin_write on %I', t.tbl);
    if t.wr <> 'nobody' then
      execute format('create policy admin_write on %I for all to authenticated using ( fp_admin_can(%L) ) with check ( fp_admin_can(%L) )',
                     t.tbl, t.wr, t.wr);
      execute format('drop trigger if exists trg_admin_audit on %I', t.tbl);
      execute format('create trigger trg_admin_audit after insert or update or delete on %I
                        for each row execute function fp_admin_audit_trigger()', t.tbl);
    end if;
  end loop;
end $$;

-- Plans: billing staff edit them (read stays public, 0022).
drop policy if exists plans_admin_write on fp_plans;
create policy plans_admin_write on fp_plans for all to authenticated
  using ( fp_admin_can('billing.manage') ) with check ( fp_admin_can('billing.manage') );
drop trigger if exists trg_admin_audit on fp_plans;
create trigger trg_admin_audit after insert or update or delete on fp_plans
  for each row execute function fp_admin_audit_trigger();

-- ===========================================================================
-- Main dashboard
-- ===========================================================================
-- Monthly value of a subscription in the plan's currency.
create or replace function fp_sub_mrr(p_plan text, p_interval text)
returns numeric
language sql
stable
set search_path = public
as $$
  select case when p_interval = 'year' then coalesce(p.price_year, p.price * 12) / 12 else p.price end
  from fp_plans p where p.code = p_plan;
$$;

create or replace function fp_admin_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from   timestamptz := least(p_from, p_to);
  v_to     timestamptz := greatest(p_from, p_to);
  v_bucket text;
  result   jsonb;
begin
  if not fp_admin_can('dashboard.view') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_to - v_from > interval '3 years' then
    v_from := v_to - interval '3 years';
  end if;
  v_bucket := case when v_to - v_from <= interval '45 days' then 'day'
                   when v_to - v_from <= interval '200 days' then 'week' else 'month' end;

  with orgs as (
    select o.id, o.name, o.created_at, o.suspended_at, o.deleted_at, o.last_active_at,
           s.plan_code, s.status, s.billing_interval, s.canceled_at
    from fp_organizations o left join fp_subscriptions s on s.org_id = o.id
  ),
  live as (select * from orgs where deleted_at is null),
  paying as (
    select * from live
    where suspended_at is null and coalesce(status, 'active') in ('active', 'past_due')
  ),
  buckets as (
    select generate_series(date_trunc(v_bucket, v_from), date_trunc(v_bucket, v_to), ('1 ' || v_bucket)::interval) as b
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to, 'bucket', v_bucket),
    'kpis', jsonb_build_object(
      'total_tenants',   (select count(*) from live),
      'active_tenants',  (select count(*) from live where suspended_at is null
                            and coalesce(status, 'active') in ('active', 'trialing', 'past_due')),
      'trial_tenants',   (select count(*) from live where status = 'trialing'),
      'new_tenants',     (select count(*) from live where created_at between v_from and v_to),
      'total_users',     (select count(distinct uo.user_id) from fp_users_orgs uo join live l on l.id = uo.org_id),
      'mrr',             (select coalesce(round(sum(fp_sub_mrr(plan_code, billing_interval)), 2), 0) from paying),
      'churned',         (select count(*) from orgs where canceled_at between v_from and v_to),
      'churn_rate',      (select case when count(*) filter (where created_at < v_from and (canceled_at is null or canceled_at >= v_from)) = 0 then 0
                                  else round(100.0 * count(*) filter (where canceled_at between v_from and v_to)
                                        / count(*) filter (where created_at < v_from and (canceled_at is null or canceled_at >= v_from)), 1) end
                          from orgs),
      'open_tickets',    (select count(*) from fp_support_tickets where status in ('open', 'pending', 'on_hold')),
      'dau',             (select count(distinct user_id) from fp_daily_activity where day = (v_to at time zone 'utc')::date),
      'mau',             (select count(distinct user_id) from fp_daily_activity
                            where day > (v_to at time zone 'utc')::date - 30 and day <= (v_to at time zone 'utc')::date)
    ),
    'revenue', (select coalesce(jsonb_agg(jsonb_build_object('t', b.b,
                  'paid', coalesce((select sum(i.amount - i.refunded_amount) from fp_platform_invoices i
                                    where i.status in ('paid', 'refunded') and date_trunc(v_bucket, i.paid_at) = b.b), 0)) order by b.b), '[]')
                from buckets b),
    'tenant_growth', (select coalesce(jsonb_agg(jsonb_build_object('t', b.b,
                  'new', (select count(*) from orgs o where date_trunc(v_bucket, o.created_at) = b.b),
                  'total', (select count(*) from orgs o where o.created_at < b.b + ('1 ' || v_bucket)::interval
                              and (o.deleted_at is null or o.deleted_at >= b.b + ('1 ' || v_bucket)::interval))) order by b.b), '[]')
                from buckets b),
    'active_users', (select coalesce(jsonb_agg(jsonb_build_object('t', b.b,
                  'users', (select count(distinct a.user_id) from fp_daily_activity a
                              where date_trunc(v_bucket, a.day::timestamptz) = b.b)) order by b.b), '[]')
                from buckets b),
    'by_plan', (select coalesce(jsonb_agg(x order by x.count desc), '[]') from (
                  select coalesce(plan_code, 'none') as plan, count(*) as count from live group by 1) x),
    'top_tenants', (select coalesce(jsonb_agg(x order by x.score desc), '[]') from (
                  select l.id, l.name, l.plan_code as plan,
                         (select count(*) from fp_work_orders w where w.org_id = l.id and w.created_at between v_from and v_to) as work_orders,
                         (select count(*) from fp_requests r where r.org_id = l.id and r.created_at between v_from and v_to) as requests,
                         (select count(distinct a.user_id) from fp_daily_activity a where a.org_id = l.id
                            and a.day between (v_from at time zone 'utc')::date and (v_to at time zone 'utc')::date) as active_users,
                         (select count(*) from fp_work_orders w where w.org_id = l.id and w.created_at between v_from and v_to)
                           + (select count(*) from fp_requests r where r.org_id = l.id and r.created_at between v_from and v_to) as score
                  from live l order by score desc limit 8) x where x.score > 0),
    'activity', (select coalesce(jsonb_agg(x order by x.at desc), '[]') from (
                  select e.id, e.type, e.org_id, o.name as org_name, e.detail, e.at
                  from fp_platform_events e left join fp_organizations o on o.id = e.org_id
                  where e.at between v_from and v_to
                  order by e.at desc limit 15) x),
    'health', jsonb_build_object(
      'jobs_total',    (select count(*) from fp_jobs),
      'jobs_healthy',  (select count(*) from fp_jobs f where exists (
                          select 1 from fp_job_runs r where r.job = f.job and r.ok and r.finished_at >= now() - f.max_silence)),
      'job_failures_24h', (select count(*) from fp_job_runs where not ok and started_at >= now() - interval '24 hours'),
      'outbox_pending', (select count(*) from fp_notification_outbox where status in ('pending', 'sending')),
      'outbox_failed',  (select count(*) from fp_notification_outbox where status = 'failed' and created_at >= now() - interval '24 hours'),
      'checked_at',    now())
  ) into result;
  return result;
end;
$$;

-- ===========================================================================
-- Grants: everything above is closed by default (0059); open what the app
-- calls. The policies and function bodies do the permission checks.
-- ===========================================================================
revoke execute on function fp_admin_role_permissions(text), fp_admin_role(), fp_admin_can(text),
  fp_admin_permissions(), fp_request_ip(), fp_admin_log(text, text, text, uuid, jsonb, jsonb),
  fp_admin_audit_trigger(), fp_record_activity(uuid), fp_flag_enabled(text, uuid), fp_org_flags(uuid),
  fp_app_status(), fp_event_on_org(), fp_event_on_subscription(), fp_event_on_invoice(),
  fp_sub_mrr(text, text), fp_admin_overview(timestamptz, timestamptz) from public, anon;
grant execute on function fp_admin_role(), fp_admin_can(text), fp_admin_permissions(),
  fp_admin_role_permissions(text), fp_record_activity(uuid), fp_org_flags(uuid),
  fp_admin_overview(timestamptz, timestamptz) to authenticated;
grant execute on function fp_app_status() to anon, authenticated;

grant select, insert, update, delete on fp_admin_notes, fp_coupons, fp_platform_invoices, fp_support_tickets,
  fp_ticket_messages, fp_feature_flags, fp_feature_flag_overrides, fp_announcements, fp_message_templates,
  fp_platform_settings to authenticated;
grant select on fp_admin_audit, fp_daily_activity, fp_platform_events to authenticated;
grant select, insert, update, delete on fp_platform_admins to authenticated;
