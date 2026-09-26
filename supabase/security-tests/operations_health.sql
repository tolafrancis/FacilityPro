-- Operations health suite (0066). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000f0', 'ops@platform.test');
\set admin '00000000-0000-0000-0000-00000000000a'
\set ops   '00000000-0000-0000-0000-0000000000f0'
insert into fp_platform_admins (user_id) values (:'ops');
select t.run('authenticated', :'admin', $q$select fp_create_organization('Org A')$q$);
select id as "org" from fp_organizations where name = 'Org A' \gset

select t.check('a healthy system reports no delivery or workflow problems',
  not exists (select 1 from fp_system_checks() where not ok));

-- Failing emails, a stuck queue, failing workflows.
insert into fp_notification_outbox (org_id, channel, to_address, subject, status, error)
  select :'org', 'email', 'x' || g || '@a.test', 's', 'failed', 'Resend 422' from generate_series(1, 5) g;
insert into fp_notification_outbox (org_id, channel, to_address, subject, created_at)
  values (:'org', 'email', 'late@a.test', 's', now() - interval '3 hours');
insert into fp_workflows (id, org_id, name, trigger_type, is_active)
  values ('a0000000-0000-0000-0000-000000000001', :'org', 'WF', 'request.created', true);
insert into fp_workflow_runs (workflow_id, status, error)
  values ('a0000000-0000-0000-0000-000000000001', 'failed', 'boom');

select t.check('failing emails, a stuck queue and failing workflows are all flagged',
  (select array_agg(check_name order by check_name) from fp_system_checks() where not ok)
    = array['outbox_backlog', 'outbox_failed', 'workflow_failures']);

select t.check('platform admins can see the checks; org admins cannot',
  t.run('authenticated', :'ops', $q$select * from fp_system_health()$q$) = 'ok:4'  -- 4 checks since 0090 (payment webhooks)
  and t.run('authenticated', :'admin', $q$select * from fp_system_health()$q$) like 'err:%');
select t.check('only the service role can read the status verdict',
  t.run('service_role', null, $q$select fp_system_status()$q$) = 'ok:1'
  and t.run('authenticated', :'ops', $q$select fp_system_status()$q$) like 'err:%'
  and t.run('anon', null, $q$select fp_system_status()$q$) like 'err:%');
select t.check('the status verdict lists the problems',
  (fp_system_status()->>'ok')::boolean = false
  and fp_system_status()->'problems' ? 'workflow_failures');

select t.run('service_role', null, $q$select fp_run_job('check_job_health')$q$) as r \gset
select t.check('the hourly health check emails platform admins about each problem',
  :'r' = 'ok:1'
  and (select count(*) from fp_notification_outbox
       where to_address = 'ops@platform.test' and subject in (
         'FacilityPro: outbox failed needs attention',
         'FacilityPro: outbox backlog needs attention',
         'FacilityPro: workflow failures needs attention')) = 3);

select t.run('service_role', null, $q$select fp_run_job('check_job_health')$q$);
select t.check('...and does not repeat the same alert within 6 hours',
  (select count(*) from fp_notification_outbox
   where to_address = 'ops@platform.test' and subject like '%needs attention' and subject not like '%job%') = 3);

select t.check('0078: no database function still uses the former product name',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosrc like '%FacilitySpace%'));

\ir _report.sql
