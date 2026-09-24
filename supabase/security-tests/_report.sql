-- Shared report footer, included at the end of each suite with \ir.

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
\pset footer off
select case when ok then 'PASS' else 'FAIL' end as result, name from t.results order by id;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;
do $$ begin
  if exists (select 1 from t.results where not ok) then
    raise exception 'security suite: % check(s) failed', (select count(*) from t.results where not ok);
  end if;
end $$;
