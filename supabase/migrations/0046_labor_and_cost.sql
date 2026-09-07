-- 0046_labor_and_cost.sql
-- Audit finding (P0): fp_work_orders.cost and .labour_minutes exist but no
-- screen ever writes to them. This migration adds real labor capture
-- (fp_wo_labor), snapshots a part's unit cost at the moment it's issued (so a
-- later price change never rewrites a closed job's cost), and keeps
-- fp_work_orders.cost/.labour_minutes automatically in sync via triggers.

-- ---------------------------------------------------------------------------
-- Labor entries: a technician logs minutes worked against a work order, at
-- the rate in effect when they logged it (never recalculated later).
-- ---------------------------------------------------------------------------
create table fp_wo_labor (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  work_order_id uuid not null references fp_work_orders(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  minutes       int not null check (minutes > 0),
  rate_snapshot numeric(14,2) not null default 0,
  logged_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index fp_wo_labor_wo_idx on fp_wo_labor (work_order_id);

alter table fp_wo_labor enable row level security;

create policy wo_labor_select on fp_wo_labor for select to authenticated
  using ( fp_is_member(org_id) );

-- Insert: the technician assigned to the work order, or an admin/manager.
create policy wo_labor_insert on fp_wo_labor for insert to authenticated
  with check (
    fp_is_member(org_id)
    and (
      fp_has_role(org_id, array['org_admin','manager'])
      or exists (
        select 1 from fp_work_orders w
        where w.id = work_order_id and w.assigned_to = auth.uid()
      )
    )
  );

-- Update/delete: the person who logged it, or an admin/manager.
create policy wo_labor_update on fp_wo_labor for update to authenticated
  using ( user_id = auth.uid() or fp_has_role(org_id, array['org_admin','manager']) );
create policy wo_labor_delete on fp_wo_labor for delete to authenticated
  using ( user_id = auth.uid() or fp_has_role(org_id, array['org_admin','manager']) );

create trigger trg_audit_wo_labor after insert or update or delete
  on fp_wo_labor for each row execute function fp_audit();

-- ---------------------------------------------------------------------------
-- Snapshot a part's unit cost at the moment it's issued to a work order, so
-- editing fp_parts.unit_cost later never changes the recorded cost of a job
-- that already consumed it.
-- ---------------------------------------------------------------------------
alter table fp_wo_parts add column unit_cost_snapshot numeric(14,2);

create or replace function fp_snapshot_part_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.unit_cost_snapshot is null then
    select unit_cost into new.unit_cost_snapshot from fp_parts where id = new.part_id;
  end if;
  return new;
end;
$$;

create trigger trg_fp_snapshot_part_cost
  before insert on fp_wo_parts
  for each row execute function fp_snapshot_part_cost();

-- Backfill existing rows from the part's current cost (best available value).
update fp_wo_parts wp
  set unit_cost_snapshot = p.unit_cost
  from fp_parts p
  where wp.part_id = p.id and wp.unit_cost_snapshot is null;

-- ---------------------------------------------------------------------------
-- Keep fp_work_orders.cost and .labour_minutes as live rollups of labor +
-- parts, recalculated whenever either changes.
-- ---------------------------------------------------------------------------
create or replace function fp_recalc_wo_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wo_id uuid;
  v_minutes int;
  v_labor_cost numeric;
  v_parts_cost numeric;
begin
  v_wo_id := coalesce(new.work_order_id, old.work_order_id);

  select coalesce(sum(minutes), 0), coalesce(sum(minutes / 60.0 * rate_snapshot), 0)
    into v_minutes, v_labor_cost
    from fp_wo_labor where work_order_id = v_wo_id;

  select coalesce(sum(quantity * coalesce(unit_cost_snapshot, 0)), 0)
    into v_parts_cost
    from fp_wo_parts where work_order_id = v_wo_id;

  update fp_work_orders
    set labour_minutes = v_minutes,
        cost = v_labor_cost + v_parts_cost
    where id = v_wo_id;

  return coalesce(new, old);
end;
$$;

create trigger trg_fp_recalc_wo_cost_labor
  after insert or update or delete on fp_wo_labor
  for each row execute function fp_recalc_wo_cost();

create trigger trg_fp_recalc_wo_cost_parts
  after insert or update or delete on fp_wo_parts
  for each row execute function fp_recalc_wo_cost();
