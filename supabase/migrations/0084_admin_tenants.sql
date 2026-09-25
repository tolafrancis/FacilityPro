-- 0084: admin panel — tenant management.
--
--   * Suspended and deleted organisations are closed to their members:
--     fp_is_member / fp_has_role / fp_my_org_ids (used by every tenant
--     policy) only count active organisations. fp_my_org_status() tells the
--     app why, so a suspended tenant sees a message instead of onboarding.
--     Join links and public fault reports stop working for them too.
--   * Staff functions, each checking a permission (0083) and writing a
--     named entry to the admin audit trail:
--       list / detail / users / facilities / activity      (tenants.view, users.view)
--       create, update, suspend, reactivate, delete, restore,
--       change plan, extend trial, feature overrides        (tenants.manage)
--       invite, remove, change role of members             (users.manage)
--       fp_admin_record(): audit entry for actions done outside the
--       database (password reset emails)                    (any staff)
--   * Staff with tenants.manage may upload a tenant's logo.
-- Covered by supabase/security-tests/admin_tenants.sql.

-- ===========================================================================
-- Suspension and deletion close the organisation to its members
-- ===========================================================================
create or replace function fp_org_is_active(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from fp_organizations where id = p_org and suspended_at is null and deleted_at is null);
$$;

create or replace function fp_is_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from fp_users_orgs uo
    join fp_organizations o on o.id = uo.org_id and o.suspended_at is null and o.deleted_at is null
    where uo.user_id = auth.uid() and uo.org_id = target_org
  );
$$;

create or replace function fp_has_role(target_org uuid, needed text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from fp_users_orgs uo
    join fp_organizations o on o.id = uo.org_id and o.suspended_at is null and o.deleted_at is null
    where uo.user_id = auth.uid() and uo.org_id = target_org and uo.role = any(needed)
  );
$$;

create or replace function fp_my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select uo.org_id from fp_users_orgs uo
  join fp_organizations o on o.id = uo.org_id and o.suspended_at is null and o.deleted_at is null
  where uo.user_id = auth.uid();
$$;

