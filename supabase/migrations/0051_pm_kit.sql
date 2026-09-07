-- 0051_pm_kit.sql
-- Audit finding: a PM schedule generates a work order with an asset,
-- priority, and checklist, but no idea what parts the job usually needs, and
-- fires exactly at the due date rather than early enough to plan for it.
-- This adds a required-parts kit per schedule (suggestions, not an automatic
-- consumption — the technician still confirms actual usage) and a lead time.

create table fp_pm_required_parts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references fp_organizations(id) on delete cascade,
  pm_schedule_id uuid not null references fp_pm_schedules(id) on delete cascade,
  part_id        uuid not null references fp_parts(id) on delete cascade,
  quantity       numeric not null default 1 check (quantity > 0),
  created_at     timestamptz not null default now()
);

create index fp_pm_required_parts_schedule_idx on fp_pm_required_parts (pm_schedule_id);

alter table fp_pm_required_parts enable row level security;

create policy pm_required_parts_select on fp_pm_required_parts for select to authenticated
  using ( fp_is_member(org_id) );
create policy pm_required_parts_write on fp_pm_required_parts for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

alter table fp_pm_schedules add column lead_time_days int not null default 0;

-- Same generator as 0013, with one change: a calendar schedule now fires
-- lead_time_days early. The generated work order's due_at stays the real
-- next_due_at — lead time changes when the job is created, not its deadline.
create or replace function fp_generate_due_pm(p_org uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  v numeric;
  do_generate boolean;
begin
  if auth.uid() is not null then
    if p_org is null or not fp_has_role(p_org, array['org_admin','manager']) then
      raise exception 'Not authorized';
    end if;
  end if;

  for r in
    select * from fp_pm_schedules
    where active and (p_org is null or org_id = p_org)
  loop
    do_generate := false;
    v := null;

    if r.trigger_type = 'calendar' then
      if r.next_due_at is not null
         and r.next_due_at - (coalesce(r.lead_time_days, 0) || ' days')::interval <= now() then
        do_generate := true;
      end if;
    elsif r.trigger_type = 'meter' and r.meter_id is not null and r.meter_threshold is not null then
      select value into v
        from fp_meter_readings
        where meter_id = r.meter_id
        order by read_at desc
        limit 1;
      if v is not null and (v - coalesce(r.last_meter_value, 0)) >= r.meter_threshold then
        do_generate := true;
      end if;
    end if;

    if do_generate then
      insert into fp_work_orders
        (org_id, asset_id, title, priority, status, assigned_to, due_at,
         pm_schedule_id, checklist_template_id)
      values
        (r.org_id, r.asset_id,
         coalesce(r.name_i18n->>'en', r.name_i18n->>'vi', 'Preventive maintenance'),
         r.priority, 'assigned', r.assigned_to,
         case when r.trigger_type = 'calendar' then r.next_due_at else now() end,
         r.id, r.checklist_template_id);

      if r.trigger_type = 'calendar' then
        update fp_pm_schedules
          set last_run_at = now(),
              next_due_at = now() + (r.interval_days || ' days')::interval
          where id = r.id;
      else
        update fp_pm_schedules
          set last_run_at = now(),
              last_meter_value = v
          where id = r.id;
      end if;

      n := n + 1;
    end if;
  end loop;

  return n;
end;
$$;
