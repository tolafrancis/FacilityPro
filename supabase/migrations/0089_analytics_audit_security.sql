-- 0089: admin panel — analytics & reports, audit log, security.
--
--   * Analytics (reports.view): activity over time (work orders created and
--     resolved, requests, new assets, active users and tenants), engagement
--     (DAU / WAU / MAU), module adoption, request channels, IoT deployment,
--     monthly tenant cohorts (share still active 1–5 months after sign-up)
--     and per-tenant usage.
--   * Report builder (reports.view): a dataset (tenants, members, work
--     orders, requests, invoices, tickets, assets, devices) counted — or
--     invoice amounts summed — by a whitelisted dimension over a date range.
--     Built from fixed SQL fragments; nothing the caller sends reaches SQL
--     text. Scheduled reports are emailed weekly or monthly (job
--     send_scheduled_reports).
--   * Audit log (audit.view): search and filter the admin audit trail
--     (who, what, which tenant, IP, before/after), with the filter options.
--   * Security (security.manage):
--       - "Staff must use two-factor authentication": when on, a staff
--         session without 2FA (JWT aal ≠ aal2) has no staff role at all —
--         every admin function and policy refuses it. It can only be turned
--         on from a 2FA session, so nobody locks themselves out.
--       - Admin session timeout (minutes of inactivity; the panel signs out).
--       - Overview: staff 2FA status, sessions, sensitive actions (30 days).
-- Covered by supabase/security-tests/analytics_audit.sql.

-- ===========================================================================
-- Two-factor authentication for staff
-- ===========================================================================
-- The authentication level of the current request (aal1 / aal2).
create or replace function fp_jwt_aal()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    nullif(current_setting('request.jwt.claim.aal', true), ''));
$$;

create or replace function fp_admin_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce((select admin_require_2fa from fp_platform_settings where id = 1), false)
         or coalesce(fp_jwt_aal(), '') = 'aal2';
$$;

create or replace function fp_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from fp_platform_admins where user_id = auth.uid() and disabled_at is null and fp_admin_mfa_ok();
$$;

create or replace function fp_is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from fp_platform_admins
                 where user_id = auth.uid() and disabled_at is null
                   and role in ('super_admin', 'admin'))
         and fp_admin_mfa_ok();
$$;

-- For the UI: role, permissions, and whether 2FA is still needed.
create or replace function fp_admin_permissions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role', fp_admin_role(),
    'permissions', to_jsonb(fp_admin_role_permissions(fp_admin_role())),
    'mfa_required', exists (select 1 from fp_platform_admins where user_id = auth.uid() and disabled_at is null)
                    and not fp_admin_mfa_ok(),
    'session_minutes', (select admin_session_minutes from fp_platform_settings where id = 1));
$$;

create or replace function fp_admin_save_security(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur fp_platform_settings;
begin
  perform fp_admin_require('security.manage');
  select * into cur from fp_platform_settings where id = 1 for update;
  if coalesce((p ->> 'admin_require_2fa')::boolean, false) and not cur.admin_require_2fa and fp_jwt_aal() is distinct from 'aal2' then
    raise exception 'mfa_needed_first' using errcode = '22023',
      detail = 'Set up two-factor authentication for your own account and sign in with it before requiring it for all staff.';
  end if;
  if p ? 'admin_session_minutes' and ((p ->> 'admin_session_minutes')::int < 5 or (p ->> 'admin_session_minutes')::int > 10080) then
    raise exception 'invalid_value' using errcode = '22023', detail = 'Choose between 5 minutes and 7 days.';
  end if;
  update fp_platform_settings set
    admin_require_2fa = coalesce((p ->> 'admin_require_2fa')::boolean, admin_require_2fa),
    admin_session_minutes = coalesce((p ->> 'admin_session_minutes')::int, admin_session_minutes),
    updated_at = now()
  where id = 1;
end;
$$;

create or replace function fp_admin_security_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform fp_admin_require('security.manage');
  return jsonb_build_object(
    'settings', (select jsonb_build_object('admin_require_2fa', admin_require_2fa, 'admin_session_minutes', admin_session_minutes)
                 from fp_platform_settings where id = 1),
    'my_aal', fp_jwt_aal(),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', pa.user_id, 'email', u.email, 'role', pa.role, 'disabled', pa.disabled_at is not null,
               'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = pa.user_id and f.status::text = 'verified'),
               'last_sign_in_at', u.last_sign_in_at,
               'sessions', (select count(*) from auth.sessions s where s.user_id = pa.user_id))
             order by pa.disabled_at nulls first, u.email)
      from fp_platform_admins pa join auth.users u on u.id = pa.user_id), '[]'::jsonb),
    'sensitive_30d', coalesce((
      select jsonb_object_agg(k, n) from (
        select case target_type when 'fp_platform_settings' then 'settings.change'
                                when 'fp_platform_admins' then 'staff.change' else action end as k,
               count(*) as n
        from fp_admin_audit
        where at > now() - interval '30 days'
          and (action in ('tenant.impersonate', 'user.ban', 'user.reset_mfa', 'user.sign_out', 'invoice.refund',
                          'tenant.delete', 'subscription.cancel', 'member.set_role')
               or target_type in ('fp_platform_admins', 'fp_platform_settings'))
        group by 1) x), '{}'::jsonb));
end;
$$;

-- ===========================================================================
-- Audit log
-- ===========================================================================
create index if not exists fp_admin_audit_action_idx on fp_admin_audit (action, at desc);

create or replace function fp_admin_audit_list(
  p_search      text default null,
  p_action      text default null,
  p_admin       uuid default null,
  p_target_type text default null,
  p_org         uuid default null,
  p_from        timestamptz default null,
  p_to          timestamptz default null,
  p_limit       int default 50,
  p_offset      int default 0,
  p_ids         bigint[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  result   jsonb;
begin
  perform fp_admin_require('audit.view');
  with filtered as (
    select a.id, a.at, a.action, a.target_type, a.target_id, a.org_id, o.name as org_name, a.ip, a.admin_id,
           u.email::text as admin_email, a.before, a.after
    from fp_admin_audit a
    left join auth.users u on u.id = a.admin_id
    left join fp_organizations o on o.id = a.org_id
    where (p_ids is null or a.id = any(p_ids))
      and (p_action is null or a.action = p_action or a.action like p_action || '.%')
      and (p_admin is null or a.admin_id = p_admin)
      and (p_target_type is null or a.target_type = p_target_type)
      and (p_org is null or a.org_id = p_org)
      and (p_from is null or a.at >= p_from)
      and (p_to is null or a.at <= p_to)
      and (v_search is null or a.target_id ilike '%' || v_search || '%' or o.name ilike '%' || v_search || '%'
           or u.email ilike '%' || v_search || '%' or a.ip = v_search or a.action ilike '%' || v_search || '%'
           or a.after::text ilike '%' || v_search || '%')
  ),
  page as (select * from filtered order by at desc, id desc limit v_limit offset v_offset)
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(page) order by page.at desc, page.id desc) from page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function fp_admin_audit_facets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform fp_admin_require('audit.view');
  return jsonb_build_object(
    'actions', coalesce((select jsonb_agg(action order by action) from (select distinct action from fp_admin_audit) x), '[]'::jsonb),
    'target_types', coalesce((select jsonb_agg(target_type order by target_type) from (select distinct target_type from fp_admin_audit) x), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email) order by u.email)
                        from auth.users u where u.id in (select distinct admin_id from fp_admin_audit where admin_id is not null)), '[]'::jsonb));
end;
$$;

