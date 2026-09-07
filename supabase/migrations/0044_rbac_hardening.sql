-- 0044_rbac_hardening.sql
-- Audit finding (P0): several tables added in 0026/0027/0028 gate writes on
-- fp_is_member() only, the same check that admits an occupant/vendor/technician
-- login — instead of fp_has_role(['org_admin','manager']), the standard every
-- comparable CMMS table (fp_vendors, fp_parts, fp_pm_schedules, ...) already
-- uses. This migration brings those tables up to the same standard and adds
-- the audit trigger they were also missing.
--
-- Financial and contract data was also SELECT-able by every org member; that
-- is tightened to org_admin/manager here too. fp_attendance keeps open
-- self-check-in (INSERT) but no longer lets any member edit/delete a punch.
-- fp_device_connections (carries a broker password) drops from
-- ['org_admin','manager'] to admin-only, matching the device key policy.

-- ---------------------------------------------------------------------------
-- Financials: fp_finance_customers / _procurement / _payments / _expenditures
-- / _rates / _budgets — restrict SELECT + INSERT/UPDATE/DELETE to admin/manager.
-- ---------------------------------------------------------------------------
drop policy if exists finance_customers_select on fp_finance_customers;
create policy finance_customers_select on fp_finance_customers for select to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_customers_insert on fp_finance_customers;
create policy finance_customers_insert on fp_finance_customers for insert to authenticated
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_customers_update on fp_finance_customers;
create policy finance_customers_update on fp_finance_customers for update to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']))
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_customers_delete on fp_finance_customers;
create policy finance_customers_delete on fp_finance_customers for delete to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

drop policy if exists finance_procurement_select on fp_finance_procurement;
create policy finance_procurement_select on fp_finance_procurement for select to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_procurement_insert on fp_finance_procurement;
create policy finance_procurement_insert on fp_finance_procurement for insert to authenticated
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_procurement_update on fp_finance_procurement;
create policy finance_procurement_update on fp_finance_procurement for update to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']))
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_procurement_delete on fp_finance_procurement;
create policy finance_procurement_delete on fp_finance_procurement for delete to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

drop policy if exists finance_payments_select on fp_finance_payments;
create policy finance_payments_select on fp_finance_payments for select to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_payments_insert on fp_finance_payments;
create policy finance_payments_insert on fp_finance_payments for insert to authenticated
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_payments_update on fp_finance_payments;
create policy finance_payments_update on fp_finance_payments for update to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']))
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_payments_delete on fp_finance_payments;
create policy finance_payments_delete on fp_finance_payments for delete to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

drop policy if exists finance_expenditures_select on fp_finance_expenditures;
create policy finance_expenditures_select on fp_finance_expenditures for select to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_expenditures_insert on fp_finance_expenditures;
create policy finance_expenditures_insert on fp_finance_expenditures for insert to authenticated
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_expenditures_update on fp_finance_expenditures;
create policy finance_expenditures_update on fp_finance_expenditures for update to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']))
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_expenditures_delete on fp_finance_expenditures;
create policy finance_expenditures_delete on fp_finance_expenditures for delete to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

drop policy if exists finance_rates_select on fp_finance_rates;
create policy finance_rates_select on fp_finance_rates for select to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_rates_insert on fp_finance_rates;
create policy finance_rates_insert on fp_finance_rates for insert to authenticated
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_rates_update on fp_finance_rates;
create policy finance_rates_update on fp_finance_rates for update to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']))
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_rates_delete on fp_finance_rates;
create policy finance_rates_delete on fp_finance_rates for delete to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

drop policy if exists finance_budgets_select on fp_finance_budgets;
create policy finance_budgets_select on fp_finance_budgets for select to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_budgets_insert on fp_finance_budgets;
create policy finance_budgets_insert on fp_finance_budgets for insert to authenticated
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_budgets_update on fp_finance_budgets;
create policy finance_budgets_update on fp_finance_budgets for update to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']))
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists finance_budgets_delete on fp_finance_budgets;
create policy finance_budgets_delete on fp_finance_budgets for delete to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

-- ---------------------------------------------------------------------------
-- Vendor contracts/licenses/SLA policies: dollar figures and terms should not
-- be org-wide readable to an occupant or vendor-role login.
-- ---------------------------------------------------------------------------
drop policy if exists contracts_select on fp_contracts;
create policy contracts_select on fp_contracts for select to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

