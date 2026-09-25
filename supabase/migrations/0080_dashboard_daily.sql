-- 0080: seven-day series for the dashboard's weekly report chart.
--
-- fp_dashboard_kpis gains 'daily': one entry per day for the last seven days
-- (the organisation's time zone), with faults reported (requests created)
-- and work orders resolved that day. Every other key is unchanged; still
-- security invoker, so every count is limited by the caller's RLS.

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
    -- 0080: the last seven days in the organisation's time zone, oldest first
    'daily', (
      with tz as (
        select coalesce((
          select o.tz from (select nullif(btrim(settings->>'timezone'), '') as tz from fp_organizations where id = p_org) o
          where exists (select 1 from pg_timezone_names where name = o.tz)), 'Asia/Ho_Chi_Minh') as name
      ), days as (
        select generate_series((now() at time zone tz.name)::date - 6, (now() at time zone tz.name)::date, interval '1 day')::date as day, tz.name
        from tz
      )
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'reported', (select count(*) from fp_requests r
                     where r.org_id = p_org and (r.created_at at time zone d.name)::date = d.day
                       and r.created_at > now() - interval '8 days'),
        'resolved', (select count(*) from fp_work_orders w
                     where w.org_id = p_org and (w.resolved_at at time zone d.name)::date = d.day
                       and w.resolved_at > now() - interval '8 days')
      ) order by d.day)
      from days d),
    'setup', jsonb_build_object(
      'members',   (select count(*) from fp_users_orgs where org_id = p_org),
      'invites',   (select count(*) from fp_invites where org_id = p_org),
      'assets',    (select count(*) from fp_assets where org_id = p_org),
      'parts',     (select count(*) from fp_parts where org_id = p_org),
      'locations', (select count(*) from fp_locations where org_id = p_org))
  );
$$;

grant execute on function fp_dashboard_kpis(uuid) to authenticated;
