-- 0049_procurement.sql
-- Audit finding (P0): "procurement" was one flat row — a free-text vendor
-- name, an amount, and a status enum. No PO number, no line items, no
-- receiving step, so goods received never touched inventory. This migration
-- adds a real vendor FK, a PO numbering scheme, line items against the parts
-- catalog, and a receiving flow that posts into the inventory ledger from
-- 0047 — the same "single writer of stock_balance" the rest of the app uses.

-- ---------------------------------------------------------------------------
-- fp_finance_procurement: add a real vendor link, cost center, and PO number.
-- The old free-text `vendor` column stays as a legacy label for rows created
-- before this migration; new rows are created with vendor_id set instead.
-- ---------------------------------------------------------------------------
alter table fp_finance_procurement
  add column vendor_id uuid references fp_vendors(id) on delete set null,
  add column cost_center_id uuid references fp_cost_centers(id) on delete set null,
  add column po_number text;

create unique index fp_finance_procurement_po_number_idx
  on fp_finance_procurement (org_id, po_number) where po_number is not null;

-- Atomic per-org PO sequence, same "counter table behind a definer function"
-- shape as fp_org_members / fp_accept_invite use for other bootstrap needs.
create table fp_po_counters (
  org_id   uuid primary key references fp_organizations(id) on delete cascade,
  next_seq int not null default 1
);

alter table fp_po_counters enable row level security;
-- No policies: touched only by fp_next_po_number() (SECURITY DEFINER), which
-- bypasses RLS — mirrors fp_notification_outbox's "definer-only" table.

create or replace function fp_next_po_number(p_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into fp_po_counters (org_id, next_seq) values (p_org, 2)
    on conflict (org_id) do update set next_seq = fp_po_counters.next_seq + 1
    returning next_seq - 1 into v_seq;
  return 'PO-' || lpad(v_seq::text, 6, '0');
end;
$$;

grant execute on function fp_next_po_number(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Line items: a PO line either points at a catalog part (so receiving can
-- post to inventory) or is a free-text service/description with no part.
-- ---------------------------------------------------------------------------
create table fp_procurement_lines (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references fp_organizations(id) on delete cascade,
  procurement_id uuid not null references fp_finance_procurement(id) on delete cascade,
  part_id        uuid references fp_parts(id) on delete set null,
  description    text not null,
  quantity       numeric not null check (quantity > 0),
  unit_cost      numeric(14,2) not null default 0,
  created_at     timestamptz not null default now()
);

create index fp_procurement_lines_po_idx on fp_procurement_lines (procurement_id);

-- fp_finance_procurement.amount becomes a real rollup of its lines, the same
-- "trigger-maintained total" pattern as fp_work_orders.cost — no more typing
-- a dollar figure that has no relationship to what was actually ordered.
create or replace function fp_recalc_procurement_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po_id uuid;
  v_total numeric;
begin
  v_po_id := coalesce(new.procurement_id, old.procurement_id);
  select coalesce(sum(quantity * unit_cost), 0) into v_total
    from fp_procurement_lines where procurement_id = v_po_id;
  update fp_finance_procurement set amount = v_total where id = v_po_id;
  return coalesce(new, old);
end;
$$;

create trigger trg_fp_recalc_procurement_amount
  after insert or update or delete on fp_procurement_lines
  for each row execute function fp_recalc_procurement_amount();

-- ---------------------------------------------------------------------------
-- Receiving: one receipt event per delivery, one receipt line per PO line
-- received in that event. Receiving a line that points at a part posts a
-- 'receipt' row into the inventory ledger, which is the ledger's own trigger
-- applying the stock increase — receiving never touches fp_parts directly.
-- ---------------------------------------------------------------------------
create table fp_procurement_receipts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references fp_organizations(id) on delete cascade,
  procurement_id uuid not null references fp_finance_procurement(id) on delete cascade,
  received_by    uuid references auth.users(id) on delete set null,
  received_at    timestamptz not null default now(),
  note           text,
  created_at     timestamptz not null default now()
);

create table fp_procurement_receipt_lines (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references fp_organizations(id) on delete cascade,
  receipt_id          uuid not null references fp_procurement_receipts(id) on delete cascade,
  procurement_line_id uuid not null references fp_procurement_lines(id) on delete cascade,
  quantity_received   numeric not null check (quantity_received > 0),
  created_at          timestamptz not null default now()
);

create index fp_procurement_receipts_po_idx on fp_procurement_receipts (procurement_id);
create index fp_procurement_receipt_lines_receipt_idx on fp_procurement_receipt_lines (receipt_id);
create index fp_procurement_receipt_lines_line_idx on fp_procurement_receipt_lines (procurement_line_id);

create or replace function fp_receive_procurement_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part_id uuid;
  v_org_id  uuid;
begin
  select pl.part_id, pl.org_id into v_part_id, v_org_id
    from fp_procurement_lines pl where pl.id = new.procurement_line_id;

  if v_part_id is not null then
    insert into fp_inventory_transactions (org_id, part_id, type, quantity_delta, ref_table, ref_id, created_by)
    values (v_org_id, v_part_id, 'receipt', new.quantity_received, 'fp_procurement_receipt_lines', new.id, auth.uid());
  end if;

  return new;
end;
$$;

create trigger trg_fp_receive_procurement_line
  after insert on fp_procurement_receipt_lines
  for each row execute function fp_receive_procurement_line();

-- ---------------------------------------------------------------------------
-- Payments: link to the vendor and the PO/invoice they settle, so accounts
-- payable can actually reconcile instead of being a bare description string.
-- ---------------------------------------------------------------------------
alter table fp_finance_payments
  add column procurement_id uuid references fp_finance_procurement(id) on delete set null,
  add column vendor_id uuid references fp_vendors(id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS + audit, matching the admin/manager-only standard the rest of the
-- financial module now uses (0044_rbac_hardening.sql).
-- ---------------------------------------------------------------------------
alter table fp_procurement_lines enable row level security;
alter table fp_procurement_receipts enable row level security;
alter table fp_procurement_receipt_lines enable row level security;

create policy procurement_lines_select on fp_procurement_lines for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
create policy procurement_lines_write on fp_procurement_lines for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy procurement_receipts_select on fp_procurement_receipts for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
create policy procurement_receipts_write on fp_procurement_receipts for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy procurement_receipt_lines_select on fp_procurement_receipt_lines for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
create policy procurement_receipt_lines_write on fp_procurement_receipt_lines for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create trigger trg_audit_procurement_lines after insert or update or delete
  on fp_procurement_lines for each row execute function fp_audit();
create trigger trg_audit_procurement_receipts after insert or update or delete
  on fp_procurement_receipts for each row execute function fp_audit();
create trigger trg_audit_procurement_receipt_lines after insert or update or delete
  on fp_procurement_receipt_lines for each row execute function fp_audit();
