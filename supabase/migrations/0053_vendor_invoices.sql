-- 0053_vendor_invoices.sql
-- Audit follow-up: procurement (0049) already tracks a PO and its receipts,
-- but nothing represents the vendor's actual invoice, so there was no way to
-- check a bill against what was ordered and what actually arrived before
-- paying it — the classic three-way match (PO ↔ receipt ↔ invoice). This
-- adds the invoice as its own record and links payments to it.
--
-- The match itself (does the invoice amount agree with the PO total? were
-- all lines fully received?) is computed in the UI from data already loaded
-- there (procurement lines + receipt lines), the same way Reports.tsx
-- computes MTBF/vendor-spend client-side — no new SQL function needed for
-- something that's really just a comparison of numbers already on screen.

create table fp_vendor_invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references fp_organizations(id) on delete cascade,
  procurement_id uuid references fp_finance_procurement(id) on delete set null,
  vendor_id      uuid references fp_vendors(id) on delete set null,
  invoice_number text,
  amount         numeric(14,2) not null default 0,
  invoice_date   date,
  status         text not null default 'pending' check (status in ('pending','matched','disputed','paid')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index fp_vendor_invoices_procurement_idx on fp_vendor_invoices (procurement_id);
create index fp_vendor_invoices_vendor_idx on fp_vendor_invoices (vendor_id);

create trigger trg_fp_vendor_invoices_touch
  before update on fp_vendor_invoices for each row execute function fp_touch_updated_at();

alter table fp_vendor_invoices enable row level security;

create policy vendor_invoices_select on fp_vendor_invoices for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
create policy vendor_invoices_write on fp_vendor_invoices for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create trigger trg_audit_vendor_invoices after insert or update or delete
  on fp_vendor_invoices for each row execute function fp_audit();

-- A payment now optionally settles a specific invoice, not just a PO.
alter table fp_finance_payments
  add column invoice_id uuid references fp_vendor_invoices(id) on delete set null;
