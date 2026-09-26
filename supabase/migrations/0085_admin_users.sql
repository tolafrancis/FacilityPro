-- 0085: admin panel — users across all tenants.
--
--   * fp_admin_users(): every account on the platform with its tenants,
--     sign-in, confirmation, ban and 2FA state; server-side search, filters,
--     sorting and paging.                                   (users.view)
--   * fp_admin_user(): one account: profile, tenants, 2FA factors, active
--     sessions, recent sign-ins and what staff did to it.   (users.view)
--   * Account actions, each audited and refused for platform staff (managed
--     under Admin team) and for the caller's own account:  (users.manage)
--       ban (reason, for N days or until lifted) and unban; banning also
--       ends every session
--       sign out everywhere (ends every session and refresh token)
--       reset 2FA (removes the account's authenticator factors)
--       mark the email address confirmed
--     Password reset emails are sent by the panel with the public auth API
--     and recorded with fp_admin_record() (0084).
--   * Only named, non-secret columns are read from the auth schema (never
--     password hashes, tokens or factor secrets).
-- Covered by supabase/security-tests/admin_users.sql.

-- ===========================================================================
-- Helpers
-- ===========================================================================
create or replace function fp_admin_user_status(p_banned_until timestamptz, p_confirmed_at timestamptz)
returns text
language sql
stable
as $$
  select case
    when p_banned_until > now() then 'banned'
    when p_confirmed_at is null then 'unconfirmed'
    else 'active'
  end;
$$;

-- Refuses actions on the caller's own account and on platform staff.
create or replace function fp_admin_require_user_target(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v jsonb;
begin
  perform fp_admin_require('users.manage');
  select jsonb_build_object('email', u.email, 'banned_until', u.banned_until, 'email_confirmed_at', u.email_confirmed_at)
    into v from auth.users u where u.id = p_user;
  if v is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if p_user = auth.uid() then
    raise exception 'own_account' using errcode = '22023', detail = 'You cannot do this to your own account.';
  end if;
  if exists (select 1 from fp_platform_admins where user_id = p_user) then
    raise exception 'staff_account' using errcode = '22023', detail = 'Platform staff are managed under Admin team.';
  end if;
  return v;
end;
$$;

-- ===========================================================================
-- List
-- ===========================================================================
create or replace function fp_admin_users(
  p_search text default null,
  p_status text default null,   -- active | banned | unconfirmed | inactive (no sign-in for 30 days) | no_org | staff | null
  p_role   text default null,   -- a member role held in any tenant
  p_org    uuid default null,
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
set search_path = public, auth
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 25), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_sort   text := case when p_sort in ('email', 'name', 'created_at', 'last_sign_in_at', 'orgs', 'status') then p_sort else 'created_at' end;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  result   jsonb;
begin
  perform fp_admin_require('users.view');

  with base as (
    select u.id as user_id, u.email::text as email, nullif(u.raw_user_meta_data ->> 'full_name', '') as full_name,
           nullif(coalesce(u.phone::text, u.raw_user_meta_data ->> 'phone'), '') as phone,
           u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null as confirmed,
           case when u.banned_until > now() then u.banned_until end as banned_until,
           fp_admin_user_status(u.banned_until, u.email_confirmed_at) as status,
           pa.role as staff_role,
           exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status::text = 'verified') as mfa,
           (select count(*) from fp_users_orgs uo where uo.user_id = u.id) as orgs,
           coalesce((select jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'role', uo.role) order by uo.created_at)
                     from (select * from fp_users_orgs x where x.user_id = u.id order by x.created_at limit 3) uo
                     join fp_organizations o on o.id = uo.org_id), '[]'::jsonb) as memberships
    from auth.users u
    left join fp_platform_admins pa on pa.user_id = u.id
    where (p_ids is null or u.id = any(p_ids))
      and (v_search is null
           or u.email ilike '%' || v_search || '%'
           or u.raw_user_meta_data ->> 'full_name' ilike '%' || v_search || '%'
           or coalesce(u.phone::text, u.raw_user_meta_data ->> 'phone') ilike '%' || v_search || '%'
           or u.id::text = v_search
           or exists (select 1 from fp_users_orgs uo join fp_organizations o on o.id = uo.org_id
                      where uo.user_id = u.id and o.name ilike '%' || v_search || '%'))
      and (p_role is null or exists (select 1 from fp_users_orgs uo where uo.user_id = u.id and uo.role = p_role))
      and (p_org is null or exists (select 1 from fp_users_orgs uo where uo.user_id = u.id and uo.org_id = p_org))
  ),
  filtered as (
    select * from base
    where p_status is null
       or (p_status in ('active', 'banned', 'unconfirmed') and status = p_status)
       or (p_status = 'inactive' and status <> 'banned' and (last_sign_in_at is null or last_sign_in_at < now() - interval '30 days'))
       or (p_status = 'no_org' and orgs = 0 and staff_role is null)
       or (p_status = 'staff' and staff_role is not null)
  ),
  page as (
    select * from filtered
    order by
      case when not p_desc then
        case v_sort when 'email' then lower(email) when 'name' then lower(coalesce(full_name, email)) when 'status' then status end end asc nulls last,
      case when p_desc then
        case v_sort when 'email' then lower(email) when 'name' then lower(coalesce(full_name, email)) when 'status' then status end end desc nulls last,
      case when not p_desc then
        case v_sort when 'created_at' then extract(epoch from created_at) when 'last_sign_in_at' then extract(epoch from last_sign_in_at)
                    when 'orgs' then orgs end end asc nulls last,
      case when p_desc then
        case v_sort when 'created_at' then extract(epoch from created_at) when 'last_sign_in_at' then extract(epoch from last_sign_in_at)
                    when 'orgs' then orgs end end desc nulls last,
      user_id
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
create or replace function fp_admin_user(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user  jsonb;
  v_email text;
begin
  perform fp_admin_require('users.view');

  select jsonb_build_object(
           'id', u.id, 'email', u.email, 'full_name', nullif(u.raw_user_meta_data ->> 'full_name', ''),
           'phone', nullif(coalesce(u.phone::text, u.raw_user_meta_data ->> 'phone'), ''),
           'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
           'email_confirmed_at', u.email_confirmed_at,
           'banned_until', case when u.banned_until > now() then u.banned_until end,
           'status', fp_admin_user_status(u.banned_until, u.email_confirmed_at),
           'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)),
         u.email::text
    into v_user, v_email
  from auth.users u where u.id = p_user;
  if v_user is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'user', v_user,
    'staff_role', (select role from fp_platform_admins where user_id = p_user),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
               'org_id', o.id, 'name', o.name, 'role', uo.role, 'joined_at', uo.created_at,
               'org_status', fp_admin_tenant_status(o.suspended_at, o.deleted_at, s.status),
               'active_days_30', (select count(*) from fp_daily_activity a
                                  where a.user_id = p_user and a.org_id = o.id and a.day > current_date - 30))
             order by uo.created_at)
      from fp_users_orgs uo
      join fp_organizations o on o.id = uo.org_id
      left join fp_subscriptions s on s.org_id = o.id
      where uo.user_id = p_user), '[]'::jsonb),
    'active_days_30', (select count(distinct day) from fp_daily_activity where user_id = p_user and day > current_date - 30),
    'mfa', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'type', f.factor_type::text, 'status', f.status::text,
                                          'name', f.friendly_name, 'created_at', f.created_at) order by f.created_at)
      from auth.mfa_factors f where f.user_id = p_user), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(x order by x.last_used desc nulls last) from (
        select s.id, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at) as last_used,
               left(s.user_agent, 300) as user_agent, host(s.ip) as ip, s.aal::text as aal
        from auth.sessions s where s.user_id = p_user
        order by coalesce(s.refreshed_at::timestamptz, s.updated_at) desc nulls last limit 20) x), '[]'::jsonb),
    'logins', coalesce((
      select jsonb_agg(x order by x.at desc) from (
        select e.payload ->> 'action' as action, e.created_at as at, nullif(e.ip_address, '') as ip
        from auth.audit_log_entries e
        where e.payload ->> 'actor_id' = p_user::text
          and e.payload ->> 'action' in ('login', 'logout', 'user_signedup', 'user_recovery_requested',
                                         'user_updated_password', 'user_modified', 'token_revoked')
        order by e.created_at desc limit 50) x), '[]'::jsonb),
    'admin_actions', coalesce((
      select jsonb_agg(x order by x.at desc) from (
        select a.action, a.at, a.ip, a.after, (select email::text from auth.users where id = a.admin_id) as actor_email
        from fp_admin_audit a
        where (a.target_type = 'auth.users' and a.target_id = p_user::text)
           or (a.target_type = 'action' and a.target_id in (p_user::text, v_email))
           or (a.target_type = 'fp_users_orgs' and a.target_id = p_user::text)
        order by a.at desc limit 100) x), '[]'::jsonb)
  );
