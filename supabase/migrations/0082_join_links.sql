-- 0082: shareable join links (and their QR codes), one per role.
--
-- An org admin creates a link for a role (manager, technician, occupant or
-- vendor; never org_admin), optionally with an expiry date and a maximum
-- number of uses, and shares it anywhere: WhatsApp, Zalo, SMS, email, a
-- printed QR code in the lobby. Whoever opens it signs up or signs in and
-- joins the organisation with that role. Unlike an invite it isn't tied to
-- one email address, so:
--   * links can be revoked at any time, and expire / run out of uses;
--   * the token is 32 random hex characters (122 bits), not guessable;
--   * joining never changes the role of someone who is already a member;
--   * the plan's member limit still applies (fp_enforce_plan_limit on
--     fp_users_orgs).
--
-- fp_join_link_info(token): what the join page shows before sign-in
--   (organisation name and role, or why the link no longer works).
-- fp_join_via_link(token): joins the signed-in user.
-- Covered by supabase/security-tests/join_links.sql.

create table if not exists fp_join_links (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references fp_organizations(id) on delete cascade,
  role        text not null check (role in ('manager', 'technician', 'occupant', 'vendor')),
  token       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  label       text check (label is null or length(label) <= 80),
  expires_at  timestamptz,
  max_uses    int check (max_uses is null or max_uses > 0),
  use_count   int not null default 0,
  revoked_at  timestamptz,
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists fp_join_links_org_idx on fp_join_links (org_id, created_at desc);

alter table fp_join_links enable row level security;

-- Org admins manage their links; nobody else reads them (the token is the
-- secret). Joining goes through the functions below.
drop policy if exists join_links_select on fp_join_links;
create policy join_links_select on fp_join_links for select to authenticated
  using ( fp_has_role(org_id, array['org_admin']) );
drop policy if exists join_links_insert on fp_join_links;
create policy join_links_insert on fp_join_links for insert to authenticated
  with check ( fp_has_role(org_id, array['org_admin']) and use_count = 0 and revoked_at is null );
drop policy if exists join_links_update on fp_join_links;
create policy join_links_update on fp_join_links for update to authenticated
  using ( fp_has_role(org_id, array['org_admin']) )
  with check ( fp_has_role(org_id, array['org_admin']) );
drop policy if exists join_links_delete on fp_join_links;
create policy join_links_delete on fp_join_links for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin']) );

-- Admins may revoke, relabel or change limits; the token, organisation and
-- use count are fixed.
revoke update on fp_join_links from authenticated;
grant select, insert, delete on fp_join_links to authenticated;
grant update (label, expires_at, max_uses, revoked_at) on fp_join_links to authenticated;

-- Why a link can't be used, or null when it can.
create or replace function fp_join_link_problem(l fp_join_links)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when l.revoked_at is not null then 'revoked'
    when l.expires_at is not null and l.expires_at <= now() then 'expired'
    when l.max_uses is not null and l.use_count >= l.max_uses then 'used_up'
  end;
$$;

create or replace function fp_join_link_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l   fp_join_links;
  org fp_organizations;
begin
  select * into l from fp_join_links where token = p_token;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  select * into org from fp_organizations where id = l.org_id;
  return jsonb_build_object(
    'valid', fp_join_link_problem(l) is null,
    'reason', fp_join_link_problem(l),
    'org_name', org.name,
    'logo_path', org.logo_path,
    'role', l.role,
    'already_member', exists (select 1 from fp_users_orgs where org_id = l.org_id and user_id = auth.uid())
  );
end;
$$;

create or replace function fp_join_via_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  l     fp_join_links;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- Lock the link so two people can't both take its last use.
  select * into l from fp_join_links where token = p_token for update;
  if not found then
    raise exception 'join_link_invalid:not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from fp_users_orgs where org_id = l.org_id and user_id = v_uid) then
    -- Already a member: never change their role through a link.
    return jsonb_build_object('org_id', l.org_id, 'already_member', true);
  end if;
  if fp_join_link_problem(l) is not null then
    raise exception 'join_link_invalid:%', fp_join_link_problem(l) using errcode = 'P0001';
  end if;

  insert into fp_users_orgs (user_id, org_id, role) values (v_uid, l.org_id, l.role);
  update fp_join_links set use_count = use_count + 1 where id = l.id;

  return jsonb_build_object('org_id', l.org_id, 'already_member', false);
end;
$$;

revoke execute on function fp_join_link_problem(fp_join_links) from public, anon, authenticated;
revoke execute on function fp_join_link_info(text), fp_join_via_link(text) from public;
grant execute on function fp_join_link_info(text) to anon, authenticated;
grant execute on function fp_join_via_link(text) to authenticated;
