-- 0022_billing.sql
-- Subscription billing. Plans are a global catalogue (each plan carries its own
-- PayPal payment link, pasteable from the admin UI). Each org has one
-- subscription row pointing at a plan. Activation is manual for the paste-a-link
-- model; a PayPal webhook could automate it later.

create table fp_plans (
  code        text primary key,
  name_i18n   jsonb not null,
  price       numeric not null default 0,
  currency    text not null default 'USD',
  interval    text not null default 'month' check (interval in ('month','year')),
  limits      jsonb not null default '{}'::jsonb,   -- { assets, members, sites }; omit = unlimited
  payment_url text,                                  -- PayPal link, pasted when ready
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table fp_subscriptions (
  org_id               uuid primary key references fp_organizations(id) on delete cascade,
  plan_code            text references fp_plans(code) on delete set null,
  status               text not null default 'active'
                         check (status in ('active','pending','past_due','canceled','trialing')),
  provider             text,                          -- 'paypal' | 'manual'
  current_period_start timestamptz,
  current_period_end   timestamptz,
  note                 text,
  updated_at           timestamptz not null default now()
);

create trigger trg_fp_plans_touch
  before update on fp_plans for each row execute function fp_touch_updated_at();
create trigger trg_fp_subscriptions_touch
  before update on fp_subscriptions for each row execute function fp_touch_updated_at();

create trigger trg_audit_subscriptions after insert or update or delete
  on fp_subscriptions for each row execute function fp_audit();

-- "Is the current user an org_admin of any org?" — gates editing the global
-- plan catalogue. SECURITY DEFINER to avoid RLS recursion on fp_users_orgs.
create or replace function fp_is_any_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from fp_users_orgs
    where user_id = auth.uid() and role = 'org_admin'
  );
$$;

alter table fp_plans         enable row level security;
alter table fp_subscriptions enable row level security;

-- Plans: everyone can read; any org admin can manage the catalogue.
create policy plans_select on fp_plans for select to authenticated
  using ( true );
create policy plans_write on fp_plans for all to authenticated
  using ( fp_is_any_admin() )
  with check ( fp_is_any_admin() );

-- Subscriptions: members read their org's; org admins manage it.
create policy subs_select on fp_subscriptions for select to authenticated
  using ( fp_is_member(org_id) );
create policy subs_write on fp_subscriptions for all to authenticated
  using ( fp_has_role(org_id, array['org_admin']) )
  with check ( fp_has_role(org_id, array['org_admin']) );

-- Seed a starter catalogue. Payment links are left blank to paste in later.
insert into fp_plans (code, name_i18n, price, currency, interval, limits, sort) values
  ('free',     '{"en":"Free","vi":"Miễn phí"}'::jsonb,        0,  'USD', 'month', '{"assets":25,"members":3,"sites":1}'::jsonb,  0),
  ('pro',      '{"en":"Pro","vi":"Pro"}'::jsonb,              29,  'USD', 'month', '{"assets":250,"members":15,"sites":5}'::jsonb, 1),
  ('business', '{"en":"Business","vi":"Doanh nghiệp"}'::jsonb, 99,  'USD', 'month', '{}'::jsonb,                                    2)
on conflict (code) do nothing;
