-- 0069_performance.sql
-- Audit findings S6-H1 (Dashboard/Reports pull whole tables into the browser
-- and silently stop at PostgREST's 1000-row cap), S6-M1 (per-row RLS cost),
-- S6-M2 (missing indexes) and S6-M3 (scheduled-workflow dedupe lookups).
-- Covered by supabase/security-tests/performance.sql.
--
--   * fp_dashboard_kpis / fp_report_kpis compute the numbers in the
--     database. They are SECURITY INVOKER: they see exactly what the caller's
--     RLS lets them see, so an occupant's dashboard counts only their own
--     requests, as before.
--   * fp_has_site_access checks the common case (no site restrictions) first.
--   * Indexes for the lookups the app and jobs actually do.

-- ---------------------------------------------------------------------------
-- KPIs
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
                      where org_id = p_org and resolved_at > now() - interval '30 days')
  );
$$;

-- Filters mirror the Reports page: date range on created_at (whole days in
-- the organisation's time zone), location, technician, priority.
create or replace function fp_report_kpis(
  p_org        uuid,
  p_from       date default null,
  p_to         date default null,
  p_location   uuid default null,
  p_technician uuid default null,
  p_priority   text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz    text;
  v_from  timestamptz;
  v_to    timestamptz;
  v_res   jsonb;
begin
  select coalesce(nullif(settings ->> 'timezone', ''), 'Asia/Ho_Chi_Minh') into v_tz
    from fp_organizations where id = p_org;
  if v_tz is null then
    raise exception 'Not a member of this organisation' using errcode = '42501';
  end if;
  v_from := case when p_from is not null then p_from::timestamp at time zone v_tz end;
  v_to   := case when p_to   is not null then (p_to + 1)::timestamp at time zone v_tz end;

  with wo as (
    select * from fp_work_orders w
    where w.org_id = p_org
      and (v_from is null or w.created_at >= v_from)
      and (v_to is null or w.created_at < v_to)
      and (p_location is null or w.location_id = p_location)
      and (p_technician is null or w.assigned_to = p_technician)
      and (p_priority is null or w.priority = p_priority)
  ), req as (
    select * from fp_requests r
    where r.org_id = p_org
      and (v_from is null or r.created_at >= v_from)
      and (v_to is null or r.created_at < v_to)
      and (p_location is null or r.location_id = p_location)
      and (p_priority is null or r.priority = p_priority)
  ), exp as (
    select * from fp_finance_expenditures e
    where e.org_id = p_org
      and (v_from is null or e.created_at >= v_from)
      and (v_to is null or e.created_at < v_to)
  ), proc as (
    select * from fp_finance_procurement p
    where p.org_id = p_org
      and (v_from is null or p.created_at >= v_from)
      and (v_to is null or p.created_at < v_to)
  ), vendor_spend as (
    select v.vendor_id, sum(v.amount) as amount
    from (select vendor_id, amount from exp union all select vendor_id, amount from proc) v
    where v.vendor_id is not null
    group by v.vendor_id
    order by 2 desc
    limit 5
  ), months as (
    select to_char(date_trunc('month', now() at time zone v_tz) - make_interval(months => g), 'YYYY-MM') as month
    from generate_series(5, 0, -1) g
  ), month_cost as (
    select to_char(at at time zone v_tz, 'YYYY-MM') as month, sum(amount) as amount
    from (
      select resolved_at as at, cost as amount from fp_work_orders
        where org_id = p_org and resolved_at >= now() - interval '7 months'
      union all
      select created_at, amount from fp_finance_expenditures
        where org_id = p_org and created_at >= now() - interval '7 months'
    ) x
    group by 1
  ), mtbf as (
    -- Mean days between consecutive completions of reactive (non-PM) work
    -- on the same asset.
    select avg(gap) as days from (
      select extract(epoch from resolved_at - lag(resolved_at) over (partition by asset_id order by resolved_at)) / 86400 as gap
      from fp_work_orders
      where org_id = p_org and asset_id is not null and pm_schedule_id is null and resolved_at is not null
    ) g where gap is not null
  )
  select jsonb_build_object(
    'open_requests',      (select count(*) from req where status not in ('resolved', 'closed', 'rejected')),
    'open_work',          (select count(*) from wo where status not in ('resolved', 'verified', 'closed')),
    'overdue',            (select count(*) from wo where due_at < now() and status not in ('resolved', 'verified', 'closed')),
    'avg_resolution_hours', (select round(avg(extract(epoch from resolved_at - created_at)) / 3600) from wo where resolved_at is not null),
    'pm_due',             (select count(*) from fp_pm_schedules
                           where org_id = p_org and active and trigger_type = 'calendar' and next_due_at <= now()),
    'pm_compliance',      (select case when count(*) = 0 then null
                                       else round(100.0 * count(*) filter (where due_at is not null and resolved_at <= due_at) / count(*)) end
                           from wo where pm_schedule_id is not null and resolved_at is not null),
    'planned_share',      (select case when count(*) = 0 then null
                                       else round(100.0 * count(*) filter (where pm_schedule_id is not null) / count(*)) end
                           from wo),
    'low_stock',          (select count(*) from fp_parts where org_id = p_org and stock_balance <= reorder_level),
    'expiring_contracts', (select count(*) from fp_contracts
                           where org_id = p_org and expiry_date between current_date and current_date + 30),
    'total_cost',         coalesce((select sum(cost) from wo), 0) + coalesce((select sum(amount) from exp), 0),
    'total_budget',       coalesce((select sum(amount) from fp_finance_budgets where org_id = p_org), 0),
    'vendor_spend',       coalesce((select jsonb_agg(jsonb_build_object('vendor_id', vendor_id, 'amount', amount) order by amount desc)
                                    from vendor_spend), '[]'::jsonb),
    'cost_by_month',      (select jsonb_agg(jsonb_build_object('month', m.month, 'amount', coalesce(c.amount, 0)) order by m.month)
                           from months m left join month_cost c using (month)),
    'mtbf_days',          (select round(days) from mtbf)
  ) into v_res;
  return v_res;
end;
$$;

grant execute on function fp_dashboard_kpis(uuid) to authenticated;
grant execute on function fp_report_kpis(uuid, date, date, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS helper: cheapest checks first
-- ---------------------------------------------------------------------------
-- Most users have no site restrictions; that is one index probe on
-- fp_user_sites' primary key. Only restricted users pay for the role and
-- site lookups.
create or replace function fp_has_site_access(target_org uuid, target_site uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    target_site is null
    or not exists (select 1 from fp_user_sites where user_id = auth.uid() and org_id = target_org)
    or exists (select 1 from fp_user_sites
               where user_id = auth.uid() and org_id = target_org and site_id = target_site)
    or fp_has_role(target_org, array['org_admin']);
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists fp_work_orders_asset_idx     on fp_work_orders (org_id, asset_id);
create index if not exists fp_work_orders_created_idx   on fp_work_orders (org_id, created_at desc);
create index if not exists fp_work_orders_resolved_idx  on fp_work_orders (org_id, resolved_at) where resolved_at is not null;
create index if not exists fp_requests_asset_idx        on fp_requests (org_id, asset_id);
create index if not exists fp_requests_location_idx     on fp_requests (org_id, location_id);
create index if not exists fp_requests_created_idx      on fp_requests (org_id, created_at desc);
create index if not exists fp_wo_parts_part_idx         on fp_wo_parts (part_id);
create index if not exists fp_workflow_runs_ref_idx     on fp_workflow_runs (workflow_id, trigger_ref);
create index if not exists fp_notifications_unread_idx  on fp_notifications (user_id) where read_at is null;
create index if not exists fp_meter_readings_org_idx    on fp_meter_readings (org_id, read_at desc);
create index if not exists fp_media_org_idx             on fp_media (org_id);
create index if not exists fp_assets_org_status_idx     on fp_assets (org_id, status);
create index if not exists fp_expenditures_org_created_idx on fp_finance_expenditures (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Read policies evaluated once per query, not once per row (S6-M1)
-- ---------------------------------------------------------------------------
-- The old policies called fp_is_member() and fp_has_site_access(
-- fp_location_site(...)) for every row: ~4 s to count 50k work orders. These
-- helpers return the caller's organisations and the locations hidden from
-- them; the policies use them as hashed subqueries, computed once. Same
-- rules as before: a site-restricted user (rows in fp_user_sites, not an
-- org_admin) doesn't see locations in other sites, nor anything placed there.
create or replace function fp_my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from fp_users_orgs where user_id = auth.uid();
$$;

create or replace function fp_hidden_location_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from fp_locations l
  join (select distinct us.org_id from fp_user_sites us
        where us.user_id = auth.uid()
          and not exists (select 1 from fp_users_orgs uo
                          where uo.user_id = auth.uid() and uo.org_id = us.org_id and uo.role = 'org_admin')
       ) restricted on restricted.org_id = l.org_id
  where l.site_id is not null
    and not exists (select 1 from fp_user_sites s
                    where s.user_id = auth.uid() and s.org_id = l.org_id and s.site_id = l.site_id);
$$;

grant execute on function fp_my_org_ids(), fp_hidden_location_ids() to authenticated;

drop policy if exists loc_select on fp_locations;
create policy loc_select on fp_locations for select to authenticated
  using ( org_id in (select fp_my_org_ids()) and id not in (select fp_hidden_location_ids()) );

drop policy if exists asset_select on fp_assets;
create policy asset_select on fp_assets for select to authenticated
  using ( org_id in (select fp_my_org_ids())
          and (location_id is null or location_id not in (select fp_hidden_location_ids())) );

drop policy if exists req_select on fp_requests;
create policy req_select on fp_requests for select to authenticated
  using ( org_id in (select fp_my_org_ids())
          and (location_id is null or location_id not in (select fp_hidden_location_ids())) );

drop policy if exists wo_select on fp_work_orders;
create policy wo_select on fp_work_orders for select to authenticated
  using ( org_id in (select fp_my_org_ids())
          and (location_id is null or location_id not in (select fp_hidden_location_ids())) );