-- ===========================================================================
-- Analytics
-- ===========================================================================
create or replace function fp_admin_analytics(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from   timestamptz := least(p_from, p_to);
  v_to     timestamptz := greatest(p_from, p_to);
  v_bucket text;
  d_to     date;
  result   jsonb;
begin
  perform fp_admin_require('reports.view');
  if v_to - v_from > interval '3 years' then
    v_from := v_to - interval '3 years';
  end if;
  v_bucket := case when v_to - v_from <= interval '45 days' then 'day' when v_to - v_from <= interval '200 days' then 'week' else 'month' end;
  d_to := (v_to at time zone 'utc')::date;

  with live as (select id, name, created_at from fp_organizations where deleted_at is null),
  buckets as (select generate_series(date_trunc(v_bucket, v_from), date_trunc(v_bucket, v_to), ('1 ' || v_bucket)::interval) as b),
  wo as (select org_id, created_at, resolved_at from fp_work_orders where created_at between v_from and v_to or resolved_at between v_from and v_to),
  rq as (select org_id, created_at, channel from fp_requests where created_at between v_from and v_to),
  act as (select day, org_id, user_id from fp_daily_activity where day between (v_from at time zone 'utc')::date and d_to)
  select jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to, 'bucket', v_bucket),
    'totals', jsonb_build_object(
      'work_orders_created', (select count(*) from wo where created_at between v_from and v_to),
      'work_orders_resolved', (select count(*) from wo where resolved_at between v_from and v_to),
      'requests', (select count(*) from rq),
      'assets_added', (select count(*) from fp_assets where created_at between v_from and v_to),
      'active_tenants', (select count(distinct org_id) from act),
      'active_users', (select count(distinct user_id) from act),
      'tenants', (select count(*) from live)),
    'engagement', jsonb_build_object(
      'dau', (select count(distinct user_id) from fp_daily_activity where day = d_to),
      'wau', (select count(distinct user_id) from fp_daily_activity where day > d_to - 7 and day <= d_to),
      'mau', (select count(distinct user_id) from fp_daily_activity where day > d_to - 30 and day <= d_to)),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
                  't', b.b,
                  'work_orders_created', (select count(*) from wo where date_trunc(v_bucket, wo.created_at) = b.b),
                  'work_orders_resolved', (select count(*) from wo where date_trunc(v_bucket, wo.resolved_at) = b.b),
                  'requests', (select count(*) from rq where date_trunc(v_bucket, rq.created_at) = b.b),
                  'active_users', (select count(distinct user_id) from act where date_trunc(v_bucket, act.day::timestamptz) = b.b),
                  'active_tenants', (select count(distinct org_id) from act where date_trunc(v_bucket, act.day::timestamptz) = b.b)
                ) order by b.b), '[]') from buckets b),
    -- Tenants using each module in the period (or holding its records).
    'adoption', jsonb_build_array(
      jsonb_build_object('module', 'work_orders', 'tenants', (select count(distinct org_id) from wo)),
      jsonb_build_object('module', 'requests', 'tenants', (select count(distinct org_id) from rq)),
      jsonb_build_object('module', 'assets', 'tenants', (select count(distinct org_id) from fp_assets)),
      jsonb_build_object('module', 'preventive_maintenance', 'tenants', (select count(distinct org_id) from fp_pm_schedules)),
      jsonb_build_object('module', 'inventory', 'tenants', (select count(distinct org_id) from fp_inventory_transactions where created_at between v_from and v_to)),
      jsonb_build_object('module', 'inspections', 'tenants', (select count(distinct org_id) from fp_checklist_runs where created_at between v_from and v_to)),
      jsonb_build_object('module', 'space_booking', 'tenants', (select count(distinct org_id) from (
          select org_id from fp_desk_bookings where created_at between v_from and v_to
          union select org_id from fp_facility_bookings where created_at between v_from and v_to) x)),
      jsonb_build_object('module', 'vendors', 'tenants', (select count(distinct org_id) from fp_vendors)),
      jsonb_build_object('module', 'iot', 'tenants', (select count(distinct org_id) from fp_devices))),
    'channels', (select coalesce(jsonb_agg(x order by x.count desc), '[]') from (
                  select channel, count(*) as count from rq group by channel) x),
    'iot', jsonb_build_object(
      'devices', (select count(*) from fp_devices),
      'online', (select count(*) from fp_devices where last_seen_at > now() - interval '15 minutes'),
      'new', (select count(*) from fp_devices where created_at between v_from and v_to),
      'tenants', (select count(distinct org_id) from fp_devices)),
    -- Sign-up month → tenants, and how many were active 1..5 months later.
    'cohorts', (select coalesce(jsonb_agg(c order by c.month), '[]') from (
                  select to_char(m, 'YYYY-MM') as month,
                         (select count(*) from live l where date_trunc('month', l.created_at) = m) as tenants,
                         (select jsonb_agg((select count(distinct a.org_id) from fp_daily_activity a join live l on l.id = a.org_id
                                            where date_trunc('month', l.created_at) = m
                                              and date_trunc('month', a.day::timestamptz) = m + make_interval(months => k))
                                           order by k)
                          from generate_series(0, 5) k
                          where m + make_interval(months => k) <= date_trunc('month', now())) as active
                  from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m) c),
    'tenant_usage', (select coalesce(jsonb_agg(x order by x.score desc), '[]') from (
                  select l.id, l.name, s.plan_code as plan,
                         (select count(distinct a.user_id) from act a where a.org_id = l.id) as active_users,
                         (select count(*) from wo where wo.org_id = l.id and wo.created_at between v_from and v_to) as work_orders,
                         (select count(*) from rq where rq.org_id = l.id) as requests,
                         (select count(*) from fp_assets x where x.org_id = l.id) as assets,
                         (select count(*) from fp_devices x where x.org_id = l.id) as devices,
                         (select count(*) from wo where wo.org_id = l.id and wo.created_at between v_from and v_to)
                           + (select count(*) from rq where rq.org_id = l.id)
                           + (select count(distinct a.user_id) from act a where a.org_id = l.id) as score
                  from live l left join fp_subscriptions s on s.org_id = l.id
                  order by score desc limit 50) x)
  ) into result;
  return result;
