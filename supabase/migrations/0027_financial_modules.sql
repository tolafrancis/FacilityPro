-- 0027_financial_modules.sql

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table if not exists fp_finance_customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  name text not null,
  company text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fp_finance_procurement (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  title text not null,
  vendor text,
  amount numeric not null default 0,
  status text not null default 'rfq' check (status in ('rfq','po','received','approved')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fp_finance_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  description text not null,
  amount numeric not null default 0,
  method text not null default 'Manual transfer',
  reference text,
  status text not null default 'pending' check (status in ('pending','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fp_finance_expenditures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  description text not null,
  category text not null default 'Parts',
  amount numeric not null default 0,
  vendor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fp_finance_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  service text not null,
  unit text not null default 'hour',
  rate numeric not null default 0,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fp_finance_budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  period text not null default 'Monthly',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists fp_finance_customers_org_idx on fp_finance_customers(org_id, created_at desc);
create index if not exists fp_finance_procurement_org_idx on fp_finance_procurement(org_id, created_at desc);
create index if not exists fp_finance_payments_org_idx on fp_finance_payments(org_id, created_at desc);
create index if not exists fp_finance_expenditures_org_idx on fp_finance_expenditures(org_id, created_at desc);
create index if not exists fp_finance_rates_org_idx on fp_finance_rates(org_id, created_at desc);
create index if not exists fp_finance_budgets_org_idx on fp_finance_budgets(org_id, created_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table fp_finance_customers enable row level security;
alter table fp_finance_procurement enable row level security;
alter table fp_finance_payments enable row level security;
alter table fp_finance_expenditures enable row level security;
alter table fp_finance_rates enable row level security;
alter table fp_finance_budgets enable row level security;

-- ─── Policies: fp_finance_customers ──────────────────────────────────────────

drop policy if exists finance_customers_select on fp_finance_customers;
create policy finance_customers_select on fp_finance_customers for select to authenticated using (fp_is_member(org_id));

drop policy if exists finance_customers_insert on fp_finance_customers;
create policy finance_customers_insert on fp_finance_customers for insert to authenticated with check (fp_is_member(org_id));

drop policy if exists finance_customers_update on fp_finance_customers;
create policy finance_customers_update on fp_finance_customers for update to authenticated using (fp_is_member(org_id)) with check (fp_is_member(org_id));

drop policy if exists finance_customers_delete on fp_finance_customers;
create policy finance_customers_delete on fp_finance_customers for delete to authenticated using (fp_is_member(org_id));

-- ─── Policies: fp_finance_procurement ────────────────────────────────────────

drop policy if exists finance_procurement_select on fp_finance_procurement;
create policy finance_procurement_select on fp_finance_procurement for select to authenticated using (fp_is_member(org_id));

drop policy if exists finance_procurement_insert on fp_finance_procurement;
create policy finance_procurement_insert on fp_finance_procurement for insert to authenticated with check (fp_is_member(org_id));

drop policy if exists finance_procurement_update on fp_finance_procurement;
create policy finance_procurement_update on fp_finance_procurement for update to authenticated using (fp_is_member(org_id)) with check (fp_is_member(org_id));

drop policy if exists finance_procurement_delete on fp_finance_procurement;
create policy finance_procurement_delete on fp_finance_procurement for delete to authenticated using (fp_is_member(org_id));

-- ─── Policies: fp_finance_payments ───────────────────────────────────────────

drop policy if exists finance_payments_select on fp_finance_payments;
create policy finance_payments_select on fp_finance_payments for select to authenticated using (fp_is_member(org_id));

drop policy if exists finance_payments_insert on fp_finance_payments;
create policy finance_payments_insert on fp_finance_payments for insert to authenticated with check (fp_is_member(org_id));

drop policy if exists finance_payments_update on fp_finance_payments;
create policy finance_payments_update on fp_finance_payments for update to authenticated using (fp_is_member(org_id)) with check (fp_is_member(org_id));

drop policy if exists finance_payments_delete on fp_finance_payments;
create policy finance_payments_delete on fp_finance_payments for delete to authenticated using (fp_is_member(org_id));

-- ─── Policies: fp_finance_expenditures ───────────────────────────────────────

drop policy if exists finance_expenditures_select on fp_finance_expenditures;
create policy finance_expenditures_select on fp_finance_expenditures for select to authenticated using (fp_is_member(org_id));

drop policy if exists finance_expenditures_insert on fp_finance_expenditures;
create policy finance_expenditures_insert on fp_finance_expenditures for insert to authenticated with check (fp_is_member(org_id));

drop policy if exists finance_expenditures_update on fp_finance_expenditures;
create policy finance_expenditures_update on fp_finance_expenditures for update to authenticated using (fp_is_member(org_id)) with check (fp_is_member(org_id));

drop policy if exists finance_expenditures_delete on fp_finance_expenditures;
create policy finance_expenditures_delete on fp_finance_expenditures for delete to authenticated using (fp_is_member(org_id));

-- ─── Policies: fp_finance_rates ──────────────────────────────────────────────

drop policy if exists finance_rates_select on fp_finance_rates;
create policy finance_rates_select on fp_finance_rates for select to authenticated using (fp_is_member(org_id));

drop policy if exists finance_rates_insert on fp_finance_rates;
create policy finance_rates_insert on fp_finance_rates for insert to authenticated with check (fp_is_member(org_id));

drop policy if exists finance_rates_update on fp_finance_rates;
create policy finance_rates_update on fp_finance_rates for update to authenticated using (fp_is_member(org_id)) with check (fp_is_member(org_id));

drop policy if exists finance_rates_delete on fp_finance_rates;
create policy finance_rates_delete on fp_finance_rates for delete to authenticated using (fp_is_member(org_id));

-- ─── Policies: fp_finance_budgets ────────────────────────────────────────────

drop policy if exists finance_budgets_select on fp_finance_budgets;
create policy finance_budgets_select on fp_finance_budgets for select to authenticated using (fp_is_member(org_id));

drop policy if exists finance_budgets_insert on fp_finance_budgets;
create policy finance_budgets_insert on fp_finance_budgets for insert to authenticated with check (fp_is_member(org_id));

drop policy if exists finance_budgets_update on fp_finance_budgets;
create policy finance_budgets_update on fp_finance_budgets for update to authenticated using (fp_is_member(org_id)) with check (fp_is_member(org_id));

drop policy if exists finance_budgets_delete on fp_finance_budgets;
create policy finance_budgets_delete on fp_finance_budgets for delete to authenticated using (fp_is_member(org_id));
