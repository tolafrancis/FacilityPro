-- 0081: tenants (the 'occupant' role) see only their own requests.
--
-- Until now every member of an organisation could read all of its requests,
-- work orders, assets, parts, vendors and the rest of the maintenance data,
-- so a tenant account could read other tenants' fault reports. From here:
--
--   * Requests: an occupant reads only the requests they created, and a
--     request they create is recorded as theirs (created_by = themselves).
--   * Request photos (fp_media, and the files through the storage policy,
--     which checks fp_media): only those of their own requests.
--   * No access for occupants to the staff side: work orders and their
--     labour/parts, assets and asset types, parts, inventory, vendors,
--     meters, PM schedules, checklists, permits, approvals, attendance,
--     assignment rules, workflows, device and telemetry data, subscriptions.
--   * Still readable, because the tenant screens use them: the organisation,
--     sites, locations, fault types, announcements, desk/facility bookings,
--     surveys, documents shared with everyone.
--   * Announcements (fp_broadcasts) can no longer be posted, edited or
--     deleted by occupants.
--
-- Staff, and the 'vendor' role, keep their current access. Helper:
-- fp_my_occupant_org_ids() lists the organisations where the caller is an
-- occupant; policies use "org_id not in (select …)" so it runs once per
-- query, not once per row (as fp_my_org_ids does, 0069).
-- Covered by supabase/security-tests/occupant_scope.sql.

create or replace function fp_my_occupant_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from fp_users_orgs where user_id = auth.uid() and role = 'occupant';
$$;

revoke execute on function fp_my_occupant_org_ids() from public, anon;
grant execute on function fp_my_occupant_org_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Requests: an occupant's own only
-- ---------------------------------------------------------------------------
drop policy if exists req_select on fp_requests;
create policy req_select on fp_requests for select to authenticated
  using ( org_id in (select fp_my_org_ids())
          and (location_id is null or location_id not in (select fp_hidden_location_ids()))
          and (org_id not in (select fp_my_occupant_org_ids()) or created_by = auth.uid()) );

drop policy if exists req_insert on fp_requests;
create policy req_insert on fp_requests for insert to authenticated
  with check ( fp_is_member(org_id) and fp_has_site_access(org_id, fp_location_site(location_id))
               and (org_id not in (select fp_my_occupant_org_ids()) or created_by = auth.uid()) );

-- Photos: an occupant sees those of their own requests (the request lookup
-- runs under the policy above).
drop policy if exists media_select on fp_media;
create policy media_select on fp_media for select to authenticated
  using ( fp_is_member(org_id)
          and (org_id not in (select fp_my_occupant_org_ids())
               or (request_id is not null
                   and exists (select 1 from fp_requests r where r.id = fp_media.request_id))) );

-- ---------------------------------------------------------------------------
-- Work orders: none for occupants
-- ---------------------------------------------------------------------------
drop policy if exists wo_select on fp_work_orders;
create policy wo_select on fp_work_orders for select to authenticated
  using ( org_id in (select fp_my_org_ids())
          and (location_id is null or location_id not in (select fp_hidden_location_ids()))
          and org_id not in (select fp_my_occupant_org_ids()) );

drop policy if exists asset_select on fp_assets;
create policy asset_select on fp_assets for select to authenticated
  using ( org_id in (select fp_my_org_ids())
          and (location_id is null or location_id not in (select fp_hidden_location_ids()))
          and org_id not in (select fp_my_occupant_org_ids()) );

-- ---------------------------------------------------------------------------
-- Other staff data readable by any member until now: members who are not
-- occupants. Each keeps its policy name.
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('fp_approvals',              'appr_select'),
      ('fp_asset_types',            'at_select'),
      ('fp_assignment_rules',       'ar_select'),
      ('fp_attendance',             'attendance_select'),
      ('fp_checklist_items',        'clitem_select'),
      ('fp_checklist_runs',         'clrun_select'),
      ('fp_checklist_templates',    'cltpl_select'),
      ('fp_inventory_transactions', 'inv_tx_select'),
      ('fp_meter_readings',         'readings_select'),
      ('fp_meters',                 'meters_select'),
      ('fp_part_categories',        'part_categories_select'),
      ('fp_parts',                  'parts_select'),
      ('fp_permits',                'permits_select'),
      ('fp_pm_required_parts',      'pm_required_parts_select'),
      ('fp_pm_schedules',           'pm_select'),
      ('fp_subscriptions',          'subs_select'),
      ('fp_telemetry',              'tele_select'),
      ('fp_telemetry_hourly',       'tele_hourly_select'),
      ('fp_vendors',                'vendors_select'),
      ('fp_wo_labor',               'wo_labor_select'),
      ('fp_wo_parts',               'wop_select'),
      ('fp_workflows',              'workflows_select')
    ) as v(tbl, pol)
  loop
    execute format('drop policy if exists %I on %I', t.pol, t.tbl);
    execute format(
      'create policy %I on %I for select to authenticated
         using ( fp_is_member(org_id) and org_id not in (select fp_my_occupant_org_ids()) )',
      t.pol, t.tbl);
  end loop;
end $$;

-- Device readings keep their site check.
drop policy if exists dp_select on fp_device_data_points;
create policy dp_select on fp_device_data_points for select to authenticated
  using ( fp_is_member(org_id) and fp_has_site_access(org_id, fp_device_site(device_id))
          and org_id not in (select fp_my_occupant_org_ids()) );
drop policy if exists latest_select on fp_device_latest;
create policy latest_select on fp_device_latest for select to authenticated
  using ( fp_is_member(org_id) and fp_has_site_access(org_id, fp_device_site(device_id))
          and org_id not in (select fp_my_occupant_org_ids()) );

-- Workflow history and queue: read and written through the workflow's org.
do $$
declare
  t text;
begin
  foreach t in array array['fp_workflow_queue', 'fp_workflow_runs', 'fp_workflow_versions'] loop
    execute format('drop policy if exists %I on %I', replace(t, 'fp_', '') || '_select', t);
    execute format(
      'create policy %I on %I for select to authenticated
         using ( exists (select 1 from fp_workflows w where w.id = %I.workflow_id
                         and fp_is_member(w.org_id) and w.org_id not in (select fp_my_occupant_org_ids())) )',
      replace(t, 'fp_', '') || '_select', t, t);
    execute format('drop policy if exists %I on %I', replace(t, 'fp_', '') || '_insert', t);
    execute format(
      'create policy %I on %I for insert to authenticated
         with check ( exists (select 1 from fp_workflows w where w.id = %I.workflow_id
                              and fp_is_member(w.org_id) and w.org_id not in (select fp_my_occupant_org_ids())) )',
      replace(t, 'fp_', '') || '_insert', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Announcements: occupants read them, staff write them
-- ---------------------------------------------------------------------------
drop policy if exists broadcasts_insert on fp_broadcasts;
create policy broadcasts_insert on fp_broadcasts for insert to authenticated
  with check ( fp_is_member(org_id) and org_id not in (select fp_my_occupant_org_ids()) );
drop policy if exists broadcasts_update on fp_broadcasts;
create policy broadcasts_update on fp_broadcasts for update to authenticated
  using ( fp_is_member(org_id) and org_id not in (select fp_my_occupant_org_ids()) )
  with check ( fp_is_member(org_id) and org_id not in (select fp_my_occupant_org_ids()) );
drop policy if exists broadcasts_delete on fp_broadcasts;
create policy broadcasts_delete on fp_broadcasts for delete to authenticated
  using ( fp_is_member(org_id) and org_id not in (select fp_my_occupant_org_ids()) );