end;
$$;

-- ===========================================================================
-- Report builder
-- ===========================================================================
-- Runs a report definition; no permission check (callers check). Every SQL
-- fragment comes from the fixed lists below.
create or replace function fp_report_run(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_ds    text := p ->> 'dataset';
  v_dim   text := p ->> 'group_by';
  v_meas  text := coalesce(p ->> 'measure', 'count');
  v_from  timestamptz := coalesce(nullif(p ->> 'from', '')::timestamptz, now() - interval '30 days');
  v_to    timestamptz := coalesce(nullif(p ->> 'to', '')::timestamptz, now());
  src     text;
  datecol text;
  dimexpr text;
  measexpr text;
  rows    jsonb;
begin
  src := case v_ds
    when 'tenants'     then 'fp_organizations x left join fp_subscriptions s on s.org_id = x.id left join fp_organizations o on o.id = x.id'
    when 'members'     then 'fp_users_orgs x join fp_organizations o on o.id = x.org_id left join fp_subscriptions s on s.org_id = x.org_id'
    when 'work_orders' then 'fp_work_orders x join fp_organizations o on o.id = x.org_id left join fp_subscriptions s on s.org_id = x.org_id'
    when 'requests'    then 'fp_requests x join fp_organizations o on o.id = x.org_id left join fp_subscriptions s on s.org_id = x.org_id'
    when 'invoices'    then 'fp_platform_invoices x join fp_organizations o on o.id = x.org_id left join fp_subscriptions s on s.org_id = x.org_id'
    when 'tickets'     then 'fp_support_tickets x left join fp_organizations o on o.id = x.org_id left join fp_subscriptions s on s.org_id = x.org_id'
    when 'assets'      then 'fp_assets x join fp_organizations o on o.id = x.org_id left join fp_subscriptions s on s.org_id = x.org_id'
    when 'devices'     then 'fp_devices x join fp_organizations o on o.id = x.org_id left join fp_subscriptions s on s.org_id = x.org_id'
  end;
  if src is null then
    raise exception 'invalid_dataset' using errcode = '22023';
  end if;
  datecol := case v_ds when 'invoices' then 'x.issued_at' else 'x.created_at' end;

  dimexpr := case
    when v_dim = 'month' then format('to_char(date_trunc(''month'', %s), ''YYYY-MM'')', datecol)
    when v_dim = 'week'  then format('to_char(date_trunc(''week'', %s), ''IYYY-"W"IW'')', datecol)
    when v_dim = 'day'   then format('to_char(%s, ''YYYY-MM-DD'')', datecol)
    when v_dim = 'tenant' and v_ds <> 'tenants' then 'coalesce(o.name, ''—'')'
    when v_dim = 'plan' then 'coalesce(s.plan_code, ''none'')'
    when v_dim = 'industry' then 'coalesce(o.industry, ''—'')'
    when v_dim = 'status' and v_ds = 'tenants' then 'fp_admin_tenant_status(x.suspended_at, x.deleted_at, s.status)'
    when v_dim = 'status' and v_ds in ('work_orders', 'requests', 'invoices', 'tickets', 'assets') then 'x.status'
    when v_dim = 'priority' and v_ds in ('work_orders', 'requests', 'tickets') then 'x.priority'
    when v_dim = 'channel' and v_ds = 'requests' then 'x.channel'
    when v_dim = 'category' and v_ds = 'tickets' then 'x.category'
    when v_dim = 'provider' and v_ds = 'invoices' then 'x.provider'
    when v_dim = 'role' and v_ds = 'members' then 'x.role'
  end;
  if dimexpr is null then
    raise exception 'invalid_group_by' using errcode = '22023', detail = 'This breakdown isn''t available for this dataset.';
  end if;
  measexpr := case
    when v_meas = 'count' then 'count(*)'
    when v_meas = 'amount' and v_ds = 'invoices' then 'round(sum(x.amount - x.refunded_amount), 2)'
  end;
  if measexpr is null then
    raise exception 'invalid_measure' using errcode = '22023';
  end if;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''label'', label, ''value'', value) order by %s), ''[]''::jsonb)
       from (select %s as label, %s as value from %s where %s between $1 and $2 %s group by 1) g',
    case when v_dim in ('month', 'week', 'day') then 'label' else 'value desc, label' end,
    dimexpr, measexpr, src, datecol,
    case when v_ds = 'tenants' then '' when v_ds in ('tickets') then '' else 'and o.deleted_at is null' end)
    into rows using v_from, v_to;

  return jsonb_build_object('dataset', v_ds, 'group_by', v_dim, 'measure', v_meas, 'from', v_from, 'to', v_to,
                            'rows', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (select r from jsonb_array_elements(rows) r limit 500) q));
