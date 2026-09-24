-- Shared test harness, included by each suite with \ir.

set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Harness: run SQL as an API role / user, the way PostgREST would.
-- ---------------------------------------------------------------------------
create schema t;
create table t.results (id serial, name text, ok boolean, detail text);

-- Returns 'ok:<rowcount>' or 'err:<message>'.
create function t.run(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  -- Only API roles carry a JWT; a direct DB session (pg_cron) has none.
  perform set_config('request.jwt.claim.role',
    case when p_role in ('anon', 'authenticated', 'service_role') then p_role else '' end, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    reset role;
    return 'ok:' || n;
  exception when others then
    reset role;
    return 'err:' || sqlerrm;
  end;
end $$;

create function t.check(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into t.results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;

