-- 0054_site_scoped_roles.sql
-- Audit finding: a role is org-wide only — a manager assigned to run one
-- site can read and write every other site's assets, locations, requests,
-- and work orders in the same org. This adds an optional site-restriction
-- layer: fp_user_sites records which sites a member is confined to. A
-- member with NO rows here is unrestricted (today's behavior, unchanged) —
-- this is additive and opt-in per member, so an org that never configures
-- it sees no difference at all. org_admin is always unrestricted regardless
-- of any rows here, matching every other admin-bypass in this schema.

create table fp_user_sites (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id  uuid not null references fp_organizations(id) on delete cascade,
  site_id uuid not null references fp_sites(id) on delete cascade,
  primary key (user_id, org_id, site_id)
);

create index fp_user_sites_org_idx on fp_user_sites (org_id, site_id);

alter table fp_user_sites enable row level security;

-- Members can see their own restrictions (so the UI can show "you're
-- scoped to X"); admins/managers can see everyone's, for managing them.
create policy user_sites_select on fp_user_sites for select to authenticated
  using ( user_id = auth.uid() or fp_has_role(org_id, array['org_admin','manager']) );
-- Assigning who can see what is an admin-only decision.
create policy user_sites_write on fp_user_sites for all to authenticated
  using ( fp_has_role(org_id, array['org_admin']) )
  with check ( fp_has_role(org_id, array['org_admin']) );

create trigger trg_audit_user_sites after insert or update or delete
  on fp_user_sites for each row execute function fp_audit();

-- ---------------------------------------------------------------------------
-- fp_has_site_access(org, site): true when the record isn't site-tagged,
-- the caller is an org_admin, the caller has no site restrictions configured
-- at all (the default, unrestricted case), or the caller is explicitly
-- granted that site. SECURITY DEFINER so it can read fp_user_sites without
-- recursing through this function's own callers.
-- ---------------------------------------------------------------------------
create or replace function fp_has_site_access(target_org uuid, target_site uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    target_site is null
    or fp_has_role(target_org, array['org_admin'])
    or not exists (select 1 from fp_user_sites where user_id = auth.uid() and org_id = target_org)
    or exists (
      select 1 from fp_user_sites
      where user_id = auth.uid() and org_id = target_org and site_id = target_site
    );
$$;

-- A location's site, for tables that reference a location rather than a
-- site directly. Null in, null out — an untagged location is visible to
-- everyone rather than accidentally hidden from every site-scoped member.
create or replace function fp_location_site(p_location uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select site_id from fp_locations where id = p_location;
$$;

-- ---------------------------------------------------------------------------
-- Retrofit: locations, assets, requests, work orders — the operational core
-- a site-scoped member would actually need confined to their own site(s).
-- Parts, vendors, and financial data stay org-wide (typically shared across
-- sites in practice) and are not touched here.
-- ---------------------------------------------------------------------------
drop policy if exists loc_select on fp_locations;
create policy loc_select on fp_locations for select to authenticated
  using ( fp_is_member(org_id) and fp_has_site_access(org_id, site_id) );
drop policy if exists loc_write on fp_locations;
create policy loc_write on fp_locations for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) and fp_has_site_access(org_id, site_id) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) and fp_has_site_access(org_id, site_id) );

drop policy if exists asset_select on fp_assets;
create policy asset_select on fp_assets for select to authenticated
  using ( fp_is_member(org_id) and fp_has_site_access(org_id, fp_location_site(location_id)) );
drop policy if exists asset_write on fp_assets;
create policy asset_write on fp_assets for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) and fp_has_site_access(org_id, fp_location_site(location_id)) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) and fp_has_site_access(org_id, fp_location_site(location_id)) );

drop policy if exists req_select on fp_requests;
create policy req_select on fp_requests for select to authenticated
  using ( fp_is_member(org_id) and fp_has_site_access(org_id, fp_location_site(location_id)) );
drop policy if exists req_insert on fp_requests;
create policy req_insert on fp_requests for insert to authenticated
  with check ( fp_is_member(org_id) and fp_has_site_access(org_id, fp_location_site(location_id)) );
drop policy if exists req_update on fp_requests;
create policy req_update on fp_requests for update to authenticated
  using (
    fp_has_role(org_id, array['org_admin','manager','technician'])
    and fp_has_site_access(org_id, fp_location_site(location_id))
  );

drop policy if exists wo_select on fp_work_orders;
create policy wo_select on fp_work_orders for select to authenticated
  using ( fp_is_member(org_id) and fp_has_site_access(org_id, fp_location_site(location_id)) );
drop policy if exists wo_insert on fp_work_orders;
create policy wo_insert on fp_work_orders for insert to authenticated
  with check (
    fp_has_role(org_id, array['org_admin','manager'])
    and fp_has_site_access(org_id, fp_location_site(location_id))
  );
drop policy if exists wo_update on fp_work_orders;
-- An assignee can always update their own work order, site restriction or
-- not — being assigned the job is itself the authorization.
create policy wo_update on fp_work_orders for update to authenticated
  using (
    (fp_has_role(org_id, array['org_admin','manager']) and fp_has_site_access(org_id, fp_location_site(location_id)))
    or assigned_to = auth.uid()
  );
