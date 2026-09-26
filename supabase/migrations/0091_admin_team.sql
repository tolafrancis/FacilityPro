-- 0091_admin_team.sql
-- Admin panel: Admin team (/admin/team). Covered by
-- supabase/security-tests/admin_team.sql.
--
--   * Super admins invite staff by email with a role. Someone who already has
--     an account is added at once; anyone else gets an invite email and
--     becomes staff when they first open the admin panel signed in with that
--     (confirmed) email. Invites expire after 7 days and can be resent or
--     revoked.
--   * Change role, disable / enable, rename and remove staff. Nobody can
--     change, disable or remove their own account here, and the last active
--     super admin can't be demoted, disabled or removed.
--   * Staff accounts are no longer written directly (the table grants are
--     revoked); every change goes through these functions and lands in the
--     audit log (trigger from 0083, plus invite entries).

-- ===========================================================================
-- Invites
-- ===========================================================================
create table if not exists fp_staff_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role         text not null check (role in ('super_admin', 'admin', 'support', 'analyst')),
  display_name text,
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz
);
create unique index if not exists fp_staff_invites_pending_uk
  on fp_staff_invites (email) where accepted_at is null and revoked_at is null;

alter table fp_staff_invites enable row level security;
drop policy if exists admin_read on fp_staff_invites;
create policy admin_read on fp_staff_invites for select to authenticated using ( fp_admin_can('team.manage') );
revoke all on fp_staff_invites from anon;
revoke insert, update, delete on fp_staff_invites from authenticated;

drop trigger if exists trg_admin_audit on fp_staff_invites;
create trigger trg_admin_audit after insert or update or delete on fp_staff_invites
  for each row execute function fp_admin_audit_trigger();

-- Staff accounts change only through the functions below.
revoke insert, update, delete on fp_platform_admins from authenticated;

-- ===========================================================================
-- Helpers
-- ===========================================================================
create or replace function fp_staff_active_super_admins(p_except uuid default null)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from fp_platform_admins
  where role = 'super_admin' and disabled_at is null and user_id is distinct from p_except;
$$;

-- Target checks shared by every staff change.
create or replace function fp_staff_target(p_user uuid)
returns fp_platform_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  r fp_platform_admins;
begin
  perform fp_admin_require('team.manage');
  if p_user = auth.uid() then
    raise exception 'staff_self';
  end if;
  select * into r from fp_platform_admins where user_id = p_user for update;
  if r.user_id is null then
    raise exception 'Staff member not found' using errcode = 'P0002';
  end if;
  return r;
end;
$$;

-- Link base for emails: the admin's own site origin (https, or http for
-- localhost while developing).
create or replace function fp_staff_link_base(p text)
returns text
language sql
immutable
as $$
  select case
    when p ~ '^https://[a-z0-9.-]+(:\d+)?$' or p ~ '^http://(localhost|127\.0\.0\.1)(:\d+)?$' then p
    else 'https://facilitypro.tech'
  end;
$$;

