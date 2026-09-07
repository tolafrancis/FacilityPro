-- 0047_inventory_transactions.sql
-- Audit finding: stock_balance changes happen as silent direct UPDATEs (a
-- technician issuing a part, an admin clicking "Restock") with no record of
-- why. This migration introduces a single append-only ledger as the *only*
-- writer of fp_parts.stock_balance, so every change — issue, receipt,
-- adjustment, cycle count — has a reason and an actor. It also gives a part
-- a preferred supplier and a category, both real foreign keys.

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------
create table fp_inventory_transactions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references fp_organizations(id) on delete cascade,
  part_id        uuid not null references fp_parts(id) on delete cascade,
  type           text not null check (type in ('issue','receipt','adjustment','cycle_count')),
  quantity_delta numeric not null,
  ref_table      text,
  ref_id         uuid,
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index fp_inventory_tx_part_idx on fp_inventory_transactions (part_id, created_at desc);
create index fp_inventory_tx_org_idx  on fp_inventory_transactions (org_id, created_at desc);

alter table fp_inventory_transactions enable row level security;

create policy inv_tx_select on fp_inventory_transactions for select to authenticated
  using ( fp_is_member(org_id) );

-- Direct client inserts are admin/manager only (restocks, corrections, cycle
-- counts). 'issue' rows are never inserted directly — they come only from
-- fp_consume_part() below, a SECURITY DEFINER trigger that bypasses RLS, so
-- an issue can only ever originate from a real fp_wo_parts row.
create policy inv_tx_insert on fp_inventory_transactions for insert to authenticated
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create trigger trg_audit_inventory_transactions after insert or update or delete
  on fp_inventory_transactions for each row execute function fp_audit();

-- The ledger is the single writer of stock_balance: every insert applies its
-- delta, whatever inserted it (client or trigger).
create or replace function fp_apply_inventory_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update fp_parts set stock_balance = stock_balance + new.quantity_delta where id = new.part_id;
  return new;
end;
$$;

create trigger trg_fp_apply_inventory_transaction
  after insert on fp_inventory_transactions
  for each row execute function fp_apply_inventory_transaction();

-- ---------------------------------------------------------------------------
-- fp_consume_part() now records an 'issue' in the ledger instead of touching
-- fp_parts directly — the ledger trigger above applies the actual decrement.
-- ---------------------------------------------------------------------------
create or replace function fp_consume_part()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into fp_inventory_transactions (org_id, part_id, type, quantity_delta, ref_table, ref_id, created_by)
  values (new.org_id, new.part_id, 'issue', -new.quantity, 'fp_wo_parts', new.id, new.created_by);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Part categories (same shape as fp_asset_types / fp_fault_types) + a
-- preferred vendor on a part.
-- ---------------------------------------------------------------------------
create table fp_part_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  name_i18n  jsonb not null,
  created_at timestamptz not null default now()
);

alter table fp_part_categories enable row level security;

create policy part_categories_select on fp_part_categories for select to authenticated
  using ( fp_is_member(org_id) );
create policy part_categories_write on fp_part_categories for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

alter table fp_parts
  add column preferred_vendor_id uuid references fp_vendors(id) on delete set null,
  add column category_id uuid references fp_part_categories(id) on delete set null;

create index fp_parts_vendor_idx on fp_parts (preferred_vendor_id);
create index fp_parts_category_idx on fp_parts (category_id);

-- ---------------------------------------------------------------------------
-- Backfill: every existing part's current stock_balance becomes its opening
-- ledger entry, so the ledger and the balance agree from day one. The
-- apply-trigger is disabled for this one insert only — these rows describe
-- a balance that's already correct; they must not be added on top of it.
-- ---------------------------------------------------------------------------
alter table fp_inventory_transactions disable trigger trg_fp_apply_inventory_transaction;

insert into fp_inventory_transactions (org_id, part_id, type, quantity_delta, note, created_at)
select org_id, id, 'adjustment', stock_balance, 'Opening balance (migration backfill)', created_at
from fp_parts
where stock_balance <> 0;

alter table fp_inventory_transactions enable trigger trg_fp_apply_inventory_transaction;
