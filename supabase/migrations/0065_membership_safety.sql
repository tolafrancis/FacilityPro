-- 0065_membership_safety.sql
-- Audit finding S1-H6 (database side). Covered by
-- supabase/security-tests/membership.sql.
--
--   * An organisation can't lose its last admin: demoting or removing the
--     only org_admin is refused. Deleting the organisation itself, or the
--     admin's user account, still works.
--   * A new invite queues an email to the invitee (fp_notification_outbox,
--     delivered by process-outbox). The link's base URL comes from the
--     process-outbox APP_URL secret, so a client can't make the platform
--     email a link to some other site.

-- ---------------------------------------------------------------------------
-- Last admin
-- ---------------------------------------------------------------------------
create or replace function fp_keep_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role <> 'org_admin' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'org_admin' then
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- Cascades from deleting the organisation or the user's account.
    if not exists (select 1 from auth.users where id = old.user_id) then
      return old;
    end if;
  end if;

  -- Serialise per organisation so two admins can't demote each other at the
  -- same moment and leave none. A missing row means the organisation is
  -- being deleted.
  perform 1 from fp_organizations where id = old.org_id for update;
  if not found then
    return coalesce(new, old);
  end if;

  if not exists (
    select 1 from fp_users_orgs
    where org_id = old.org_id and role = 'org_admin' and user_id <> old.user_id
  ) then
    raise exception 'An organisation must keep at least one admin. Make someone else an admin first.'
      using errcode = 'P0001', hint = 'last_org_admin';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_fp_keep_last_admin on fp_users_orgs;
create trigger trg_fp_keep_last_admin
  before update of role or delete on fp_users_orgs
  for each row execute function fp_keep_last_admin();

-- ---------------------------------------------------------------------------
-- Invite email
-- ---------------------------------------------------------------------------
create or replace function fp_queue_invite_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  text;
  v_from text;
begin
  select name into v_org from fp_organizations where id = new.org_id;
  select email into v_from from auth.users where id = new.invited_by;

  insert into fp_notification_outbox (org_id, channel, to_address, subject, body)
  values (
    new.org_id,
    'email',
    new.email,
    format('You''re invited to join %s on FacilitySpace / Lời mời tham gia %s', v_org, v_org),
    format(
      E'%s has invited you to join %s on FacilitySpace.\n\n'
      'Open this link to accept (valid until %s):\n{{app_url}}/invite?token=%s\n\n'
      'If you don''t have an account yet, choose "Sign up" and use this email address.\n\n'
      '---\n\n'
      '%s đã mời bạn tham gia %s trên FacilitySpace.\n\n'
      'Mở liên kết này để chấp nhận (hiệu lực đến %s):\n{{app_url}}/invite?token=%s\n\n'
      'Nếu bạn chưa có tài khoản, hãy chọn "Đăng ký" với địa chỉ email này.',
      coalesce(v_from, 'An administrator'), v_org, to_char(new.expires_at, 'YYYY-MM-DD'), new.token,
      coalesce(v_from, 'Quản trị viên'), v_org, to_char(new.expires_at, 'YYYY-MM-DD'), new.token
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_fp_queue_invite_email on fp_invites;
create trigger trg_fp_queue_invite_email
  after insert on fp_invites
  for each row execute function fp_queue_invite_email();

-- Trigger functions are called by the trigger, never directly.
revoke execute on function fp_keep_last_admin()     from public, anon, authenticated;
revoke execute on function fp_queue_invite_email()  from public, anon, authenticated;
