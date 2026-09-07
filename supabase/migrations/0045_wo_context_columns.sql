-- 0045_wo_context_columns.sql
-- Audit finding (P1): converting a request into a work order silently drops
-- location, fault type, and severity — fp_work_orders had no columns to
-- receive them. It also had no way to record why a job was closed (failure
-- cause, completion code) or how much downtime it caused. This migration
-- adds all six as plain nullable columns — no behavior changes on its own,
-- the app wires them up in the same release.

alter table fp_work_orders
  add column if not exists location_id uuid references fp_locations(id) on delete set null,
  add column if not exists fault_type_id uuid references fp_fault_types(id) on delete set null,
  add column if not exists severity text,
  add column if not exists failure_code text,
  add column if not exists completion_code text,
  add column if not exists downtime_minutes int;

create index if not exists fp_work_orders_location_idx on fp_work_orders (location_id);
create index if not exists fp_work_orders_fault_type_idx on fp_work_orders (fault_type_id);