create or replace function fp_staff_send_invite(i fp_staff_invites, p_base text, p_existing boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_by   text := (select email from auth.users where id = auth.uid());
  v_app  text := coalesce((select app_name from fp_platform_settings where id = 1), 'FacilityPro');
  v_role text := case i.role when 'super_admin' then 'Super admin' when 'admin' then 'Admin'
                             when 'support' then 'Support' else 'Analyst' end;
  v_link text;
begin
  v_link := fp_staff_link_base(p_base) || case when p_existing
    then '/signin?next=%2Fadmin&email=' || replace(i.email, '+', '%2B')
    else '/signup?next=%2Fadmin&email=' || replace(i.email, '+', '%2B') end;
  insert into fp_notification_outbox (user_id, channel, to_address, subject, body)
  values (null, 'email', i.email,
    case when p_existing then v_app || ': you now have access to the admin console'
         else v_app || ': you''re invited to the admin console' end,
    'Hello' || coalesce(' ' || nullif(btrim(i.display_name), ''), '') || ',' || E'\n\n'
      || coalesce(v_by, 'A super admin') || ' has '
      || case when p_existing then 'given you' else 'invited you to' end
      || ' ' || v_app || ' admin console access as ' || v_role || '.' || E'\n\n'
      || case when p_existing
           then 'Sign in with this email address and open the admin console:' || E'\n' || v_link
           else 'Create your account with this email address (' || i.email || '), then the admin console opens:' || E'\n' || v_link
                || E'\n\n' || 'The invitation expires on ' || to_char(i.expires_at at time zone 'UTC', 'YYYY-MM-DD') || '.'
         end
      || E'\n\n' || 'If you weren''t expecting this, you can ignore this email.');
end;
$$;

-- ===========================================================================
-- Team list
-- ===========================================================================
create or replace function fp_admin_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform fp_admin_require('team.manage');
  return jsonb_build_object(
    'me', auth.uid(),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', pa.user_id, 'email', u.email,
        'name', coalesce(nullif(btrim(pa.display_name), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')),
        'display_name', pa.display_name,
        'role', pa.role, 'disabled_at', pa.disabled_at, 'added_at', pa.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = pa.user_id and f.status::text = 'verified'),
        'actions_30d', (select count(*) from fp_admin_audit a where a.admin_id = pa.user_id and a.at > now() - interval '30 days'),
        'last_action_at', (select max(a.at) from fp_admin_audit a where a.admin_id = pa.user_id))
        order by pa.disabled_at nulls first,
                 array_position(array['super_admin', 'admin', 'support', 'analyst'], pa.role), u.email)
      from fp_platform_admins pa join auth.users u on u.id = pa.user_id), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email, 'role', i.role, 'display_name', i.display_name,
        'invited_by_email', (select email from auth.users where id = i.invited_by),
        'created_at', i.created_at, 'sent_at', i.sent_at, 'expires_at', i.expires_at,
        'expired', i.expires_at < now()) order by i.created_at desc)
      from fp_staff_invites i where i.accepted_at is null and i.revoked_at is null), '[]'::jsonb)
  );
end;
$$;

