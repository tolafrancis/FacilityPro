-- 0079_onboarding_and_dashboard.sql
-- Sign-up / onboarding redesign and the new dashboard.
-- Covered by supabase/security-tests/onboarding.sql.
--
--   * fp_organizations.industry (chosen at onboarding) and logo_path.
--   * Bucket fp-org-logos: organisation logos, publicly readable (they
--     appear in the app and on printed job sheets), 2 MB, raster images only
--     (no SVG: a public SVG can carry script). Only the organisation's admins
--     can add or remove files, and only under their own "{org_id}/" folder.
--   * fp_dashboard_kpis adds the dashboard's figures: tasks, pending tasks,
--     assets, tasks completed this week, faults reported / resolved this
--     week, fault categories (30 days), and the setup checklist counts.
--     Existing keys are unchanged. Still security invoker: every count is
--     limited by the caller's RLS.

alter table fp_organizations
  add column if not exists industry  text,
  add column if not exists logo_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fp_organizations_industry_check') then
    alter table fp_organizations add constraint fp_organizations_industry_check check (industry is null or industry in (
      'manufacturing','oil_gas','health_care','property_management','facility_management',
      'hospitality','religious','government','fleet_management','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fp_organizations_logo_path_check') then
    -- The logo must live in the organisation's own folder of the logo bucket.
    alter table fp_organizations add constraint fp_organizations_logo_path_check
      check (logo_path is null or (logo_path like id::text || '/%' and length(logo_path) <= 200));
  end if;
end $$;

-- Org admins may set these (0059 grants updates column by column; RLS still
-- limits updates to the organisation's admins).
grant update (industry, logo_path) on fp_organizations to authenticated;

-- ---------------------------------------------------------------------------
-- Logo storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fp-org-logos', 'fp-org-logos', true)
on conflict (id) do update set public = true;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
      set file_size_limit = 2097152,
          allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
      where id = 'fp-org-logos';
  end if;
end $$;

drop policy if exists "fp_org_logos insert" on storage.objects;
drop policy if exists "fp_org_logos delete" on storage.objects;
create policy "fp_org_logos insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'fp-org-logos' and fp_has_role(fp_storage_org(name), array['org_admin']) );
create policy "fp_org_logos delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'fp-org-logos' and fp_has_role(fp_storage_org(name), array['org_admin']) );

-- ---------------------------------------------------------------------------
-- Dashboard figures
-- ---------------------------------------------------------------------------
create or replace function fp_dashboard_kpis(p_org uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'open_requests', (select count(*) from fp_requests
                      where org_id = p_org and status not in ('resolved', 'closed', 'rejected')),
    'overdue',       (select count(*) from fp_work_orders
                      where org_id = p_org and due_at < now() and status not in ('resolved', 'verified', 'closed')),
    'in_progress',   (select count(*) from fp_work_orders where org_id = p_org and status = 'in_progress'),
    'resolved_30d',  (select count(*) from fp_work_orders
                      where org_id = p_org and resolved_at > now() - interval '30 days'),
    -- 0079
    'tasks',         (select count(*) from fp_work_orders where org_id = p_org),
    'pending_tasks', (select count(*) from fp_work_orders
                      where org_id = p_org and status not in ('resolved', 'verified', 'closed')),
    'completed_7d',  (select count(*) from fp_work_orders
                      where org_id = p_org and resolved_at > now() - interval '7 days'),
    'assets',        (select count(*) from fp_assets where org_id = p_org and status = 'active'),
    'faults_7d',     (select count(*) from fp_requests
                      where org_id = p_org and created_at > now() - interval '7 days'),
    'resolved_7d',   (select count(*) from fp_requests
                      where org_id = p_org and created_at > now() - interval '7 days'
                        and status in ('resolved', 'closed')),
    'categories',    coalesce((
                       select jsonb_agg(jsonb_build_object('fault_type_id', c.fault_type_id, 'count', c.n) order by c.n desc)
                       from (select fault_type_id, count(*) as n from fp_requests
                             where org_id = p_org and created_at > now() - interval '30 days'
                             group by fault_type_id order by count(*) desc limit 5) c), '[]'::jsonb),
    'setup', jsonb_build_object(
      'members',   (select count(*) from fp_users_orgs where org_id = p_org),
      'invites',   (select count(*) from fp_invites where org_id = p_org),
      'assets',    (select count(*) from fp_assets where org_id = p_org),
      'parts',     (select count(*) from fp_parts where org_id = p_org),
      'locations', (select count(*) from fp_locations where org_id = p_org))
  );
$$;

grant execute on function fp_dashboard_kpis(uuid) to authenticated;
