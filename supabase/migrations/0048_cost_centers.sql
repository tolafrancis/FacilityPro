-- 0048_cost_centers.sql
-- Cost centers: lets spend (budgets, expenditures, and eventually work
-- orders) attribute to a department/budget line, closing the gap between
-- "we have a budget" and "who actually spent against it." Same shape and RLS
-- as fp_vendors.

create table fp_cost_centers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  name       text not null,
  code       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fp_cost_centers_org_idx on fp_cost_centers (org_id);

create trigger trg_fp_cost_centers_touch
  before update on fp_cost_centers for each row execute function fp_touch_updated_at();

alter table fp_cost_centers enable row level security;

create policy cost_centers_select on fp_cost_centers for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
create policy cost_centers_write on fp_cost_centers for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create trigger trg_audit_cost_centers after insert or update or delete
  on fp_cost_centers for each row execute function fp_audit();

alter table fp_finance_budgets
  add column cost_center_id uuid references fp_cost_centers(id) on delete set null;
alter table fp_finance_expenditures
  add column cost_center_id uuid references fp_cost_centers(id) on delete set null;
alter table fp_work_orders
  add column cost_center_id uuid references fp_cost_centers(id) on delete set null;
