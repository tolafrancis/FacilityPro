-- 0072_plans_and_integrity.sql
-- Audit findings S1-B1 (plan limits never enforced, trial never ends),
-- S1-M6 (double bookings), S1-M7 (new orgs miss default categories and a
-- subscription), S3-M2 (missing constraints) and S3-M3 (lost updates).
-- Covered by supabase/security-tests/plans_integrity.sql.
--
--   * Plan limits (fp_plans.limits: assets, members, sites) are enforced on
--     insert. The limits come from the org's subscription while it is
--     active/trialing and not expired, otherwise from the free plan. A key
--     missing from limits means unlimited. Pending invitations count towards
--     the member limit, so an admin can't invite past it.
--   * New organisations start on a 14-day trial of the Pro plan; afterwards
--     the free limits apply (nothing is deleted; only new rows over the
--     limit are refused). Existing organisations without a subscription get
--     a 30-day trial so launch doesn't lock anyone out.
--   * New organisations get the default expense categories.
--   * One booking per desk / facility per day.
--   * Catalogue names are unique per organisation; priorities and
--     severities are validated.
--   * Work orders carry a version number that increases on every change, so
--     the app can refuse to overwrite someone else's newer edit.

-- ===========================================================================
-- Plan limits
-- ===========================================================================
create or replace function fp_plan_limit(p_org uuid, p_key text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (coalesce(
    (select p.limits from fp_subscriptions s join fp_plans p on p.code = s.plan_code
      where s.org_id = p_org and s.status in ('active', 'trialing')
        and coalesce(s.current_period_end, 'infinity') > now()),
    (select limits from fp_plans where code = 'free')
  ) ->> p_key)::int;
$$;

create or replace function fp_enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k    text := tg_argv[0];
  lim  int;
  used int;
begin
  lim := fp_plan_limit(new.org_id, k);
  if lim is null then
    return new;
  end if;
  -- Serialise per organisation and limit so parallel inserts can't overshoot.
  perform pg_advisory_xact_lock(hashtext(new.org_id::text || ':plan:' || k));
  used := case k
    when 'assets'  then (select count(*) from fp_assets where org_id = new.org_id and status not in ('retired', 'disposed'))
    when 'sites'   then (select count(*) from fp_sites where org_id = new.org_id)
    when 'members' then (select count(*) from fp_users_orgs where org_id = new.org_id)
                        + case when tg_table_name = 'fp_invites'
                               then (select count(*) from fp_invites
                                     where org_id = new.org_id and accepted_at is null and expires_at > now())
                               else 0 end
  end;
  if used >= lim then
    raise exception 'plan_limit_reached:%', k
      using errcode = 'P0001',
            detail = format('Your plan allows %s %s. Upgrade under Billing to add more.', lim, k);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_limit_assets on fp_assets;
create trigger trg_fp_limit_assets before insert on fp_assets
  for each row execute function fp_enforce_plan_limit('assets');
drop trigger if exists trg_fp_limit_sites on fp_sites;
create trigger trg_fp_limit_sites before insert on fp_sites
  for each row execute function fp_enforce_plan_limit('sites');
drop trigger if exists trg_fp_limit_members on fp_users_orgs;
create trigger trg_fp_limit_members before insert on fp_users_orgs
  for each row execute function fp_enforce_plan_limit('members');
drop trigger if exists trg_fp_limit_invites on fp_invites;
create trigger trg_fp_limit_invites before insert on fp_invites
  for each row execute function fp_enforce_plan_limit('members');

-- For the Billing page: usage and the limits in force.
create or replace function fp_plan_usage(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fp_is_member(p_org) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'assets',  jsonb_build_object('used', (select count(*) from fp_assets where org_id = p_org and status not in ('retired', 'disposed')),
                                  'limit', fp_plan_limit(p_org, 'assets')),
    'members', jsonb_build_object('used', (select count(*) from fp_users_orgs where org_id = p_org),
                                  'limit', fp_plan_limit(p_org, 'members')),
    'sites',   jsonb_build_object('used', (select count(*) from fp_sites where org_id = p_org),
                                  'limit', fp_plan_limit(p_org, 'sites')),
    'trial_ends_at', (select current_period_end from fp_subscriptions
                      where org_id = p_org and status = 'trialing')
  );
end;
$$;

-- Existing organisations without a subscription: 30-day Pro trial.
insert into fp_subscriptions (org_id, plan_code, status, provider, current_period_start, current_period_end, note)
select o.id, 'pro', 'trialing', 'manual', now(), now() + interval '30 days', 'Launch trial (0072)'
from fp_organizations o
where not exists (select 1 from fp_subscriptions s where s.org_id = o.id)
  and exists (select 1 from fp_plans where code = 'pro');

-- ===========================================================================
-- New organisations
-- ===========================================================================
create or replace function fp_create_organization(
  p_name text,
  p_default_lng text default 'en'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into fp_organizations (name, default_lng)
  values (p_name, p_default_lng)
  returning id into v_org;

  -- 14-day Pro trial; the free plan's limits apply afterwards.
  insert into fp_subscriptions (org_id, plan_code, status, provider, current_period_start, current_period_end, note)
  select v_org, 'pro', 'trialing', 'manual', now(), now() + interval '14 days', 'Trial'
  where exists (select 1 from fp_plans where code = 'pro');

  insert into fp_users_orgs (user_id, org_id, role, preferred_lng)
  values (v_uid, v_org, 'org_admin', p_default_lng);

  insert into fp_surveys (org_id, name_i18n, questions) values
    (
      v_org,
      '{"en":"Post-completion feedback","vi":"Phản hồi sau hoàn thành"}'::jsonb,
      '["How satisfied were you with the resolution?","Was the issue resolved on time?","Any additional comments?"]'::jsonb
    ),
    (
      v_org,
      '{"en":"Service quality survey","vi":"Khảo sát chất lượng dịch vụ"}'::jsonb,
      '["How would you rate the quality of service?","How responsive was our team?","Would you recommend our facilities team?"]'::jsonb
    );

  insert into fp_expense_categories (org_id, name)
  select v_org, c.name
  from (values ('Parts'), ('Labor'), ('Contracted services'), ('Utilities'), ('Equipment'), ('Other')) as c(name);

  perform fp_seed_default_fault_types(v_org);
  perform fp_seed_default_asset_types(v_org);

  return v_org;
end;
$$;

-- ===========================================================================
-- Constraints
-- ===========================================================================
-- Unique indexes are created only when existing data allows; otherwise a
-- WARNING says what to clean up (re-run this migration afterwards).
do $$
declare
  spec record;
  n    int;
begin
  for spec in
    select * from (values
      ('fp_desk_bookings_day_uk',     'fp_desk_bookings',     '(desk_id, booked_for) where booked_for is not null',
       'select desk_id, booked_for from fp_desk_bookings where booked_for is not null group by 1, 2 having count(*) > 1'),
      ('fp_facility_bookings_day_uk', 'fp_facility_bookings', '(facility_id, booked_for) where booked_for is not null',
       'select facility_id, booked_for from fp_facility_bookings where booked_for is not null group by 1, 2 having count(*) > 1'),
      ('fp_fault_types_name_uk',      'fp_fault_types',       '(org_id, lower(name_i18n ->> ''en''))',
       'select org_id, lower(name_i18n ->> ''en'') from fp_fault_types group by 1, 2 having count(*) > 1'),
      ('fp_asset_types_name_uk',      'fp_asset_types',       '(org_id, lower(name_i18n ->> ''en''))',
       'select org_id, lower(name_i18n ->> ''en'') from fp_asset_types group by 1, 2 having count(*) > 1'),
      ('fp_expense_categories_name_uk','fp_expense_categories','(org_id, lower(name))',
       'select org_id, lower(name) from fp_expense_categories group by 1, 2 having count(*) > 1')
    ) as v(idx, tbl, cols, dup_query)
  loop
    execute format('select count(*) from (%s) d', spec.dup_query) into n;
    if n = 0 then
      execute format('create unique index if not exists %I on %I %s', spec.idx, spec.tbl, spec.cols);
    else
      raise warning '0072: % has % duplicate group(s), so % was not created. Find them with: %',
        spec.tbl, n, spec.idx, spec.dup_query;
    end if;
  end loop;
end $$;

do $$
declare n int;
begin
  update fp_requests set priority = 'medium' where priority not in ('low', 'medium', 'high', 'critical');
  get diagnostics n = row_count;
  if n > 0 then raise warning '0072: % request(s) had an unknown priority, set to medium.', n; end if;
  update fp_work_orders set priority = 'medium' where priority not in ('low', 'medium', 'high', 'critical');
  get diagnostics n = row_count;
  if n > 0 then raise warning '0072: % work order(s) had an unknown priority, set to medium.', n; end if;
  update fp_requests set severity = null where severity not in ('low', 'medium', 'high', 'critical');
  get diagnostics n = row_count;
  if n > 0 then raise warning '0072: % request(s) had an unknown severity, cleared.', n; end if;
end $$;

alter table fp_requests drop constraint if exists fp_requests_priority_check;
alter table fp_requests add constraint fp_requests_priority_check check (priority in ('low', 'medium', 'high', 'critical'));
alter table fp_requests drop constraint if exists fp_requests_severity_check;
alter table fp_requests add constraint fp_requests_severity_check check (severity is null or severity in ('low', 'medium', 'high', 'critical'));
alter table fp_work_orders drop constraint if exists fp_work_orders_priority_check;
alter table fp_work_orders add constraint fp_work_orders_priority_check check (priority in ('low', 'medium', 'high', 'critical'));

-- ===========================================================================
-- Work order versions (optimistic locking)
-- ===========================================================================
alter table fp_work_orders add column if not exists version int not null default 1;

create or replace function fp_bump_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists trg_fp_wo_version on fp_work_orders;
create trigger trg_fp_wo_version
  before update on fp_work_orders
  for each row when (old.* is distinct from new.*)
  execute function fp_bump_version();

-- ===========================================================================
-- Grants (0059 allow-list)
-- ===========================================================================
revoke execute on function fp_plan_limit(uuid, text), fp_enforce_plan_limit(), fp_bump_version()
  from public, anon, authenticated;
grant execute on function fp_plan_usage(uuid) to authenticated;
