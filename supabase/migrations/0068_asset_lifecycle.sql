-- 0068_asset_lifecycle.sql
-- Audit findings S1-H8 (assets/locations can't be edited, retired or safely
-- deleted) and S1-M1 (locations outside the site tree escape site
-- restrictions). Covered by supabase/security-tests/asset_lifecycle.sql.
--
--   * fp_assets.status is one of active / inactive / retired / disposed.
--     Retiring or disposing an asset deactivates its PM schedules, so no
--     more work orders are generated for it.
--   * An asset or location with history (requests, work orders, child
--     locations or assets placed in it) can't be hard-deleted: that used to
--     silently unlink the history. Retire the asset, or move things first.
--   * A location takes its site from its parent. In an organisation that
--     uses sites, every location must belong to one, so site-scoped users
--     never see work in "unplaced" locations.

-- ---------------------------------------------------------------------------
-- Asset status
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  update fp_assets set status = lower(btrim(status)) where status <> lower(btrim(status));
  update fp_assets set status = 'active'
    where status not in ('active', 'inactive', 'retired', 'disposed');
  get diagnostics n = row_count;
  if n > 0 then
    raise warning '0068: % asset(s) had an unknown status and were set to active.', n;
  end if;
end $$;

alter table fp_assets drop constraint if exists fp_assets_status_check;
alter table fp_assets add constraint fp_assets_status_check
  check (status in ('active', 'inactive', 'retired', 'disposed'));
alter table fp_assets add column if not exists retired_at timestamptz;

create or replace function fp_asset_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('retired', 'disposed') and old.status not in ('retired', 'disposed') then
    new.retired_at := now();
    update fp_pm_schedules set active = false where asset_id = new.id and active;
  elsif new.status in ('active', 'inactive') then
    new.retired_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_asset_status on fp_assets;
create trigger trg_fp_asset_status
  before update of status on fp_assets
  for each row when (old.status is distinct from new.status)
  execute function fp_asset_status_change();

-- ---------------------------------------------------------------------------
-- No hard delete of things with history
-- ---------------------------------------------------------------------------
create or replace function fp_asset_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Organisation deletion cascades.
  if not exists (select 1 from fp_organizations where id = old.org_id) then
    return old;
  end if;
  if exists (select 1 from fp_work_orders where asset_id = old.id)
     or exists (select 1 from fp_requests where asset_id = old.id) then
    raise exception 'This asset has work orders or requests. Retire it instead of deleting it, so its history is kept.'
      using errcode = 'P0001', hint = 'asset_has_history';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_fp_asset_delete_guard on fp_assets;
create trigger trg_fp_asset_delete_guard
  before delete on fp_assets
  for each row execute function fp_asset_delete_guard();

create or replace function fp_location_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from fp_organizations where id = old.org_id) then
    return old;
  end if;
  -- Children are checked first: deleting a building would otherwise
  -- cascade to its floors and rooms.
  if exists (select 1 from fp_locations where parent_id = old.id)
     or exists (select 1 from fp_assets where location_id = old.id)
     or exists (select 1 from fp_work_orders where location_id = old.id)
     or exists (select 1 from fp_requests where location_id = old.id) then
    raise exception 'This location still contains locations or assets, or has work history. Move or remove those first.'
      using errcode = 'P0001', hint = 'location_in_use';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_fp_location_delete_guard on fp_locations;
create trigger trg_fp_location_delete_guard
  before delete on fp_locations
  for each row execute function fp_location_delete_guard();

-- ---------------------------------------------------------------------------
-- Locations belong to the site tree
-- ---------------------------------------------------------------------------
create or replace function fp_location_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent fp_locations%rowtype;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A location cannot be its own parent.' using errcode = 'P0001';
    end if;
    select * into v_parent from fp_locations where id = new.parent_id;
    if v_parent.org_id is distinct from new.org_id then
      raise exception 'Parent location belongs to another organisation.' using errcode = '42501';
    end if;
    -- No cycles: the new parent may not sit below this location.
    if tg_op = 'UPDATE' and exists (
      with recursive up as (
        select id, parent_id from fp_locations where id = new.parent_id
        union all
        select l.id, l.parent_id from fp_locations l join up on l.id = up.parent_id
      ) select 1 from up where id = new.id) then
      raise exception 'A location cannot be moved inside itself.' using errcode = 'P0001';
    end if;
    new.site_id := v_parent.site_id;
  end if;

  if new.site_id is null and exists (select 1 from fp_sites where org_id = new.org_id) then
    raise exception 'Choose a site or a parent location for this location.'
      using errcode = 'P0001', hint = 'location_needs_site';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_location_site on fp_locations;
create trigger trg_fp_location_site
  before insert or update of parent_id, site_id on fp_locations
  for each row execute function fp_location_site();

-- Moving a location moves its descendants to the same site.
create or replace function fp_location_site_cascade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update fp_locations set site_id = new.site_id
    where parent_id = new.id and site_id is distinct from new.site_id;
  return null;
end;
$$;

drop trigger if exists trg_fp_location_site_cascade on fp_locations;
create trigger trg_fp_location_site_cascade
  after update of site_id on fp_locations
  for each row when (old.site_id is distinct from new.site_id)
  execute function fp_location_site_cascade();

-- Existing locations whose parent is in a site but they aren't.
do $$
declare n int;
begin
  with recursive fix as (
    select c.id, p.site_id
    from fp_locations c join fp_locations p on p.id = c.parent_id
    where c.site_id is distinct from p.site_id and p.site_id is not null
  )
  update fp_locations l set site_id = fix.site_id from fix where l.id = fix.id;
  get diagnostics n = row_count;
  if n > 0 then
    raise warning '0068: % location(s) were given their parent''s site.', n;
  end if;
  select count(*) into n from fp_locations l
    where l.site_id is null and exists (select 1 from fp_sites s where s.org_id = l.org_id);
  if n > 0 then
    raise warning '0068: % location(s) belong to no site in organisations that use sites; site-scoped users can see work placed there. Find them with: select id, org_id, name_i18n from fp_locations l where site_id is null and exists (select 1 from fp_sites s where s.org_id = l.org_id);', n;
  end if;
end $$;

revoke execute on function fp_asset_status_change(), fp_asset_delete_guard(), fp_location_delete_guard(),
  fp_location_site(), fp_location_site_cascade()
  from public, anon, authenticated;
