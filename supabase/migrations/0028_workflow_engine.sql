-- 0028_workflow_engine.sql

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table if not exists fp_workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references fp_organizations(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text not null,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  labels text[] not null default '{}',
  is_active boolean not null default true,
  run_order int not null default 100,
  version int not null default 1,
  last_run_at timestamptz,
  run_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fp_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references fp_workflows(id) on delete cascade,
  trigger_ref text,
  status text not null default 'success' check (status in ('success','skipped','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists fp_workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references fp_workflows(id) on delete cascade,
  version int not null,
  definition jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists fp_workflow_queue (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references fp_workflows(id) on delete cascade,
  trigger_type text not null,
  trigger_ref text,
  context jsonb not null default '{}'::jsonb,
  due_at timestamptz not null default now(),
  attempts int not null default 0,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  created_at timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists fp_workflows_org_idx on fp_workflows (org_id, is_active, run_order);
create index if not exists fp_workflow_runs_workflow_idx on fp_workflow_runs (workflow_id, started_at desc);
create index if not exists fp_workflow_queue_due_idx on fp_workflow_queue (status, due_at);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table fp_workflows enable row level security;
alter table fp_workflow_runs enable row level security;
alter table fp_workflow_versions enable row level security;
alter table fp_workflow_queue enable row level security;

-- ─── Policies: fp_workflows ───────────────────────────────────────────────────

drop policy if exists workflows_select on fp_workflows;
create policy workflows_select on fp_workflows for select to authenticated using (fp_is_member(org_id));

drop policy if exists workflows_insert on fp_workflows;
create policy workflows_insert on fp_workflows for insert to authenticated with check (fp_is_member(org_id));

drop policy if exists workflows_update on fp_workflows;
create policy workflows_update on fp_workflows for update to authenticated using (fp_is_member(org_id)) with check (fp_is_member(org_id));

drop policy if exists workflows_delete on fp_workflows;
create policy workflows_delete on fp_workflows for delete to authenticated using (fp_is_member(org_id));

-- ─── Policies: fp_workflow_runs ───────────────────────────────────────────────

drop policy if exists workflow_runs_select on fp_workflow_runs;
create policy workflow_runs_select on fp_workflow_runs for select to authenticated
  using (exists (select 1 from fp_workflows w where w.id = workflow_id and fp_is_member(w.org_id)));

drop policy if exists workflow_runs_insert on fp_workflow_runs;
create policy workflow_runs_insert on fp_workflow_runs for insert to authenticated
  with check (exists (select 1 from fp_workflows w where w.id = workflow_id and fp_is_member(w.org_id)));

-- ─── Policies: fp_workflow_versions ──────────────────────────────────────────

drop policy if exists workflow_versions_select on fp_workflow_versions;
create policy workflow_versions_select on fp_workflow_versions for select to authenticated
  using (exists (select 1 from fp_workflows w where w.id = workflow_id and fp_is_member(w.org_id)));

drop policy if exists workflow_versions_insert on fp_workflow_versions;
create policy workflow_versions_insert on fp_workflow_versions for insert to authenticated
  with check (exists (select 1 from fp_workflows w where w.id = workflow_id and fp_is_member(w.org_id)));

-- ─── Policies: fp_workflow_queue ─────────────────────────────────────────────

drop policy if exists workflow_queue_select on fp_workflow_queue;
create policy workflow_queue_select on fp_workflow_queue for select to authenticated
  using (exists (select 1 from fp_workflows w where w.id = workflow_id and fp_is_member(w.org_id)));

drop policy if exists workflow_queue_insert on fp_workflow_queue;
create policy workflow_queue_insert on fp_workflow_queue for insert to authenticated
  with check (exists (select 1 from fp_workflows w where w.id = workflow_id and fp_is_member(w.org_id)));

-- ─── Functions ────────────────────────────────────────────────────────────────

create or replace function fp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── Triggers ─────────────────────────────────────────────────────────────────

drop trigger if exists trg_fp_workflows_touch on fp_workflows;
create trigger trg_fp_workflows_touch
  before update on fp_workflows
  for each row execute function fp_touch_updated_at();

drop trigger if exists trg_fp_workflow_versions_touch on fp_workflow_versions;
create trigger trg_fp_workflow_versions_touch
  before update on fp_workflow_versions
  for each row execute function fp_touch_updated_at();

drop trigger if exists trg_fp_workflow_queue_touch on fp_workflow_queue;
create trigger trg_fp_workflow_queue_touch
  before update on fp_workflow_queue
  for each row execute function fp_touch_updated_at();

-- ─── fp_run_workflows ─────────────────────────────────────────────────────────

create or replace function fp_run_workflows(
  p_trigger_type text,
  p_trigger_ref text default null,
  p_context jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  wf record;
  n int := 0;
  run_id uuid;
  cond_result boolean;
begin
  for wf in
    select *
    from fp_workflows
    where is_active = true
      and trigger_type = p_trigger_type
    order by run_order, created_at
  loop
    insert into fp_workflow_runs (workflow_id, trigger_ref, status, started_at, context)
    values (wf.id, p_trigger_ref, 'success', now(), p_context)
    returning id into run_id;

    if coalesce(wf.conditions->'rules', '[]'::jsonb)::jsonb = '[]'::jsonb then
      cond_result := true;
    else
      cond_result := true;
    end if;

    if cond_result then
      update fp_workflows set run_count = run_count + 1, last_run_at = now() where id = wf.id;
      update fp_workflow_runs set status = 'success', finished_at = now() where id = run_id;
      n := n + 1;
    else
      update fp_workflow_runs set status = 'skipped', finished_at = now() where id = run_id;
    end if;
  end loop;
  return n;
end;
$$;

grant execute on function fp_run_workflows(text, text, jsonb) to authenticated, service_role;