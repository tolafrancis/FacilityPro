-- 0015_automation.sql
-- SLA policies (auto due date) + auto-assignment rules, applied when a work order
-- is created. Keeps triage logic in one place.

create table fp_sla_policies (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references fp_organizations(id) on delete cascade,
  priority         text not null,
  resolution_hours int not null check (resolution_hours > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, priority)
);

create table fp_assignment_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  fault_type_id uuid references fp_fault_types(id) on delete cascade,
  priority      text,
  assigned_to   uuid not null references auth.users(id) on delete cascade,
  ord           int not null default 0,
  created_at    timestamptz not null default now()
);

create index fp_assignment_rules_org_idx on fp_assignment_rules (org_id, ord);

create trigger trg_fp_sla_touch
  before update on fp_sla_policies for each row execute function fp_touch_updated_at();

-- Applied BEFORE INSERT on work orders: fill due_at from SLA and assignee from rules.
create or replace function fp_apply_wo_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h int;
  a uuid;
  ft uuid;
begin
  if new.due_at is null then
    select resolution_hours into h
      from fp_sla_policies
      where org_id = new.org_id and priority = new.priority;
    if h is not null then
      new.due_at := now() + (h || ' hours')::interval;
    end if;
  end if;

  if new.assigned_to is null then
    ft := null;
    if new.request_id is not null then
      select fault_type_id into ft from fp_requests where id = new.request_id;
    end if;
    select assigned_to into a
      from fp_assignment_rules
      where org_id = new.org_id
        and (priority is null or priority = new.priority)
        and (fault_type_id is null or fault_type_id = ft)
      order by ord
      limit 1;
    if a is not null then
      new.assigned_to := a;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_fp_apply_wo_automation
  before insert on fp_work_orders
  for each row execute function fp_apply_wo_automation();

alter table fp_sla_policies     enable row level security;
alter table fp_assignment_rules enable row level security;

create policy sla_select on fp_sla_policies for select to authenticated
  using ( fp_is_member(org_id) );
create policy sla_write on fp_sla_policies for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy ar_select on fp_assignment_rules for select to authenticated
  using ( fp_is_member(org_id) );
create policy ar_write on fp_assignment_rules for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );
