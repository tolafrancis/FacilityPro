-- Monitoring suite (0090). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@platform.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin@platform.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'support@platform.test'),
  ('00000000-0000-0000-0000-0000000000f5', 'gone@platform.test'),
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test');
\set super   '00000000-0000-0000-0000-0000000000f1'
\set padmin  '00000000-0000-0000-0000-0000000000f2'
\set support '00000000-0000-0000-0000-0000000000f3'
\set gone    '00000000-0000-0000-0000-0000000000f5'
\set ownerA  '00000000-0000-0000-0000-00000000000a'
insert into fp_platform_admins (user_id, role) values (:'super', 'super_admin'), (:'padmin', 'admin'), (:'support', 'support');
insert into fp_platform_admins (user_id, role, disabled_at) values (:'gone', 'admin', now());
select t.run('authenticated', :'ownerA', $q$select fp_create_organization('Alpha Towers')$q$);
select id as "orgA" from fp_organizations where name = 'Alpha Towers' \gset
create temp table j (k text, v jsonb);
grant all on j to authenticated;

-- ===========================================================================
-- App errors
-- ===========================================================================
select t.check('anyone can report an app error, signed in or not',
  t.run('anon', null, $q$select fp_log_client_error('{"message":"Cannot read properties of undefined (reading ''id'')","stack":"TypeError: x\n    at WorkOrder (https://facilitypro.tech/assets/WorkOrder-AbCd1234.js:12:345)","url":"https://facilitypro.tech/work-orders/5?token=secret#x"}')$q$) = 'ok:1'
  and t.run('authenticated', :'ownerA', $q$select fp_log_client_error('{"message":"Cannot read properties of undefined (reading ''id'')","stack":"TypeError: x\n    at WorkOrder (https://facilitypro.tech/assets/WorkOrder-ZzYy9876.js:13:9)","url":"https://facilitypro.tech/work-orders/7"}')$q$) = 'ok:1');
select t.check('the same bug is one group with a count, even across builds',
  (select count(*) from fp_app_errors) = 1 and (select occurrences from fp_app_errors) = 2);
select t.check('query strings and fragments (which can hold tokens) are not stored',
  (select sample ->> 'url' from fp_app_errors) = 'https://facilitypro.tech/work-orders/7'
  and not exists (select 1 from fp_app_errors where sample::text like '%secret%'));
select t.check('the reporting user and organisation come from the session, not the request',
  (select last_user_id = :'ownerA' and last_org_id = :'orgA' from fp_app_errors));
select t.run('anon', null, $q$select fp_log_client_error(jsonb_build_object('message', repeat('x', 5000)))$q$);
select t.run('anon', null, $q$select fp_log_client_error('{"message":"  "}')$q$);
select t.check('oversized messages are cut and empty ones ignored',
  (select count(*) from fp_app_errors) = 2
  and (select max(length(message)) from fp_app_errors) = 500);