end;
$$;

-- ===========================================================================
-- Actions
-- ===========================================================================
create or replace function fp_admin_ban_user(p_user uuid, p_reason text, p_days int default null)
returns timestamptz
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  before jsonb := fp_admin_require_user_target(p_user);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_until  timestamptz;
begin
  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'reason_required' using errcode = '22023', detail = 'Give a reason (3–500 characters).';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then
    raise exception 'invalid_days' using errcode = '22023', detail = 'Ban for 1 to 3650 days, or until lifted.';
  end if;
  -- "Until lifted" is a far-future date: Supabase Auth reads banned_until as a timestamp.
  v_until := now() + coalesce(make_interval(days => p_days), interval '100 years');
  update auth.users set banned_until = v_until where id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
  perform fp_admin_log('user.ban', 'auth.users', p_user::text, null, before,
                       jsonb_build_object('reason', v_reason, 'banned_until', v_until, 'days', p_days));
  return v_until;
end;
$$;

create or replace function fp_admin_unban_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  before jsonb := fp_admin_require_user_target(p_user);
begin
  update auth.users set banned_until = null where id = p_user;
  perform fp_admin_log('user.unban', 'auth.users', p_user::text, null, before, null);
end;
$$;

create or replace function fp_admin_sign_out_user(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  before jsonb := fp_admin_require_user_target(p_user);
  n int;
begin
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  perform fp_admin_log('user.sign_out', 'auth.users', p_user::text, null, null, jsonb_build_object('sessions', n));
  return n;
end;
$$;

create or replace function fp_admin_reset_mfa(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  before jsonb := fp_admin_require_user_target(p_user);
  n int;
begin
  delete from auth.mfa_factors where user_id = p_user;
  get diagnostics n = row_count;
  perform fp_admin_log('user.reset_mfa', 'auth.users', p_user::text, null, null, jsonb_build_object('factors', n));
  return n;
end;
$$;

create or replace function fp_admin_confirm_email(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  before jsonb := fp_admin_require_user_target(p_user);
begin
  if before ->> 'email_confirmed_at' is not null then
    return;
  end if;
  update auth.users set email_confirmed_at = now() where id = p_user;
  perform fp_admin_log('user.confirm_email', 'auth.users', p_user::text, null, before, null);
end;
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on function fp_admin_user_status(timestamptz, timestamptz), fp_admin_require_user_target(uuid),
  fp_admin_users(text, text, text, uuid, text, boolean, int, int, uuid[]), fp_admin_user(uuid),
  fp_admin_ban_user(uuid, text, int), fp_admin_unban_user(uuid), fp_admin_sign_out_user(uuid),
  fp_admin_reset_mfa(uuid), fp_admin_confirm_email(uuid) from public, anon;

grant execute on function fp_admin_users(text, text, text, uuid, text, boolean, int, int, uuid[]), fp_admin_user(uuid),
  fp_admin_ban_user(uuid, text, int), fp_admin_unban_user(uuid), fp_admin_sign_out_user(uuid),
  fp_admin_reset_mfa(uuid), fp_admin_confirm_email(uuid) to authenticated;
