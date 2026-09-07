-- 0050_wo_vendor_and_expenditure_links.sql
-- Audit finding (P1): a work order has no way to record that a job is
-- contracted out to an external vendor, and an expenditure has no link back
-- to the vendor, work order, or asset it was actually spent on — vendor was
-- a free-text column even after 0049 fixed the same problem on procurement.
-- This migration closes both.

alter table fp_work_orders
  add column vendor_id uuid references fp_vendors(id) on delete set null;

create index fp_work_orders_vendor_idx on fp_work_orders (vendor_id);

-- The old free-text `vendor` column on expenditures stays for legacy rows;
-- new rows use vendor_id. work_order_id / asset_id let a cost roll up onto
-- the thing it was actually spent on, closing the gap Reports/Dashboard need
-- for a real cost-per-asset or cost-per-work-order figure.
alter table fp_finance_expenditures
  add column vendor_id uuid references fp_vendors(id) on delete set null,
  add column work_order_id uuid references fp_work_orders(id) on delete set null,
  add column asset_id uuid references fp_assets(id) on delete set null;

create index fp_finance_expenditures_wo_idx on fp_finance_expenditures (work_order_id);
create index fp_finance_expenditures_asset_idx on fp_finance_expenditures (asset_id);