-- ===========================================================================
-- Invite
-- ===========================================================================
create or replace function fp_admin_invite_staff(p_email text, p_role text, p_name text default null, p_link_base text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user  uuid;
  v_inv   fp_staff_invites;
begin
  perform fp_admin_require('team.manage');
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;
  if p_role not in ('super_admin', 'admin', 'support', 'analyst') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;
  if (select count(*) from fp_staff_invites where invited_by = auth.uid() and sent_at > now() - interval '1 day') >= 30 then
    raise exception 'invite_limit';
  end if;

  if exists (select 1 from fp_platform_admins p join auth.users u on u.id = p.user_id where lower(u.email) = v_email) then
    raise exception 'already_staff';
  end if;
  -- Only a confirmed address proves the account belongs to that person.
  select id into v_user from auth.users where lower(email) = v_email and email_confirmed_at is not null;

  -- A newer invite replaces a pending one for the same address.
  update fp_staff_invites set revoked_at = now()
   where email = v_email and accepted_at is null and revoked_at is null;

  insert into fp_staff_invites (email, role, display_name, invited_by)
  values (v_email, p_role, nullif(btrim(p_name), ''), auth.uid())
  returning * into v_inv;

  if v_user is not null then
    -- Already has an account: staff straight away.
    insert into fp_platform_admins (user_id, role, display_name)
    values (v_user, p_role, nullif(btrim(p_name), ''));
    update fp_staff_invites set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
    perform fp_staff_send_invite(v_inv, p_link_base, true);
    return jsonb_build_object('added', true, 'user_id', v_user);
  end if;

  perform fp_staff_send_invite(v_inv, p_link_base, false);
  return jsonb_build_object('added', false, 'invite_id', v_inv.id);
end;
$$;

create or replace function fp_admin_resend_staff_invite(p_id uuid, p_link_base text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv fp_staff_invites;
begin
  perform fp_admin_require('team.manage');
  select * into v_inv from fp_staff_invites where id = p_id and accepted_at is null and revoked_at is null for update;
  if v_inv.id is null then
    raise exception 'invite_not_pending';
  end if;
  if v_inv.sent_at > now() - interval '1 minute' then
    raise exception 'invite_sent_recently';
  end if;
  update fp_staff_invites set sent_at = now(), expires_at = now() + interval '7 days'
   where id = p_id returning * into v_inv;
  perform fp_staff_send_invite(v_inv, p_link_base, false);
end;
$$;

create or replace function fp_admin_revoke_staff_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('team.manage');
  update fp_staff_invites set revoked_at = now()
   where id = p_id and accepted_at is null and revoked_at is null;
  if not found then
    raise exception 'invite_not_pending';
  end if;
end;
$$;

-- Called by the admin panel when a signed-in user has no staff role: takes
-- up a pending invite for their confirmed email address.
create or replace function fp_admin_accept_staff_invite()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_inv   fp_staff_invites;
begin
  if auth.uid() is null then
    return null;
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null or exists (select 1 from fp_platform_admins where user_id = auth.uid()) then
    return null;
  end if;
  select * into v_inv from fp_staff_invites
   where email = v_email and accepted_at is null and revoked_at is null and expires_at > now()
   for update;
  if v_inv.id is null then
    return null;
  end if;
  insert into fp_platform_admins (user_id, role, display_name) values (auth.uid(), v_inv.role, v_inv.display_name);
  update fp_staff_invites set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  return v_inv.role;
end;
$$;

-- ===========================================================================
-- Changes to staff
-- ===========================================================================
create or replace function fp_admin_set_staff_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r fp_platform_admins := fp_staff_target(p_user);
begin
  if p_role not in ('super_admin', 'admin', 'support', 'analyst') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;
  if r.role = 'super_admin' and p_role <> 'super_admin' and r.disabled_at is null
     and fp_staff_active_super_admins(p_user) = 0 then
    raise exception 'last_super_admin';
  end if;
  update fp_platform_admins set role = p_role where user_id = p_user and role <> p_role;
end;
$$;

create or replace function fp_admin_set_staff_disabled(p_user uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r fp_platform_admins := fp_staff_target(p_user);
begin
  if p_disabled and r.role = 'super_admin' and fp_staff_active_super_admins(p_user) = 0 then
    raise exception 'last_super_admin';
  end if;
  update fp_platform_admins
     set disabled_at = case when p_disabled then coalesce(disabled_at, now()) end
   where user_id = p_user;
end;
$$;

create or replace function fp_admin_rename_staff(p_user uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fp_admin_require('team.manage');
  update fp_platform_admins set display_name = nullif(left(btrim(coalesce(p_name, '')), 80), '') where user_id = p_user;
  if not found then
    raise exception 'Staff member not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Removes admin console access only; the person's account and any tenant
-- memberships are untouched. Their audit history stays.
create or replace function fp_admin_remove_staff(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r fp_platform_admins := fp_staff_target(p_user);
begin
  if r.role = 'super_admin' and r.disabled_at is null and fp_staff_active_super_admins(p_user) = 0 then
    raise exception 'last_super_admin';
  end if;
  delete from fp_platform_admins where user_id = p_user;
end;
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on function fp_staff_active_super_admins(uuid), fp_staff_target(uuid), fp_staff_link_base(text),
  fp_staff_send_invite(fp_staff_invites, text, boolean), fp_admin_team(), fp_admin_invite_staff(text, text, text, text),
  fp_admin_resend_staff_invite(uuid, text), fp_admin_revoke_staff_invite(uuid), fp_admin_accept_staff_invite(),
  fp_admin_set_staff_role(uuid, text), fp_admin_set_staff_disabled(uuid, boolean), fp_admin_rename_staff(uuid, text),
  fp_admin_remove_staff(uuid)
  from public, anon, authenticated;
grant execute on function fp_admin_team(), fp_admin_invite_staff(text, text, text, text),
  fp_admin_resend_staff_invite(uuid, text), fp_admin_revoke_staff_invite(uuid), fp_admin_accept_staff_invite(),
  fp_admin_set_staff_role(uuid, text), fp_admin_set_staff_disabled(uuid, boolean), fp_admin_rename_staff(uuid, text),
  fp_admin_remove_staff(uuid)
  to authenticated;
