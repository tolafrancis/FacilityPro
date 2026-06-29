-- 0009_members_function.sql
-- Phase 1: expose org members (with email) for assignment dropdowns.
-- SECURITY DEFINER so it can read auth.users; gated to members of the org.

create or replace function fp_org_members(p_org uuid)
returns table (user_id uuid, email text, role text)
language sql
security definer
stable
set search_path = public, auth
as $$
  select uo.user_id, u.email::text, uo.role
  from fp_users_orgs uo
  join auth.users u on u.id = uo.user_id
  where uo.org_id = p_org
    and fp_is_member(p_org);
$$;
