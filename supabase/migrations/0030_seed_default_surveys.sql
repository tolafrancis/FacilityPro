-- 0030_seed_default_surveys.sql
-- Give every org a couple of ready-to-use surveys so the workflow
-- "Send Survey to Requestor" dropdown is not empty on first use.
-- Backfills existing orgs (only those with no surveys yet) and updates the
-- org-bootstrap RPC so future orgs are seeded at creation time.

-- ---------------------------------------------------------------------------
-- Backfill existing orgs that have no surveys.
-- ---------------------------------------------------------------------------
insert into fp_surveys (org_id, name_i18n, questions)
select o.id, d.name_i18n, d.questions
from fp_organizations o
cross join (values
  (
    '{"en":"Post-completion feedback","vi":"Phản hồi sau hoàn thành"}'::jsonb,
    '["How satisfied were you with the resolution?","Was the issue resolved on time?","Any additional comments?"]'::jsonb
  ),
  (
    '{"en":"Service quality survey","vi":"Khảo sát chất lượng dịch vụ"}'::jsonb,
    '["How would you rate the quality of service?","How responsive was our team?","Would you recommend our facilities team?"]'::jsonb
  )
) as d(name_i18n, questions)
where not exists (select 1 from fp_surveys s where s.org_id = o.id);

-- ---------------------------------------------------------------------------
-- Seed default surveys for newly created orgs too.
-- ---------------------------------------------------------------------------
create or replace function fp_create_organization(
  p_name text,
  p_default_lng text default 'en'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into fp_organizations (name, default_lng)
  values (p_name, p_default_lng)
  returning id into v_org;

  insert into fp_users_orgs (user_id, org_id, role, preferred_lng)
  values (v_uid, v_org, 'org_admin', p_default_lng);

  insert into fp_surveys (org_id, name_i18n, questions) values
    (
      v_org,
      '{"en":"Post-completion feedback","vi":"Phản hồi sau hoàn thành"}'::jsonb,
      '["How satisfied were you with the resolution?","Was the issue resolved on time?","Any additional comments?"]'::jsonb
    ),
    (
      v_org,
      '{"en":"Service quality survey","vi":"Khảo sát chất lượng dịch vụ"}'::jsonb,
      '["How would you rate the quality of service?","How responsive was our team?","Would you recommend our facilities team?"]'::jsonb
    );

  return v_org;
end;
$$;