-- The caller's memberships including closed organisations, so the app can
-- say "suspended" instead of offering to create a new organisation.
create or replace function fp_my_org_status()
returns table (org_id uuid, name text, role text, suspended boolean, deleted boolean, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, uo.role, o.suspended_at is not null, o.deleted_at is not null,
         case when o.suspended_at is not null then o.suspended_reason end
  from fp_users_orgs uo join fp_organizations o on o.id = uo.org_id
  where uo.user_id = auth.uid();
$$;

-- Join links of a closed organisation don't work.
create or replace function fp_join_link_problem(l fp_join_links)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when l.revoked_at is not null then 'revoked'
    when not fp_org_is_active(l.org_id) then 'revoked'
    when l.expires_at is not null and l.expires_at <= now() then 'expired'
    when l.max_uses is not null and l.use_count >= l.max_uses then 'used_up'
  end;
$$;

-- ===========================================================================
-- Helpers
-- ===========================================================================
create or replace function fp_admin_require(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fp_admin_can(p_permission) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create or replace function fp_admin_tenant_status(p_suspended timestamptz, p_deleted timestamptz, p_sub_status text)
returns text
language sql
immutable
as $$
  select case
    when p_deleted is not null then 'deleted'
    when p_suspended is not null then 'suspended'
    when p_sub_status = 'canceled' then 'cancelled'
    when p_sub_status = 'trialing' then 'trial'
    when p_sub_status = 'past_due' then 'past_due'
    else 'active'
  end;
$$;

-- ===========================================================================
-- List (server-side search, filters, sorting, paging)
-- ===========================================================================
create or replace function fp_admin_tenants(
  p_search text default null,
  p_status text default null,      -- active | trial | past_due | suspended | cancelled | deleted | null (all but deleted)
  p_plan   text default null,
  p_sort   text default 'created_at',
  p_desc   boolean default true,
  p_limit  int default 25,
  p_offset int default 0,
  p_ids    uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 25), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_sort   text := case when p_sort in ('name', 'created_at', 'last_active_at', 'users', 'mrr', 'status', 'plan', 'sites') then p_sort else 'created_at' end;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  result   jsonb;
begin
  perform fp_admin_require('tenants.view');

  with base as (
    select o.id, o.name, o.logo_path, o.subdomain, o.contact_email, o.created_at, o.last_active_at,
           s.plan_code, s.billing_interval,
           case when s.status = 'trialing' then coalesce(s.trial_ends_at, s.current_period_end) end as trial_ends_at,
           fp_admin_tenant_status(o.suspended_at, o.deleted_at, s.status) as status,
           (select count(*) from fp_users_orgs uo where uo.org_id = o.id) as users,
           (select count(*) from fp_sites x where x.org_id = o.id) as sites,
           (select count(*) from fp_locations x where x.org_id = o.id) as locations,
           case when o.suspended_at is null and o.deleted_at is null and s.status in ('active', 'past_due')
                then coalesce(round(fp_sub_mrr(s.plan_code, s.billing_interval), 2), 0) else 0 end as mrr
    from fp_organizations o
    left join fp_subscriptions s on s.org_id = o.id
    where (p_ids is null or o.id = any(p_ids))
      and (v_search is null or o.name ilike '%' || v_search || '%' or o.contact_email ilike '%' || v_search || '%'
           or o.subdomain ilike '%' || v_search || '%' or o.id::text = v_search)
      and (p_plan is null or coalesce(s.plan_code, 'none') = p_plan)
  ),
  filtered as (
    select * from base
    where (p_status is null and status <> 'deleted') or status = p_status
  ),
  page as (
    select * from filtered
    order by
      case when not p_desc then
        case v_sort when 'name' then lower(name) when 'status' then status when 'plan' then coalesce(plan_code, '') end end asc nulls last,
      case when p_desc then
        case v_sort when 'name' then lower(name) when 'status' then status when 'plan' then coalesce(plan_code, '') end end desc nulls last,
      case when not p_desc then
        case v_sort when 'created_at' then extract(epoch from created_at) when 'last_active_at' then extract(epoch from last_active_at)
                    when 'users' then users when 'mrr' then mrr when 'sites' then sites end end asc nulls last,
      case when p_desc then
        case v_sort when 'created_at' then extract(epoch from created_at) when 'last_active_at' then extract(epoch from last_active_at)
                    when 'users' then users when 'mrr' then mrr when 'sites' then sites end end desc nulls last,
      id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- ===========================================================================
-- Detail
-- ===========================================================================
create or replace function fp_admin_tenant(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o   fp_organizations;
  s   fp_subscriptions;
  members int;
  active30 int;
  last_active timestamptz;
  wo30 int;
  req30 int;
  failed_invoices int;
  h_activity int;
  h_adoption int;
  h_billing int;
  h_usage int;
begin
  perform fp_admin_require('tenants.view');
  select * into o from fp_organizations where id = p_org;
  if not found then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;
  select * into s from fp_subscriptions where org_id = p_org;

  members := (select count(*) from fp_users_orgs where org_id = p_org);
  active30 := (select count(distinct user_id) from fp_daily_activity where org_id = p_org and day > current_date - 30);
  last_active := o.last_active_at;
  wo30 := (select count(*) from fp_work_orders where org_id = p_org and created_at > now() - interval '30 days');
  req30 := (select count(*) from fp_requests where org_id = p_org and created_at > now() - interval '30 days');
  failed_invoices := (select count(*) from fp_platform_invoices where org_id = p_org and status = 'failed');

  -- Health score (0–100): recent activity 40, adoption 30, billing 20, usage 10.
  h_activity := case when last_active > now() - interval '7 days' then 40
                     when last_active > now() - interval '30 days' then 20 else 0 end;
  h_adoption := case when members = 0 then 0 else least(30, round(30.0 * active30 / members))::int end;
  h_billing  := case when failed_invoices > 0 or s.status = 'past_due' then 0 else 20 end;
  h_usage    := case when wo30 + req30 > 0 then 10 else 0 end;

  return jsonb_build_object(
    'org', to_jsonb(o) || jsonb_build_object('timezone', o.settings ->> 'timezone'),
    'status', fp_admin_tenant_status(o.suspended_at, o.deleted_at, s.status),
    'subscription', to_jsonb(s),
    'mrr', case when o.suspended_at is null and o.deleted_at is null and s.status in ('active', 'past_due')
                then coalesce(round(fp_sub_mrr(s.plan_code, s.billing_interval), 2), 0) else 0 end,
    'usage', jsonb_build_object(
      'members', members,
      'active_users_30d', active30,
      'assets', (select count(*) from fp_assets where org_id = p_org and status not in ('retired', 'disposed')),
      'sites', (select count(*) from fp_sites where org_id = p_org),
      'locations', (select count(*) from fp_locations where org_id = p_org),
      'devices', (select count(*) from fp_devices where org_id = p_org),
      'requests_30d', req30,
      'work_orders_30d', wo30,
      'open_work_orders', (select count(*) from fp_work_orders where org_id = p_org and status not in ('resolved', 'verified', 'closed')),
      'overdue_work_orders', (select count(*) from fp_work_orders where org_id = p_org and due_at < now() and status not in ('resolved', 'verified', 'closed')),
      'storage_bytes', (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects
                        where bucket_id in ('fp-media', 'fp-org-logos') and name like p_org::text || '/%')
    ),
    'limits', jsonb_build_object(
      'members', fp_plan_limit(p_org, 'members'),
      'assets', fp_plan_limit(p_org, 'assets'),
      'sites', fp_plan_limit(p_org, 'sites')),
    'health', jsonb_build_object(
      'score', h_activity + h_adoption + h_billing + h_usage,
      'activity', h_activity, 'adoption', h_adoption, 'billing', h_billing, 'usage', h_usage),
    'notes_count', (select count(*) from fp_admin_notes where org_id = p_org)
  );
end;
$$;

create or replace function fp_admin_tenant_users(p_org uuid)
returns table (user_id uuid, email text, full_name text, role text, joined_at timestamptz,
               last_sign_in_at timestamptz, active_days_30 int, banned boolean, confirmed boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform fp_admin_require('users.view');
  return query
    select uo.user_id, u.email::text, nullif(u.raw_user_meta_data ->> 'full_name', ''), uo.role, uo.created_at,
           u.last_sign_in_at,
           (select count(*)::int from fp_daily_activity a where a.user_id = uo.user_id and a.org_id = p_org and a.day > current_date - 30),
           coalesce(u.banned_until > now(), false),
           u.email_confirmed_at is not null
    from fp_users_orgs uo join auth.users u on u.id = uo.user_id
    where uo.org_id = p_org
    order by case uo.role when 'org_admin' then 0 when 'manager' then 1 when 'technician' then 2 else 3 end, u.email;
end;
$$;

create or replace function fp_admin_tenant_invites(p_org uuid)
returns table (id uuid, email text, role text, created_at timestamptz, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('users.view');
  return query
    select i.id, i.email, i.role, i.created_at, i.expires_at from fp_invites i
    where i.org_id = p_org and i.accepted_at is null order by i.created_at desc;
end;
$$;

create or replace function fp_admin_tenant_facilities(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('tenants.view');
  return jsonb_build_object(
    'sites', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name_i18n, 'address', s.address,
        'locations', (select count(*) from fp_locations l where l.site_id = s.id),
        'assets', (select count(*) from fp_assets a join fp_locations l on l.id = a.location_id where l.site_id = s.id)
      ) order by s.created_at) from fp_sites s where s.org_id = p_org), '[]'::jsonb),
    'buildings', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name_i18n, 'kind', l.kind, 'site_id', l.site_id,
        'children', (select count(*) from fp_locations c where c.parent_id = l.id),
        'assets', (select count(*) from fp_assets a where a.location_id = l.id)
      ) order by l.created_at) from fp_locations l where l.org_id = p_org and l.parent_id is null), '[]'::jsonb),
    'facilities', (select count(*) from fp_facilities where org_id = p_org),
    'desks', (select count(*) from fp_desks where org_id = p_org)
  );
