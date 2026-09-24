-- 0078_rename_facilitypro.sql
-- The product is FacilityPro. Earlier migrations put the former name in
-- user-facing text built by database functions: workflow email subjects,
-- SMS/push alerts, invitation emails, background-job and health alerts.
-- Rather than copying those long function bodies, redefine every public fp_*
-- function whose body mentions the old name with the name replaced.
-- CREATE OR REPLACE keeps each function's owner, grants and signature.

do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname like 'fp\_%' and p.prokind = 'f'
      and p.prosrc like '%FacilitySpace%'
  loop
    execute replace(pg_get_functiondef(f.oid), 'FacilitySpace', 'FacilityPro');
    n := n + 1;
  end loop;
  raise notice '0078: renamed the product in % function(s).', n;
end $$;
