-- 0029_surveys.sql
-- Surveys: feedback questionnaires sent to requestors (e.g. after request completion
-- via the "Send Survey to Requestor" workflow action). A survey is distinct from a
-- maintenance checklist: it captures requestor feedback rather than inspection results.

create table if not exists fp_surveys (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references fp_organizations(id) on delete cascade,
  name_i18n  jsonb not null,
  questions  jsonb not null default '[]'::jsonb,   -- array of question strings
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fp_surveys_org_idx on fp_surveys (org_id, is_active);

create trigger trg_fp_surveys_touch
  before update on fp_surveys
  for each row execute function fp_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: all members read; admin/manager manage (mirrors fp_checklist_templates).
-- ---------------------------------------------------------------------------
alter table fp_surveys enable row level security;

create policy surveys_select on fp_surveys for select to authenticated
  using ( fp_is_member(org_id) );
create policy surveys_write on fp_surveys for all to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_has_role(org_id, array['org_admin','manager']) );

-- Audit
create trigger trg_audit_surveys after insert or update or delete
  on fp_surveys for each row execute function fp_audit();
