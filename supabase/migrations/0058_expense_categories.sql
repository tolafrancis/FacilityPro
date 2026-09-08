-- 0058_expense_categories.sql
-- fp_finance_expenditures.category was free text defaulting to "Parts" —
-- an oversight from the Financial.tsx rebuild, not a deliberate choice: it
-- fragments cost reporting the same way a free-text vendor field did
-- ("Parts" vs "parts" vs "PARTS" become three different categories).
-- Same shape and admin/manager-managed pattern as fp_cost_centers, which
-- already lives on this same page.

create table fp_expense_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create index fp_expense_categories_org_idx on fp_expense_categories (org_id);

alter table fp_expense_categories enable row level security;

create policy expense_categories_select on fp_expense_categories for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
create policy expense_categories_write on fp_expense_categories for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create trigger trg_audit_expense_categories after insert or update or delete
  on fp_expense_categories for each row execute function fp_audit();

alter table fp_finance_expenditures
  add column category_id uuid references fp_expense_categories(id) on delete set null;

-- Seed a standard starter set per existing org so the dropdown isn't empty
-- on day one; admins can rename/add/remove from here same as any catalog.
insert into fp_expense_categories (org_id, name)
select o.id, c.name
from fp_organizations o
cross join (values ('Parts'), ('Labor'), ('Contracted services'), ('Utilities'), ('Equipment'), ('Other')) as c(name)
on conflict do nothing;
