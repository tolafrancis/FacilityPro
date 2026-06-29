-- 0007_functions_rpc.sql
-- Bootstrap RPCs (SECURITY DEFINER) + audit trigger attachment.

-- ---------------------------------------------------------------------------
-- Create an organisation and make the caller its org_admin, atomically.
-- Solves the RLS bootstrap problem (a user with no org cannot satisfy
-- membership-based policies yet).
-- ---------------------------------------------------------------------------
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

  insert into fp_users_orgs (user_id, org_id, role, preferred_lng)
  values (v_uid, v_org, 'org_admin', p_default_lng);

  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accept an invite by token. Validates email match, expiry, and single use.
-- ---------------------------------------------------------------------------
create or replace function fp_accept_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_inv   fp_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email from auth.users where id = v_uid;

  select * into v_inv from fp_invites where token = p_token;
  if not found then
    raise exception 'Invite not found';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'Invite already used';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Invite expired';
  end if;
  if lower(v_inv.email) <> lower(v_email) then
    raise exception 'Invite was issued to a different email';
  end if;

  insert into fp_users_orgs (user_id, org_id, role)
  values (v_uid, v_inv.org_id, v_inv.role)
  on conflict (user_id, org_id) do nothing;

  update fp_invites set accepted_at = now() where id = v_inv.id;

  return v_inv.org_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit triggers on key tables
-- ---------------------------------------------------------------------------
create trigger trg_audit_organizations after insert or update or delete
  on fp_organizations for each row execute function fp_audit();
create trigger trg_audit_users_orgs after insert or update or delete
  on fp_users_orgs for each row execute function fp_audit();
create trigger trg_audit_sites after insert or update or delete
  on fp_sites for each row execute function fp_audit();
create trigger trg_audit_locations after insert or update or delete
  on fp_locations for each row execute function fp_audit();
create trigger trg_audit_assets after insert or update or delete
  on fp_assets for each row execute function fp_audit();
create trigger trg_audit_requests after insert or update or delete
  on fp_requests for each row execute function fp_audit();
create trigger trg_audit_work_orders after insert or update or delete
  on fp_work_orders for each row execute function fp_audit();