end;
$$;

create or replace function fp_admin_report(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('reports.view');
  return fp_report_run(p);
end;
$$;

-- ===========================================================================
-- Scheduled reports
-- ===========================================================================
create table if not exists fp_report_schedules (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) between 1 and 100),
  definition   jsonb not null,
  frequency    text not null check (frequency in ('weekly', 'monthly')),
  recipients   text[] not null check (cardinality(recipients) between 1 and 10),
  active       boolean not null default true,
  next_run_at  timestamptz not null,
  last_sent_at timestamptz,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
alter table fp_report_schedules enable row level security;
drop policy if exists admin_read on fp_report_schedules;
create policy admin_read on fp_report_schedules for select to authenticated using ( fp_admin_can('reports.view') );
drop policy if exists admin_delete on fp_report_schedules;
create policy admin_delete on fp_report_schedules for delete to authenticated using ( fp_admin_can('reports.view') );
drop policy if exists admin_update on fp_report_schedules;
create policy admin_update on fp_report_schedules for update to authenticated
  using ( fp_admin_can('reports.view') ) with check ( fp_admin_can('reports.view') );
drop trigger if exists trg_admin_audit on fp_report_schedules;
create trigger trg_admin_audit after insert or update or delete on fp_report_schedules for each row execute function fp_admin_audit_trigger();