drop policy if exists licenses_select on fp_licenses;
create policy licenses_select on fp_licenses for select to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

drop policy if exists sla_select on fp_sla_policies;
create policy sla_select on fp_sla_policies for select to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

-- ---------------------------------------------------------------------------
-- Documents & permits: writable and (for permits) approvable by any member
-- today. Restrict writes to admin/manager; reads stay member-visible.
-- ---------------------------------------------------------------------------
drop policy if exists documents_insert on fp_documents;
create policy documents_insert on fp_documents for insert to authenticated
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists documents_update on fp_documents;
create policy documents_update on fp_documents for update to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']))
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists documents_delete on fp_documents;
create policy documents_delete on fp_documents for delete to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

drop policy if exists permits_insert on fp_permits;
create policy permits_insert on fp_permits for insert to authenticated
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists permits_update on fp_permits;
create policy permits_update on fp_permits for update to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']))
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists permits_delete on fp_permits;
create policy permits_delete on fp_permits for delete to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

-- ---------------------------------------------------------------------------
-- Attendance: self check-in/out stays open to any member; editing or deleting
-- someone else's punch (or your own, after the fact) is admin/manager only.
-- ---------------------------------------------------------------------------
drop policy if exists attendance_update on fp_attendance;
create policy attendance_update on fp_attendance for update to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']))
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists attendance_delete on fp_attendance;
create policy attendance_delete on fp_attendance for delete to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

-- ---------------------------------------------------------------------------
-- Workflow authoring: creating/editing/deleting an org-wide automation
-- (which can email, SMS, or reassign work orders) is admin/manager only.
-- Reads and run-history stay member-visible.
-- ---------------------------------------------------------------------------
drop policy if exists workflows_insert on fp_workflows;
create policy workflows_insert on fp_workflows for insert to authenticated
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists workflows_update on fp_workflows;
create policy workflows_update on fp_workflows for update to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']))
  with check (fp_has_role(org_id, array['org_admin','manager']));
drop policy if exists workflows_delete on fp_workflows;
create policy workflows_delete on fp_workflows for delete to authenticated
  using (fp_has_role(org_id, array['org_admin','manager']));

-- ---------------------------------------------------------------------------
-- IoT broker credentials: a device_connections row carries a plaintext broker
-- password. Reading it should be as narrow as the device key itself.
-- ---------------------------------------------------------------------------
drop policy if exists devconn_select on fp_device_connections;
create policy devconn_select on fp_device_connections for select to authenticated
  using (fp_has_role(org_id, array['org_admin']));

-- ---------------------------------------------------------------------------
-- Audit trail: attach the standard fp_audit() trigger to every table above
-- that didn't already have one. "Who changed what, when" should hold for
-- money and compliance records at least as strongly as for a work order.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_audit_finance_customers on fp_finance_customers;
create trigger trg_audit_finance_customers after insert or update or delete
  on fp_finance_customers for each row execute function fp_audit();

drop trigger if exists trg_audit_finance_procurement on fp_finance_procurement;
create trigger trg_audit_finance_procurement after insert or update or delete
  on fp_finance_procurement for each row execute function fp_audit();

drop trigger if exists trg_audit_finance_payments on fp_finance_payments;
create trigger trg_audit_finance_payments after insert or update or delete
  on fp_finance_payments for each row execute function fp_audit();

drop trigger if exists trg_audit_finance_expenditures on fp_finance_expenditures;
create trigger trg_audit_finance_expenditures after insert or update or delete
  on fp_finance_expenditures for each row execute function fp_audit();

drop trigger if exists trg_audit_finance_rates on fp_finance_rates;
create trigger trg_audit_finance_rates after insert or update or delete
  on fp_finance_rates for each row execute function fp_audit();

drop trigger if exists trg_audit_finance_budgets on fp_finance_budgets;
create trigger trg_audit_finance_budgets after insert or update or delete
  on fp_finance_budgets for each row execute function fp_audit();

drop trigger if exists trg_audit_documents on fp_documents;
create trigger trg_audit_documents after insert or update or delete
  on fp_documents for each row execute function fp_audit();

drop trigger if exists trg_audit_permits on fp_permits;
create trigger trg_audit_permits after insert or update or delete
  on fp_permits for each row execute function fp_audit();

drop trigger if exists trg_audit_attendance on fp_attendance;
create trigger trg_audit_attendance after insert or update or delete
  on fp_attendance for each row execute function fp_audit();
