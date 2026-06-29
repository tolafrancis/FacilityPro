-- 0013_meters.sql
-- Meters and readings per asset, plus meter-based preventive-maintenance triggers.

create table fp_meters (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  asset_id   uuid not null references fp_assets(id) on delete cascade,
  name_i18n  jsonb not null,
  unit       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fp_meter_readings (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  meter_id   uuid not null references fp_meters(id) on delete cascade,
  value      numeric not null,
  read_at    timestamptz not null default now(),
  read_by    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index fp_meters_asset_idx   on fp_meters (asset_id);
create index fp_readings_meter_idx  on fp_meter_readings (meter_id, read_at desc);

create trigger trg_fp_meters_touch
  before update on fp_meters
  for each row execute function fp_touch_updated_at();

-- Extend PM schedules to support meter triggers.
-- next_due_at becomes nullable (meter schedules have no calendar date).
alter table fp_pm_schedules alter column next_due_at drop not null;
alter table fp_pm_schedules
  add column trigger_type text not null default 'calendar'
    check (trigger_type in ('calendar','meter'));
alter table fp_pm_schedules add column meter_id uuid references fp_meters(id) on delete set null;
alter table fp_pm_schedules add column meter_threshold numeric;     -- generate every N units
alter table fp_pm_schedules add column last_meter_value numeric;    -- meter value at last generation

-- RLS
alter table fp_meters         enable row level security;
alter table fp_meter_readings enable row level security;

create policy meters_select on fp_meters for select to authenticated
  using ( fp_is_member(org_id) );
create policy meters_write on fp_meters for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy readings_select on fp_meter_readings for select to authenticated
  using ( fp_is_member(org_id) );
create policy readings_insert on fp_meter_readings for insert to authenticated
  with check ( fp_is_member(org_id) );

-- Replace the PM generator to handle both calendar and meter triggers.
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
      if r.next_due_at is not null and r.next_due_at <= now() then
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
