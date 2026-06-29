-- Fix audit trigger function so it works for tables without an org_id column,
-- such as fp_organizations, while still capturing org_id for child tables.

create or replace function fp_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_org uuid;
  v_id  uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org := coalesce((v_row ->> 'org_id'), null)::uuid;
  v_id  := coalesce((v_row ->> 'id'), null)::uuid;

  insert into fp_audit_log (org_id, actor, entity_type, entity_id, action, diff)
  values (
    v_org,
    auth.uid(),
    tg_table_name,
    v_id,
    tg_op,
    v_row
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
