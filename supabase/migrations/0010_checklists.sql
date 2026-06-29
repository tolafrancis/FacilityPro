-- 0010_checklists.sql
-- Digital checklists / inspections: reusable templates, their items, and completed runs.

create table fp_checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  name_i18n  jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fp_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references fp_organizations(id) on delete cascade,
  template_id uuid not null references fp_checklist_templates(id) on delete cascade,
  ord         int not null default 0,
  label_i18n  jsonb not null,
  item_type   text not null default 'pass_fail'
                check (item_type in ('pass_fail','value','photo','text')),
  required    boolean not null default true,
  created_at  timestamptz not null default now()
);

create table fp_checklist_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  template_id   uuid references fp_checklist_templates(id) on delete set null,
  work_order_id uuid references fp_work_orders(id) on delete cascade,
  performed_by  uuid references auth.users(id) on delete set null,
  results       jsonb not null default '{}'::jsonb,   -- item_id -> { status | value | note }
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- A work order can carry a checklist (attached manually or by a PM schedule).
alter table fp_work_orders
  add column checklist_template_id uuid references fp_checklist_templates(id) on delete set null;

create index fp_checklist_items_tpl_idx on fp_checklist_items (template_id, ord);
create index fp_checklist_runs_wo_idx   on fp_checklist_runs (work_order_id);

create trigger trg_fp_checklist_templates_touch
  before update on fp_checklist_templates
  for each row execute function fp_touch_updated_at();
create trigger trg_fp_checklist_runs_touch
  before update on fp_checklist_runs
  for each row execute function fp_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table fp_checklist_templates enable row level security;
alter table fp_checklist_items     enable row level security;
alter table fp_checklist_runs      enable row level security;

-- Templates & items: all members read; admin/manager manage.
create policy cltpl_select on fp_checklist_templates for select to authenticated
  using ( fp_is_member(org_id) );
create policy cltpl_write on fp_checklist_templates for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

create policy clitem_select on fp_checklist_items for select to authenticated
  using ( fp_is_member(org_id) );
create policy clitem_write on fp_checklist_items for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

-- Runs: members read; any member can record a run; performer or manager can update.
create policy clrun_select on fp_checklist_runs for select to authenticated
  using ( fp_is_member(org_id) );
create policy clrun_insert on fp_checklist_runs for insert to authenticated
  with check ( fp_is_member(org_id) );
create policy clrun_update on fp_checklist_runs for update to authenticated
  using ( performed_by = auth.uid() or fp_has_role(org_id, array['org_admin','manager']) );

-- Audit
create trigger trg_audit_checklist_templates after insert or update or delete
  on fp_checklist_templates for each row execute function fp_audit();
create trigger trg_audit_checklist_runs after insert or update or delete
  on fp_checklist_runs for each row execute function fp_audit();