select t.check('tenants and anonymous users cannot read or edit the errors',
  t.run('authenticated', :'ownerA', $q$select * from fp_app_errors$q$) = 'ok:0'
  and t.run('anon', null, $q$select * from fp_app_errors$q$) like 'err:%'
  and t.run('authenticated', :'ownerA', $q$delete from fp_app_errors$q$) like 'err:%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_app_errors('open', null, null, 50, 0)$q$) like 'err:%');
select t.run('service_role', null, $q$select fp_log_server_error('billing-webhook', 'Stripe timeout')$q$);
select t.check('only the service role can log Edge Function errors',
  t.run('authenticated', :'ownerA', $q$select fp_log_server_error('x', 'y')$q$) like 'err:%'
  and exists (select 1 from fp_app_errors where source = 'edge' and message = '[billing-webhook] Stripe timeout'));

select id as "errId" from fp_app_errors where message like 'Cannot read%' \gset
select t.run('authenticated', :'padmin', $q$insert into j select 'errs', fp_admin_app_errors('open', null, 'reading', 50, 0)$q$);
select t.check('staff with monitoring access list and search errors',
  (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'occurrences' = '2' from j where k = 'errs'));
select t.run('authenticated', :'padmin', format($q$insert into j select 'err', fp_admin_app_error(%s)$q$, :'errId'));
select t.check('the error detail names the last user and tenant, without the fingerprint',
  (select v ->> 'last_user_email' = 'owner@alpha.test' and v ->> 'last_org_name' = 'Alpha Towers' and not v ? 'fingerprint' from j where k = 'err'));
select t.check('support staff (no monitoring access) cannot see errors',
  t.run('authenticated', :'support', $q$select fp_admin_app_errors('open', null, null, 50, 0)$q$) like 'err:%'
  and t.run('authenticated', :'support', $q$select * from fp_app_errors$q$) = 'ok:0');

select t.run('authenticated', :'padmin', format($q$select fp_admin_app_errors_set(array[%s]::bigint[], 'resolved')$q$, :'errId'));
select t.check('resolving an error records who and when, and is audited',
  (select status = 'resolved' and resolved_by = :'padmin' and resolved_at is not null from fp_app_errors where id = :'errId')
  and exists (select 1 from fp_admin_audit where action = 'error.resolved' and admin_id = :'padmin'));
select t.run('anon', null, $q$select fp_log_client_error('{"message":"Cannot read properties of undefined (reading ''id'')","stack":"TypeError: x\n    at WorkOrder (https://facilitypro.tech/assets/WorkOrder-Qq000000.js:1:1)"}')$q$);
select t.check('a resolved error that happens again reopens',
  (select status = 'open' and reopened = 1 and resolved_by is null and occurrences = 3 from fp_app_errors where id = :'errId'));
select t.run('authenticated', :'padmin', format($q$select fp_admin_app_errors_set(array[%s]::bigint[], 'ignored')$q$, :'errId'));
select t.run('anon', null, $q$select fp_log_client_error('{"message":"Cannot read properties of undefined (reading ''id'')","stack":"TypeError: x\n    at WorkOrder (https://facilitypro.tech/assets/WorkOrder-Qq000000.js:1:1)"}')$q$);
select t.check('an ignored error stays ignored but keeps counting',
  (select status = 'ignored' and occurrences = 4 from fp_app_errors where id = :'errId'));
select t.check('invalid statuses are refused',
  t.run('authenticated', :'padmin', format($q$select fp_admin_app_errors_set(array[%s]::bigint[], 'deleted')$q$, :'errId')) like 'err:%');

insert into fp_app_errors (fingerprint, source, message, first_seen)
  select 'flood' || g, 'web', 'e' || g, now() from generate_series(1, 300) g;
select t.run('anon', null, $q$select fp_log_client_error('{"message":"brand new"}')$q$);
select t.check('at most 300 new error groups an hour (a flood cannot fill the table)',
  not exists (select 1 from fp_app_errors where message = 'brand new'));
delete from fp_app_errors where fingerprint like 'flood%';

-- ===========================================================================
-- Status
-- ===========================================================================
insert into fp_billing_events (provider, event_id, type, status, error) values ('stripe', 'evt_1', 'invoice.paid', 'failed', 'no org');
select t.run('authenticated', :'padmin', $q$insert into j select 'st', fp_admin_monitoring_status()$q$);
select t.check('the status page gathers checks, jobs, errors, email, webhooks, set-up and database',
  (select v ? 'checks' and v ? 'jobs' and v ? 'errors' and v ? 'outbox' and v ? 'webhooks' and v ? 'setup'
          and (v -> 'database' ->> 'size_bytes')::bigint > 0 and jsonb_array_length(v -> 'hourly') = 24
          and (v -> 'webhooks' ->> 'failed_24h')::int = 1
   from j where k = 'st'));
select t.check('failed payment webhooks are a health problem',
  exists (select 1 from fp_system_checks() where check_name = 'webhook_failures' and not ok)
  and fp_system_status() -> 'problems' ? 'webhook_failures');
select t.check('support staff and tenants cannot see the status page',
  t.run('authenticated', :'support', $q$select fp_admin_monitoring_status()$q$) like 'err:%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_monitoring_status()$q$) like 'err:%');

select t.run('service_role', null, $q$select fp_run_job('check_job_health')$q$);
select t.check('health alerts go to active staff with monitoring access only, and point to Monitoring',
  exists (select 1 from fp_notification_outbox where to_address = 'admin@platform.test' and subject = 'FacilityPro: webhook failures needs attention' and body like '%Admin → Monitoring → Webhooks%')
  and exists (select 1 from fp_notification_outbox where to_address = 'super@platform.test' and subject like 'FacilityPro:%')
  and not exists (select 1 from fp_notification_outbox where to_address in ('support@platform.test', 'gone@platform.test')));

-- ===========================================================================
-- Background jobs
-- ===========================================================================
select t.run('authenticated', :'padmin', $q$insert into j select 'jobs', fp_admin_jobs()$q$);
select t.check('the job list shows every job with where it runs and its last run',
  (select jsonb_array_length(v) = (select count(*) from fp_jobs)
          and exists (select 1 from jsonb_array_elements(v) x where x ->> 'job' = 'check_job_health' and x ->> 'runs_in' = 'database' and (x ->> 'runs_24h')::int >= 1)
          and exists (select 1 from jsonb_array_elements(v) x where x ->> 'job' = 'process_outbox' and x ->> 'runs_in' = 'edge')
   from j where k = 'jobs'));

select t.run('authenticated', :'padmin', $q$insert into j select 'run', fp_admin_run_job('close_solved_tickets')$q$);
select t.check('"Run now" runs the job, records the run and audits it, and the staff session is restored',
  (select v ->> 'ok' = 'true' and v ->> 'started' = 'false' from j where k = 'run')
  and (select admin_id = :'padmin' from fp_admin_audit where action = 'job.run')
  and exists (select 1 from fp_job_runs where job = 'close_solved_tickets' and ok)
  and exists (select 1 from fp_admin_audit where action = 'job.run' and target_id = 'close_solved_tickets'));
select t.check('a job cannot be run again within a minute',
  t.run('authenticated', :'padmin', $q$select fp_admin_run_job('close_solved_tickets')$q$) like 'err:%job_ran_recently%');
select t.run('authenticated', :'padmin', $q$select fp_admin_run_job('process_outbox')$q$) as r \gset
select t.check('an Edge Function job that cannot start (no Vault) is recorded as a failed run',
  :'r' = 'ok:1'
  and exists (select 1 from fp_job_runs where job = 'process_outbox' and ok is false and error like '%Vault%'));
select t.run('authenticated', :'padmin', $q$insert into j select 'runs', fp_admin_job_runs('close_solved_tickets', 10, 0)$q$);
select t.check('run history pages newest first',
  (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'ok' = 'true' from j where k = 'runs'));
select t.check('support staff and tenants cannot run jobs; the scheduler still can',
  t.run('authenticated', :'support', $q$select fp_admin_run_job('prune_audit_log')$q$) like 'err:%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_run_job('prune_audit_log')$q$) like 'err:%'
  and t.run('authenticated', :'ownerA', $q$select fp_run_job('prune_audit_log')$q$) like 'err:%'
  and t.run('service_role', null, $q$select fp_run_job('prune_audit_log')$q$) = 'ok:1');

-- ===========================================================================
-- Email queue
-- ===========================================================================
insert into fp_notification_outbox (org_id, channel, to_address, subject, body, status, error, attempts)
  select :'orgA', 'email', 'x' || g || '@alpha.test', 'Work order ' || g, 'private body', 'failed', 'Resend 422', 5 from generate_series(1, 3) g;
insert into fp_notification_outbox (org_id, channel, to_address, subject, body)
  values (:'orgA', 'email', 'queued@alpha.test', 'Queued', 'private body');
select t.run('authenticated', :'padmin', $q$insert into j select 'ob', fp_admin_outbox('failed', null, 'alpha', 50, 0)$q$);
select t.check('staff list the queue with tenant names but never message bodies',
  (select (v ->> 'total')::int = 3 and v -> 'rows' -> 0 ->> 'org_name' = 'Alpha Towers'
          and v::text not like '%private body%' from j where k = 'ob'));
select t.run('authenticated', :'padmin', $q$insert into j select 'obs', fp_admin_outbox_stats()$q$);
select t.check('queue stats group failures by reason',
  (select exists (select 1 from jsonb_array_elements(v -> 'top_errors') e where e ->> 'error' = 'Resend 422' and (e ->> 'count')::int = 3)
   from j where k = 'obs'));
select t.run('authenticated', :'padmin', $q$select fp_admin_outbox_retry(null)$q$) as r \gset
select t.check('"Retry" puts recent failed messages back in the queue with fresh attempts',
  :'r' = 'ok:1'
  and (select count(*) from fp_notification_outbox where to_address like 'x%@alpha.test' and status = 'pending' and attempts = 0 and error is null) = 3
  and exists (select 1 from fp_admin_audit where action = 'outbox.retry' and (after ->> 'count')::int = 3));
select id as "qid" from fp_notification_outbox where to_address = 'queued@alpha.test' \gset
select t.run('authenticated', :'padmin', format($q$select fp_admin_outbox_cancel(array['%s']::uuid[])$q$, :'qid'));
select t.check('"Cancel" stops a queued message and does not count as a delivery failure',
  (select status = 'failed' and error = 'cancelled by staff' from fp_notification_outbox where id = :'qid')
  and (select detail from fp_system_checks() where check_name = 'outbox_failed') like '0 %');
select t.check('support staff and tenants cannot see or change the queue',
  t.run('authenticated', :'support', $q$select fp_admin_outbox(null, null, null, 50, 0)$q$) like 'err:%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_outbox_retry(null)$q$) like 'err:%'
  and t.run('authenticated', :'support', format($q$select fp_admin_outbox_cancel(array['%s']::uuid[])$q$, :'qid')) like 'err:%');

-- ===========================================================================
-- Webhooks and workflow failures
-- ===========================================================================
insert into fp_billing_events (provider, event_id, type, status, org_id) values ('paypal', 'WH-1', 'PAYMENT.SALE.COMPLETED', 'processed', :'orgA');
select t.run('authenticated', :'padmin', $q$insert into j select 'wh', fp_admin_webhooks(null, 'failed', 50, 0)$q$);
select t.run('authenticated', :'padmin', $q$insert into j select 'wh2', fp_admin_webhooks('paypal', null, 50, 0)$q$);
select t.check('webhook deliveries filter by provider and status, with tenant names and 7-day stats',
  (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'error' = 'no org' and (v -> 'stats' ->> 'stripe:failed')::int = 1 from j where k = 'wh')
  and (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'org_name' = 'Alpha Towers' from j where k = 'wh2'));
insert into fp_workflows (id, org_id, name, trigger_type, is_active)
  values ('a0000000-0000-0000-0000-000000000001', :'orgA', 'Escalate leaks', 'request.created', true);
insert into fp_workflow_runs (workflow_id, status, error) values ('a0000000-0000-0000-0000-000000000001', 'failed', 'boom');
select t.run('authenticated', :'padmin', $q$insert into j select 'wf', fp_admin_workflow_failures(20)$q$);
select t.check('failed workflow runs are listed across tenants',
  (select v -> 0 ->> 'workflow' = 'Escalate leaks' and v -> 0 ->> 'org_name' = 'Alpha Towers' and v -> 0 ->> 'error' = 'boom' from j where k = 'wf'));
select t.check('support staff cannot see webhooks or workflow failures',
  t.run('authenticated', :'support', $q$select fp_admin_webhooks(null, null, 50, 0)$q$) like 'err:%'
  and t.run('authenticated', :'support', $q$select fp_admin_workflow_failures(20)$q$) like 'err:%');

-- ===========================================================================
-- Retention
-- ===========================================================================
update fp_app_errors set last_seen = now() - interval '91 days' where id = :'errId';
select fp_prune_job_runs();
select t.check('errors not seen for 90 days are pruned',
  not exists (select 1 from fp_app_errors where id = :'errId') and exists (select 1 from fp_app_errors));

\ir _report.sql
