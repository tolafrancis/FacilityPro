-- Removes the "Harbourview Properties (Demo)" organisation created by
-- tenant_demo.sql, and its fictional @harbourview-demo.test accounts.
--
--   set fp.allow_demo_seed = 'yes';
--   \i supabase/seed/tenant_demo_remove.sql
--
-- Deletes row by row from every table with an org_id column (triggers are
-- skipped, so nothing is notified or audited), then the accounts.

do $$
declare
  v_org uuid;
  r record;
begin
  if coalesce(current_setting('fp.allow_demo_seed', true), '') <> 'yes' then
    raise exception 'Refused: run "set fp.allow_demo_seed = ''yes'';" first.';
  end if;
  select id into v_org from fp_organizations where settings ->> 'demo_key' = 'harbourview';
  set local session_replication_role = replica;
  if v_org is not null then
    for r in
      select c.table_schema, c.table_name
        from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'org_id' and t.table_type = 'BASE TABLE'
         and c.table_name <> 'fp_organizations'
    loop
      execute format('delete from %I.%I where org_id = $1', r.table_schema, r.table_name) using v_org;
    end loop;
    delete from fp_organizations where id = v_org;
  end if;
  delete from fp_notification_prefs where user_id in (select id from auth.users where email like '%@harbourview-demo.test');
  delete from auth.users where email like '%@harbourview-demo.test';
end $$;