end;
$$;

create or replace function fp_admin_tenant_activity(p_org uuid, p_limit int default 100)
returns table (kind text, action text, actor_email text, detail jsonb, at timestamptz)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform fp_admin_require('tenants.view');
  return query
    select * from (
      select 'event'::text, e.type, null::text, e.detail, e.at
      from fp_platform_events e where e.org_id = p_org
      union all
      select 'admin'::text, a.action || ':' || a.target_type, u.email::text,
             jsonb_build_object('target', a.target_id, 'before', a.before, 'after', a.after, 'ip', a.ip), a.at
      from fp_admin_audit a left join auth.users u on u.id = a.admin_id
      where a.org_id = p_org and fp_admin_can('audit.view')
    ) x
    order by 5 desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- ===========================================================================
-- Actions
-- ===========================================================================
-- Profile fields staff may set (create and update share the checks).
create or replace function fp_admin_apply_profile(p_org uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p ->> 'name', ''));
begin
  if p ? 'name' and (length(v_name) < 1 or length(v_name) > 120) then
    raise exception 'invalid_name' using errcode = '22023', detail = 'Name must be 1–120 characters.';
  end if;
  if p ? 'timezone' and nullif(p ->> 'timezone', '') is not null
     and not exists (select 1 from pg_timezone_names where name = p ->> 'timezone') then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  if p ? 'default_lng' and coalesce(p ->> 'default_lng', '') not in ('en', 'vi') then
    raise exception 'invalid_language' using errcode = '22023';
  end if;
  if p ? 'contact_email' and nullif(p ->> 'contact_email', '') is not null
     and (p ->> 'contact_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  update fp_organizations set
    name          = case when p ? 'name' then v_name else name end,
    industry      = case when p ? 'industry' then nullif(p ->> 'industry', '') else industry end,
    default_lng   = case when p ? 'default_lng' then p ->> 'default_lng' else default_lng end,
    contact_name  = case when p ? 'contact_name' then nullif(left(btrim(p ->> 'contact_name'), 120), '') else contact_name end,
    contact_email = case when p ? 'contact_email' then nullif(lower(btrim(p ->> 'contact_email')), '') else contact_email end,
    contact_phone = case when p ? 'contact_phone' then nullif(left(btrim(p ->> 'contact_phone'), 40), '') else contact_phone end,
    address       = case when p ? 'address' then nullif(left(btrim(p ->> 'address'), 500), '') else address end,
    currency      = case when p ? 'currency' then upper(p ->> 'currency') else currency end,
    subdomain     = case when p ? 'subdomain' then nullif(lower(btrim(p ->> 'subdomain')), '') else subdomain end,
    brand_color   = case when p ? 'brand_color' then nullif(p ->> 'brand_color', '') else brand_color end,
    logo_path     = case when p ? 'logo_path' then nullif(p ->> 'logo_path', '') else logo_path end,
    settings      = case when p ? 'timezone' then
                      case when nullif(p ->> 'timezone', '') is null then settings - 'timezone'
                           else jsonb_set(coalesce(settings, '{}'::jsonb), '{timezone}', to_jsonb(p ->> 'timezone')) end
                    else settings end
  where id = p_org;
end;
$$;

create or replace function fp_admin_create_tenant(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_plan  text := coalesce(nullif(p ->> 'plan_code', ''), 'pro');
  v_trial int  := coalesce((p ->> 'trial_days')::int, 14);
  v_owner text := nullif(lower(btrim(coalesce(p ->> 'owner_email', ''))), '');
begin
  perform fp_admin_require('tenants.manage');
  if not exists (select 1 from fp_plans where code = v_plan) then
    raise exception 'unknown_plan' using errcode = '22023';
  end if;
  if v_trial < 0 or v_trial > 90 then
    raise exception 'invalid_trial' using errcode = '22023', detail = 'Trial must be 0–90 days.';
  end if;
  if v_owner is not null and v_owner !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  insert into fp_organizations (name, default_lng)
  values (btrim(coalesce(p ->> 'name', '')), coalesce(nullif(p ->> 'default_lng', ''), 'en'))
  returning id into v_org;
  perform fp_admin_apply_profile(v_org, p);

  insert into fp_subscriptions (org_id, plan_code, status, provider, billing_interval,
                                current_period_start, current_period_end, trial_ends_at, note)
  values (v_org, v_plan, case when v_trial > 0 then 'trialing' else 'active' end, 'manual',
          case when p ->> 'billing_interval' = 'year' then 'year' else 'month' end,
          now(), case when v_trial > 0 then now() + make_interval(days => v_trial) end,
          case when v_trial > 0 then now() + make_interval(days => v_trial) end, 'Created by platform staff');

  -- The same starter data as self-service sign-up (fp_create_organization).
  insert into fp_surveys (org_id, name_i18n, questions) values
    (v_org, '{"en":"Post-completion feedback","vi":"Phản hồi sau hoàn thành"}'::jsonb,
     '["How satisfied were you with the resolution?","Was the issue resolved on time?","Any additional comments?"]'::jsonb),
    (v_org, '{"en":"Service quality survey","vi":"Khảo sát chất lượng dịch vụ"}'::jsonb,
     '["How would you rate the quality of service?","How responsive was our team?","Would you recommend our facilities team?"]'::jsonb);
  insert into fp_expense_categories (org_id, name)
  select v_org, c.name from (values ('Parts'), ('Labor'), ('Contracted services'), ('Utilities'), ('Equipment'), ('Other')) as c(name);
  perform fp_seed_default_fault_types(v_org);
  perform fp_seed_default_asset_types(v_org);

  -- The owner joins through the usual invitation (email queued by 0065).
  if v_owner is not null then
    insert into fp_invites (org_id, email, role, invited_by) values (v_org, v_owner, 'org_admin', auth.uid());
  end if;

  perform fp_admin_log('tenant.create', 'fp_organizations', v_org::text, v_org, null,
                       p || jsonb_build_object('plan_code', v_plan, 'trial_days', v_trial));
  return v_org;
end;
$$;

create or replace function fp_admin_update_tenant(p_org uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  before jsonb;
begin
  perform fp_admin_require('tenants.manage');
  select to_jsonb(o) into before from fp_organizations o where id = p_org;
  if before is null then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;
  perform fp_admin_apply_profile(p_org, p);
  perform fp_admin_log('tenant.update', 'fp_organizations', p_org::text, p_org, before,
                       (select to_jsonb(o) from fp_organizations o where id = p_org));
end;
$$;

create or replace function fp_admin_set_suspended(p_org uuid, p_suspend boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('tenants.manage');
  if p_suspend and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023', detail = 'Give a reason for the suspension.';
  end if;
  update fp_organizations
     set suspended_at = case when p_suspend then coalesce(suspended_at, now()) end,
         suspended_reason = case when p_suspend then left(btrim(p_reason), 500) end
   where id = p_org and deleted_at is null;
  if not found then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;
  perform fp_admin_log(case when p_suspend then 'tenant.suspend' else 'tenant.reactivate' end,
                       'fp_organizations', p_org::text, p_org, null, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function fp_admin_bulk_suspend(p_orgs uuid[], p_suspend boolean, p_reason text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  o uuid;
  n int := 0;
begin
  perform fp_admin_require('tenants.manage');
  if cardinality(p_orgs) > 200 then
    raise exception 'too_many' using errcode = '22023', detail = 'At most 200 tenants at a time.';
  end if;
  foreach o in array coalesce(p_orgs, '{}') loop
    if exists (select 1 from fp_organizations where id = o and deleted_at is null) then
      perform fp_admin_set_suspended(o, p_suspend, p_reason);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Soft delete: the organisation is closed and hidden; restore brings it back.
-- The caller must type the organisation's name.
create or replace function fp_admin_delete_tenant(p_org uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  perform fp_admin_require('tenants.manage');
  select name into v_name from fp_organizations where id = p_org and deleted_at is null;
  if v_name is null then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;
  if btrim(coalesce(p_confirm_name, '')) <> v_name then
    raise exception 'confirm_name_mismatch' using errcode = '22023', detail = 'Type the tenant''s exact name to delete it.';
  end if;
  update fp_organizations set deleted_at = now() where id = p_org;
  update fp_subscriptions set status = 'canceled' where org_id = p_org and status <> 'canceled';
  update fp_join_links set revoked_at = coalesce(revoked_at, now()) where org_id = p_org;
  perform fp_admin_log('tenant.delete', 'fp_organizations', p_org::text, p_org, jsonb_build_object('name', v_name), null);
end;
$$;

create or replace function fp_admin_restore_tenant(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('tenants.manage');
  update fp_organizations set deleted_at = null where id = p_org and deleted_at is not null;
  if not found then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;
  perform fp_admin_log('tenant.restore', 'fp_organizations', p_org::text, p_org, null, null);
end;
$$;

create or replace function fp_admin_change_plan(p_org uuid, p_plan text, p_interval text default 'month', p_status text default 'active')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  before jsonb;
begin
  perform fp_admin_require('tenants.manage');
  if not exists (select 1 from fp_plans where code = p_plan) then
    raise exception 'unknown_plan' using errcode = '22023';
  end if;
  if p_interval not in ('month', 'year') or p_status not in ('active', 'trialing', 'past_due', 'canceled') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  select to_jsonb(s) into before from fp_subscriptions s where org_id = p_org;
  insert into fp_subscriptions (org_id, plan_code, status, provider, billing_interval, current_period_start)
  values (p_org, p_plan, p_status, 'manual', p_interval, now())
  on conflict (org_id) do update
    set plan_code = excluded.plan_code, status = excluded.status, billing_interval = excluded.billing_interval,
        requested_plan_code = null, requested_at = null,
        canceled_at = case when excluded.status = 'canceled' then fp_subscriptions.canceled_at end,
        updated_at = now();
  perform fp_admin_log('tenant.change_plan', 'fp_subscriptions', p_org::text, p_org, before,
                       (select to_jsonb(s) from fp_subscriptions s where org_id = p_org));
end;
$$;

create or replace function fp_admin_extend_trial(p_org uuid, p_days int)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end timestamptz;
  before jsonb;
begin
  perform fp_admin_require('tenants.manage');
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'invalid_days' using errcode = '22023', detail = 'Extend by 1–90 days.';
  end if;
  select to_jsonb(s) into before from fp_subscriptions s where org_id = p_org;
  if before is null then
    raise exception 'No subscription' using errcode = 'P0002';
  end if;
  update fp_subscriptions
     set status = 'trialing',
         current_period_end = greatest(coalesce(trial_ends_at, current_period_end, now()), now()) + make_interval(days => p_days),
         trial_ends_at = greatest(coalesce(trial_ends_at, current_period_end, now()), now()) + make_interval(days => p_days),
         updated_at = now()
   where org_id = p_org
   returning trial_ends_at into v_end;
  perform fp_admin_log('tenant.extend_trial', 'fp_subscriptions', p_org::text, p_org, before,
                       jsonb_build_object('days', p_days, 'trial_ends_at', v_end));
  return v_end;
end;
$$;

-- Per-tenant feature switch: true/false, or null to follow the global setting.
create or replace function fp_admin_set_tenant_flag(p_org uuid, p_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('tenants.manage');
  if not exists (select 1 from fp_feature_flags where key = p_key) then
    raise exception 'unknown_flag' using errcode = '22023';
  end if;
  if p_enabled is null then
    delete from fp_feature_flag_overrides where flag_key = p_key and org_id = p_org;
  else
    insert into fp_feature_flag_overrides (flag_key, org_id, enabled) values (p_key, p_org, p_enabled)
    on conflict (flag_key, org_id) do update set enabled = excluded.enabled;
  end if;
  perform fp_admin_log('tenant.set_flag', 'fp_feature_flags', p_key, p_org, null, jsonb_build_object('enabled', p_enabled));
end;
$$;

create or replace function fp_admin_tenant_flags(p_org uuid)
returns table (key text, kind text, description text, global_enabled boolean, rollout_pct int, override boolean, effective boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('tenants.view');
  return query
    select f.key, f.kind, f.description, f.enabled, f.rollout_pct, o.enabled, fp_flag_enabled(f.key, p_org)
    from fp_feature_flags f
    left join fp_feature_flag_overrides o on o.flag_key = f.key and o.org_id = p_org
    order by f.kind desc, f.key;
end;
$$;

-- ===========================================================================
-- Members
-- ===========================================================================
create or replace function fp_admin_invite_member(p_org uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform fp_admin_require('users.manage');
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_role not in ('org_admin', 'manager', 'technician', 'occupant', 'vendor') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if not fp_org_is_active(p_org) then
    raise exception 'tenant_closed' using errcode = '22023', detail = 'The tenant is suspended or deleted.';
  end if;
  insert into fp_invites (org_id, email, role, invited_by) values (p_org, v_email, p_role, auth.uid()) returning id into v_id;
  perform fp_admin_log('member.invite', 'fp_invites', v_id::text, p_org, null, jsonb_build_object('email', v_email, 'role', p_role));
  return v_id;
end;
$$;

create or replace function fp_admin_remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  before jsonb;
begin
  perform fp_admin_require('users.manage');
  select to_jsonb(uo) into before from fp_users_orgs uo where org_id = p_org and user_id = p_user;
  if before is null then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  delete from fp_users_orgs where org_id = p_org and user_id = p_user;
  perform fp_admin_log('member.remove', 'fp_users_orgs', p_user::text, p_org, before, null);
end;
$$;

create or replace function fp_admin_set_member_role(p_org uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  before jsonb;
begin
  perform fp_admin_require('users.manage');
  if p_role not in ('org_admin', 'manager', 'technician', 'occupant', 'vendor') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  select to_jsonb(uo) into before from fp_users_orgs uo where org_id = p_org and user_id = p_user;
  if before is null then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  update fp_users_orgs set role = p_role where org_id = p_org and user_id = p_user;
  perform fp_admin_log('member.set_role', 'fp_users_orgs', p_user::text, p_org, before, jsonb_build_object('role', p_role));
end;
$$;

-- Audit entry for an action done outside the database by staff (e.g. a
-- password reset email sent from the panel).
create or replace function fp_admin_record(p_action text, p_org uuid, p_target text, p_detail jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if fp_admin_role() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_action !~ '^[a-z_]+\.[a-z_]+$' then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  perform fp_admin_log('client.' || p_action, 'action', left(p_target, 200), p_org, null, p_detail);
end;
$$;

-- ===========================================================================
-- Public reports stop for closed tenants
-- ===========================================================================
-- fp_public_context / fp_public_report read allow_public_requests; closing
-- the organisation turns it off, and reopening restores the tenant's setting.
create or replace function fp_org_close_public_reports()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.suspended_at is not null or new.deleted_at is not null) then
    new.settings := jsonb_set(coalesce(new.settings, '{}'::jsonb), '{public_requests_before_close}',
                              to_jsonb(coalesce(new.allow_public_requests, false)));
    new.allow_public_requests := false;
  elsif (old.suspended_at is not null or old.deleted_at is not null) and new.suspended_at is null and new.deleted_at is null then
    new.allow_public_requests := coalesce((new.settings ->> 'public_requests_before_close')::boolean, new.allow_public_requests);
    new.settings := coalesce(new.settings, '{}'::jsonb) - 'public_requests_before_close';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fp_org_close_public_reports on fp_organizations;
create trigger trg_fp_org_close_public_reports before update of suspended_at, deleted_at on fp_organizations
  for each row
  when (old.suspended_at is distinct from new.suspended_at or old.deleted_at is distinct from new.deleted_at)
  execute function fp_org_close_public_reports();

-- ===========================================================================
-- Staff may upload a tenant's logo
-- ===========================================================================
drop policy if exists "fp_org_logos staff insert" on storage.objects;
create policy "fp_org_logos staff insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'fp-org-logos' and fp_admin_can('tenants.manage') );
drop policy if exists "fp_org_logos staff delete" on storage.objects;
create policy "fp_org_logos staff delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'fp-org-logos' and fp_admin_can('tenants.manage') );

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on function fp_org_is_active(uuid), fp_my_org_status(), fp_admin_require(text),
  fp_admin_tenant_status(timestamptz, timestamptz, text),
  fp_admin_tenants(text, text, text, text, boolean, int, int, uuid[]), fp_admin_tenant(uuid),
  fp_admin_tenant_users(uuid), fp_admin_tenant_invites(uuid), fp_admin_tenant_facilities(uuid),
  fp_admin_tenant_activity(uuid, int), fp_admin_apply_profile(uuid, jsonb), fp_admin_create_tenant(jsonb),
  fp_admin_update_tenant(uuid, jsonb), fp_admin_set_suspended(uuid, boolean, text),
  fp_admin_bulk_suspend(uuid[], boolean, text), fp_admin_delete_tenant(uuid, text), fp_admin_restore_tenant(uuid),
  fp_admin_change_plan(uuid, text, text, text), fp_admin_extend_trial(uuid, int),
  fp_admin_set_tenant_flag(uuid, text, boolean), fp_admin_tenant_flags(uuid),
  fp_admin_invite_member(uuid, text, text), fp_admin_remove_member(uuid, uuid),
  fp_admin_set_member_role(uuid, uuid, text), fp_admin_record(text, uuid, text, jsonb),
  fp_org_close_public_reports() from public, anon;

grant execute on function fp_my_org_status(),
  fp_admin_tenants(text, text, text, text, boolean, int, int, uuid[]), fp_admin_tenant(uuid),
  fp_admin_tenant_users(uuid), fp_admin_tenant_invites(uuid), fp_admin_tenant_facilities(uuid),
  fp_admin_tenant_activity(uuid, int), fp_admin_create_tenant(jsonb), fp_admin_update_tenant(uuid, jsonb),
  fp_admin_set_suspended(uuid, boolean, text), fp_admin_bulk_suspend(uuid[], boolean, text),
  fp_admin_delete_tenant(uuid, text), fp_admin_restore_tenant(uuid), fp_admin_change_plan(uuid, text, text, text),
  fp_admin_extend_trial(uuid, int), fp_admin_set_tenant_flag(uuid, text, boolean), fp_admin_tenant_flags(uuid),
  fp_admin_invite_member(uuid, text, text), fp_admin_remove_member(uuid, uuid),
  fp_admin_set_member_role(uuid, uuid, text), fp_admin_record(text, uuid, text, jsonb) to authenticated;
