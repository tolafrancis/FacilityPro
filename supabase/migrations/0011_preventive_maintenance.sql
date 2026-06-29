-- 0011_preventive_maintenance.sql
-- Preventive maintenance schedules + due-work-order generation.
-- Phase 1 continuation: calendar-interval triggers. Meter/condition triggers are future.

create table fp_pm_schedules (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references fp_organizations(id) on delete cascade,
  asset_id              uuid references fp_assets(id) on delete set null,
  name_i18n             jsonb not null,
  interval_days         int not null default 30 check (interval_days > 0),
  checklist_template_id uuid references fp_checklist_templates(id) on delete set null,
  assigned_to           uuid references auth.users(id) on delete set null,
  priority              text not null default 'medium',
  next_due_at           timestamptz not null,
  last_run_at           timestamptz,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Link generated work orders back to their schedule.
alter table fp_work_orders
  add column pm_schedule_id uuid references fp_pm_schedules(id) on delete set null;

create index fp_pm_due_idx on fp_pm_schedules (org_id, next_due_at) where active;

create trigger trg_fp_pm_touch
  before update on fp_pm_schedules
  for each row execute function fp_touch_updated_at();

alter table fp_pm_schedules enable row level security;
create policy pm_select on fp_pm_schedules for select to authenticated
  using ( fp_is_member(org_id) );
create policy pm_write on fp_pm_schedules for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create trigger trg_audit_pm after insert or update or delete
  on fp_pm_schedules for each row execute function fp_audit();

-- ---------------------------------------------------------------------------
-- Generate work orders for every schedule that is due.
-- Interactive callers must be an admin/manager of the target org.
-- A cron job running as the service role (no auth.uid) may pass NULL to
-- process every organisation at once.
-- ---------------------------------------------------------------------------
create or replace function fp_generate_due_pm(p_org uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  if auth.uid() is not null then
    if p_org is null or not fp_has_role(p_org, array['org_admin','manager']) then
      raise exception 'Not authorized';
    end if;
  end if;

  for r in
    select * from fp_pm_schedules
    where active and next_due_at <= now()
      and (p_org is null or org_id = p_org)
  loop
    insert into fp_work_orders
      (org_id, asset_id, title, priority, status, assigned_to, due_at,
       pm_schedule_id, checklist_template_id)
    values
      (r.org_id, r.asset_id,
       coalesce(r.name_i18n->>'en', r.name_i18n->>'vi', 'Preventive maintenance'),
       r.priority, 'assigned', r.assigned_to, r.next_due_at,
       r.id, r.checklist_template_id);

    update fp_pm_schedules
      set last_run_at = now(),
          next_due_at = now() + (r.interval_days || ' days')::interval
      where id = r.id;

    n := n + 1;
  end loop;

  return n;
end;
$$;

-- Optional automation (run once in the SQL editor after enabling pg_cron):
--   select cron.schedule('fp-pm-hourly', '0 * * * *', $$ select fp_generate_due_pm(); $$);
