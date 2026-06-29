-- 0006_rls_policies.sql
-- Enable Row-Level Security on every table and define org-scoped, role-aware policies.
-- Helper functions fp_is_member / fp_has_role are SECURITY DEFINER, so calling them
-- inside policies does NOT recurse through RLS (they run as the function owner).

alter table fp_organizations enable row level security;
alter table fp_users_orgs   enable row level security;
alter table fp_sites        enable row level security;
alter table fp_locations    enable row level security;
alter table fp_asset_types  enable row level security;
alter table fp_assets       enable row level security;
alter table fp_fault_types  enable row level security;
alter table fp_requests     enable row level security;
alter table fp_work_orders  enable row level security;
alter table fp_invites      enable row level security;
alter table fp_audit_log    enable row level security;

-- ---------------------------------------------------------------------------
-- Organisations
-- (creation happens via fp_create_organization RPC, so no INSERT policy here)
-- ---------------------------------------------------------------------------
create policy org_select on fp_organizations for select to authenticated
  using ( fp_is_member(id) );
create policy org_update on fp_organizations for update to authenticated
  using ( fp_has_role(id, array['org_admin']) );

-- ---------------------------------------------------------------------------
-- Membership. Self-rows use a direct predicate (no recursion); admin/manager
-- visibility uses the SECURITY DEFINER helper.
-- ---------------------------------------------------------------------------
create policy uo_select_self on fp_users_orgs for select to authenticated
  using ( user_id = auth.uid()
          or fp_has_role(org_id, array['org_admin','manager','super_admin']) );
create policy uo_admin_insert on fp_users_orgs for insert to authenticated
  with check ( fp_has_role(org_id, array['org_admin']) );
create policy uo_admin_update on fp_users_orgs for update to authenticated
  using ( fp_has_role(org_id, array['org_admin']) );
create policy uo_admin_delete on fp_users_orgs for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin']) );
create policy uo_update_self_pref on fp_users_orgs for update to authenticated
  using ( user_id = auth.uid() );

-- ---------------------------------------------------------------------------
-- Config-like content (admin/manager manage; all members read)
-- ---------------------------------------------------------------------------
-- sites
create policy site_select on fp_sites for select to authenticated
  using ( fp_is_member(org_id) );
create policy site_write on fp_sites for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

-- locations
create policy loc_select on fp_locations for select to authenticated
  using ( fp_is_member(org_id) );
create policy loc_write on fp_locations for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

-- asset types
create policy at_select on fp_asset_types for select to authenticated
  using ( fp_is_member(org_id) );
create policy at_write on fp_asset_types for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

-- assets
create policy asset_select on fp_assets for select to authenticated
  using ( fp_is_member(org_id) );
create policy asset_write on fp_assets for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

-- fault types
create policy ft_select on fp_fault_types for select to authenticated
  using ( fp_is_member(org_id) );
create policy ft_write on fp_fault_types for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

-- ---------------------------------------------------------------------------
-- Requests: any member can report; admin/manager/technician can update
-- ---------------------------------------------------------------------------
create policy req_select on fp_requests for select to authenticated
  using ( fp_is_member(org_id) );
create policy req_insert on fp_requests for insert to authenticated
  with check ( fp_is_member(org_id) );
create policy req_update on fp_requests for update to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager','technician']) );

-- ---------------------------------------------------------------------------
-- Work orders: admin/manager manage; assigned technician can update own
-- ---------------------------------------------------------------------------
create policy wo_select on fp_work_orders for select to authenticated
  using ( fp_is_member(org_id) );
create policy wo_insert on fp_work_orders for insert to authenticated
  with check ( fp_has_role(org_id, array['org_admin','manager']) );
create policy wo_update on fp_work_orders for update to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager'])
          or assigned_to = auth.uid() );

-- ---------------------------------------------------------------------------
-- Invites: org admins manage. Acceptance is via fp_accept_invite RPC.
-- ---------------------------------------------------------------------------
create policy inv_select on fp_invites for select to authenticated
  using ( fp_has_role(org_id, array['org_admin']) );
create policy inv_write on fp_invites for all to authenticated
  using ( fp_has_role(org_id, array['org_admin']) )
  with check ( fp_has_role(org_id, array['org_admin']) );

-- ---------------------------------------------------------------------------
-- Audit log: read-only to admins/managers. Inserts come from SECURITY DEFINER
-- triggers, which bypass RLS.
-- ---------------------------------------------------------------------------
create policy audit_select on fp_audit_log for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