-- Creates a schedule after checking the report runs and the addresses.
create or replace function fp_admin_save_report_schedule(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rcpt text[] := (select array_agg(lower(btrim(x))) from jsonb_array_elements_text(p -> 'recipients') x where btrim(x) <> '');
  v_freq text := coalesce(p ->> 'frequency', 'weekly');
  v_id   uuid;
begin
  perform fp_admin_require('reports.view');
  if cardinality(coalesce(v_rcpt, '{}')) not between 1 and 10
     or exists (select 1 from unnest(v_rcpt) e where e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_recipients' using errcode = '22023', detail = 'Enter 1–10 valid email addresses.';
  end if;
  if v_freq not in ('weekly', 'monthly') or length(btrim(coalesce(p ->> 'name', ''))) not between 1 and 100 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  perform fp_report_run((p -> 'definition') || jsonb_build_object('from', now() - interval '1 day', 'to', now()));
  insert into fp_report_schedules (name, definition, frequency, recipients, next_run_at)
  values (btrim(p ->> 'name'),
          jsonb_build_object('dataset', p -> 'definition' ->> 'dataset', 'group_by', p -> 'definition' ->> 'group_by',
                             'measure', coalesce(p -> 'definition' ->> 'measure', 'count')),
          v_freq, v_rcpt,
          case v_freq when 'weekly' then date_trunc('week', now()) + interval '7 days 1 hour'
                      else date_trunc('month', now()) + interval '1 month 1 hour' end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Emails due schedules (or one schedule now): the last week / month.
create or replace function fp_send_report(s fp_report_schedules)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz := now() - case s.frequency when 'weekly' then interval '7 days' else interval '1 month' end;
  r      jsonb := fp_report_run(s.definition || jsonb_build_object('from', v_from, 'to', now()));
  body   text;
  rcpt   text;
begin
  body := s.name || E'\n' || to_char(v_from, 'YYYY-MM-DD') || ' – ' || to_char(now(), 'YYYY-MM-DD') || E'\n\n'
       || coalesce((select string_agg(rpad(x ->> 'label', 32) || ' ' || (x ->> 'value'), E'\n')
                    from jsonb_array_elements(r -> 'rows') x), '(no data)')
       || E'\n\nFacilityPro admin — scheduled report. Manage it under Analytics & reports.';
  foreach rcpt in array s.recipients loop
    insert into fp_notification_outbox (channel, to_address, subject, body)
    values ('email', rcpt, 'FacilityPro report: ' || s.name, body);
  end loop;
  update fp_report_schedules set last_sent_at = now(),
         next_run_at = greatest(next_run_at, now()) + case frequency when 'weekly' then interval '7 days' else interval '1 month' end
   where id = s.id;
end;
$$;

create or replace function fp_send_scheduled_reports()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s fp_report_schedules;
  n int := 0;
begin
  perform fp_assert_scheduler_or_manager(null);
  for s in select * from fp_report_schedules where active and next_run_at <= now() for update skip locked loop
    perform fp_send_report(s);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function fp_admin_send_report_now(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s fp_report_schedules;
begin
  perform fp_admin_require('reports.view');
  select * into s from fp_report_schedules where id = p_id;
  if s.id is null then
    raise exception 'Schedule not found' using errcode = 'P0002';
  end if;
  perform fp_send_report(s);
  perform fp_admin_log('report.send_now', 'fp_report_schedules', p_id::text, null, null, jsonb_build_object('recipients', s.recipients));
end;
$$;

insert into fp_jobs (job, description, max_silence, run_sql) values
  ('send_scheduled_reports', 'Email scheduled admin reports', interval '3 hours', 'select fp_send_scheduled_reports()')
on conflict (job) do update set description = excluded.description, max_silence = excluded.max_silence, run_sql = excluded.run_sql;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fp-send-scheduled-reports', '10 * * * *', $job$select fp_run_job('send_scheduled_reports')$job$);
  else
    raise warning '0089: pg_cron is not enabled, so scheduled reports were NOT scheduled.';
  end if;
end $$;

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on function fp_jwt_aal(), fp_admin_mfa_ok(), fp_admin_save_security(jsonb), fp_admin_security_overview(),
  fp_admin_audit_list(text, text, uuid, text, uuid, timestamptz, timestamptz, int, int, bigint[]), fp_admin_audit_facets(),
  fp_admin_analytics(timestamptz, timestamptz), fp_report_run(jsonb), fp_admin_report(jsonb),
  fp_admin_save_report_schedule(jsonb), fp_send_report(fp_report_schedules), fp_send_scheduled_reports(),
  fp_admin_send_report_now(uuid) from public, anon, authenticated;
grant execute on function fp_admin_save_security(jsonb), fp_admin_security_overview(),
  fp_admin_audit_list(text, text, uuid, text, uuid, timestamptz, timestamptz, int, int, bigint[]), fp_admin_audit_facets(),
  fp_admin_analytics(timestamptz, timestamptz), fp_admin_report(jsonb), fp_admin_save_report_schedule(jsonb),
  fp_admin_send_report_now(uuid) to authenticated;
grant execute on function fp_send_scheduled_reports() to service_role;
