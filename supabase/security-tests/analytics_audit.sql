-- Analytics, reports, audit log and security suite (0089). Every check
-- states the intended behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@platform.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin@platform.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'support@platform.test'),
  ('00000000-0000-0000-0000-0000000000f4', 'analyst@platform.test'),
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test'),
  ('00000000-0000-0000-0000-00000000000b', 'owner@beta.test');
\set super   '00000000-0000-0000-0000-0000000000f1'
\set padmin  '00000000-0000-0000-0000-0000000000f2'
\set support '00000000-0000-0000-0000-0000000000f3'
\set analyst '00000000-0000-0000-0000-0000000000f4'
\set ownerA  '00000000-0000-0000-0000-00000000000a'
\set ownerB  '00000000-0000-0000-0000-00000000000b'
insert into fp_platform_admins (user_id, role) values (:'super', 'super_admin'), (:'padmin', 'admin'), (:'support', 'support'), (:'analyst', 'analyst');
select t.run('authenticated', :'ownerA', $q$select fp_create_organization('Alpha Towers')$q$);
select t.run('authenticated', :'ownerB', $q$select fp_create_organization('Beta Clinic')$q$);
select id as "orgA" from fp_organizations where name = 'Alpha Towers' \gset
select id as "orgB" from fp_organizations where name = 'Beta Clinic' \gset
insert into fp_requests (org_id, title, body_original, source_lng, channel) values
  (:'orgA', 'Leak', 'x', 'en', 'web'), (:'orgA', 'Light', 'x', 'en', 'qr'), (:'orgB', 'Door', 'x', 'en', 'web');
insert into fp_daily_activity (day, org_id, user_id) values ((now() at time zone 'utc')::date, :'orgA', :'ownerA'), ((now() at time zone 'utc')::date - 3, :'orgB', :'ownerB');
insert into fp_platform_invoices (number, org_id, amount, status, provider, paid_at, issued_at) values
  ('T-1', :'orgA', 29, 'paid', 'stripe', now(), now()), ('T-2', :'orgA', 29, 'open', 'manual', null, now()), ('T-3', :'orgB', 99, 'paid', 'paypal', now(), now());
create temp table j (k text, v jsonb);
grant all on j to authenticated;

-- ===========================================================================
-- Analytics
-- ===========================================================================
select t.run('authenticated', :'analyst', $q$insert into j select 'an', fp_admin_analytics(now() - interval '30 days', now() + interval '1 minute')$q$);
select t.check('analysts get activity, engagement, adoption, channels, cohorts and tenant usage',
  (select (v -> 'totals' ->> 'requests')::int = 3 and (v -> 'totals' ->> 'active_tenants')::int = 2
          and (v -> 'engagement' ->> 'dau')::int = 1 and (v -> 'engagement' ->> 'wau')::int = 2
          and jsonb_array_length(v -> 'series') >= 30
          and exists (select 1 from jsonb_array_elements(v -> 'channels') c where c ->> 'channel' = 'web' and (c ->> 'count')::int = 2)
          and exists (select 1 from jsonb_array_elements(v -> 'adoption') a where a ->> 'module' = 'requests' and (a ->> 'tenants')::int = 2)
          and jsonb_array_length(v -> 'cohorts') = 6
          and (select (c ->> 'tenants')::int = 2 and (c -> 'active' ->> 0)::int = 2 from jsonb_array_elements(v -> 'cohorts') c
               where c ->> 'month' = to_char(now(), 'YYYY-MM'))
          and jsonb_array_length(v -> 'tenant_usage') = 2
   from j where k = 'an'));
select t.check('support staff and tenants cannot read analytics',
  t.run('authenticated', :'support', $q$select fp_admin_analytics(now() - interval '7 days', now())$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_analytics(now() - interval '7 days', now())$q$) like 'err:%Not authorized%');

-- ===========================================================================
-- Report builder
-- ===========================================================================
select t.run('authenticated', :'analyst', $q$insert into j select 'r1', fp_admin_report('{"dataset":"requests","group_by":"channel"}')$q$);
select t.run('authenticated', :'analyst', $q$insert into j select 'r2', fp_admin_report('{"dataset":"invoices","group_by":"provider","measure":"amount"}')$q$);
select t.run('authenticated', :'analyst', $q$insert into j select 'r3', fp_admin_report('{"dataset":"tenants","group_by":"plan"}')$q$);
select t.check('reports count by a breakdown and sum invoice amounts',
  (select v -> 'rows' = '[{"label":"web","value":2},{"label":"qr","value":1}]'::jsonb from j where k = 'r1')
  and (select (select (r ->> 'value')::numeric from jsonb_array_elements(v -> 'rows') r where r ->> 'label' = 'paypal') = 99
          and (select (r ->> 'value')::numeric from jsonb_array_elements(v -> 'rows') r where r ->> 'label' = 'manual') = 29 from j where k = 'r2')
  and (select (v -> 'rows' -> 0 ->> 'value')::int = 2 from j where k = 'r3'));
select t.check('unknown datasets, breakdowns and measures are refused (no SQL from the caller)',
  t.run('authenticated', :'analyst', $q$select fp_admin_report('{"dataset":"fp_platform_admins","group_by":"month"}')$q$) like 'err:%invalid_dataset%'
  and t.run('authenticated', :'analyst', $q$select fp_admin_report('{"dataset":"requests","group_by":"1; drop table fp_requests"}')$q$) like 'err:%invalid_group_by%'
  and t.run('authenticated', :'analyst', $q$select fp_admin_report('{"dataset":"requests","group_by":"channel","measure":"amount"}')$q$) like 'err:%invalid_measure%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_report('{"dataset":"requests","group_by":"channel"}')$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'analyst', $q$select fp_report_run('{"dataset":"requests","group_by":"channel"}')$q$) like 'err:%permission denied%');

select t.run('authenticated', :'analyst', $q$insert into j select 'sch', to_jsonb(fp_admin_save_report_schedule('{"name":"Weekly requests","frequency":"weekly","recipients":["Boss@Example.com"],"definition":{"dataset":"requests","group_by":"channel"}}'))$q$);
select (v #>> '{}') as "sch" from j where k = 'sch' \gset
select t.check('schedules check the report and the addresses',
  (select recipients = array['boss@example.com'] and next_run_at > now() from fp_report_schedules where id = :'sch')
  and t.run('authenticated', :'analyst', $q$select fp_admin_save_report_schedule('{"name":"x","recipients":["nope"],"definition":{"dataset":"requests","group_by":"channel"}}')$q$) like 'err:%invalid_recipients%'
  and t.run('authenticated', :'analyst', $q$select fp_admin_save_report_schedule('{"name":"x","recipients":["a@b.co"],"definition":{"dataset":"requests","group_by":"nope"}}')$q$) like 'err:%invalid_group_by%');
select t.run('authenticated', :'analyst', format($q$select fp_admin_send_report_now(%L)$q$, :'sch')) as r \gset
select t.check('"send now" emails the report to each recipient',
  :'r' = 'ok:1' and exists (select 1 from fp_notification_outbox where to_address = 'boss@example.com'
                             and subject = 'FacilityPro report: Weekly requests' and body like '%web%2%'));
update fp_report_schedules set next_run_at = now() - interval '1 minute', last_sent_at = null where id = :'sch';
select fp_send_scheduled_reports();
select t.check('the job sends due schedules and moves them on a week',
  (select last_sent_at is not null and next_run_at > now() + interval '6 days' from fp_report_schedules where id = :'sch'));

-- ===========================================================================
-- Audit log
-- ===========================================================================
select t.run('authenticated', :'padmin', format($q$select fp_admin_set_suspended(%L, true, 'Unpaid invoices')$q$, :'orgB'));
select t.run('authenticated', :'padmin', $q$insert into j select 'aud', fp_admin_audit_list(p_action => 'tenant')$q$);
select t.run('authenticated', :'padmin', $q$insert into j select 'aud2', fp_admin_audit_list(p_search => 'Unpaid')$q$);
select t.run('authenticated', :'padmin', $q$insert into j select 'fac', fp_admin_audit_facets()$q$);
select t.check('admins search the audit trail by action group and text, with who and which tenant',
  (select (v ->> 'total')::int >= 1 and v -> 'rows' -> 0 ->> 'admin_email' = 'admin@platform.test'
          and v -> 'rows' -> 0 ->> 'org_name' = 'Beta Clinic' from j where k = 'aud')
  and (select (v ->> 'total')::int >= 1 from j where k = 'aud2')
  and (select v -> 'actions' ? 'tenant.suspend' from j where k = 'fac'));
select t.check('support staff, analysts and tenants cannot read the audit trail; nobody can change it',
  t.run('authenticated', :'support', $q$select fp_admin_audit_list()$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'analyst', $q$select fp_admin_audit_list()$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'super', $q$delete from fp_admin_audit$q$) not like 'ok:1%'
  and (select count(*) > 0 from fp_admin_audit));

-- ===========================================================================
-- Security: staff 2FA
-- ===========================================================================
select t.check('only super admins open security settings',
  t.run('authenticated', :'padmin', $q$select fp_admin_security_overview()$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'super', $q$select fp_admin_security_overview()$q$) = 'ok:1');
select t.check('requiring 2FA from a session without 2FA is refused (no self lock-out)',
  t.run('authenticated', :'super', $q$select fp_admin_save_security('{"admin_require_2fa":true}')$q$) like 'err:%mfa_needed_first%');
select set_config('request.jwt.claim.aal', 'aal2', false);
select t.run('authenticated', :'super', $q$select fp_admin_save_security('{"admin_require_2fa":true,"admin_session_minutes":30}')$q$) as r \gset
select t.check('from a 2FA session it can be turned on; the change is audited',
  :'r' = 'ok:1' and (select admin_require_2fa and admin_session_minutes = 30 from fp_platform_settings)
  and exists (select 1 from fp_admin_audit where target_type = 'fp_platform_settings' and admin_id = :'super'));
select t.run('authenticated', :'padmin', $q$insert into j select 'perm2', fp_admin_permissions()$q$);
select t.check('with 2FA, staff keep their role',
  (select v ->> 'role' = 'admin' and v ->> 'mfa_required' = 'false' and (v ->> 'session_minutes')::int = 30 from j where k = 'perm2')
  and t.run('authenticated', :'padmin', $q$select fp_admin_tenants()$q$) = 'ok:1');
select set_config('request.jwt.claim.aal', 'aal1', false);
select t.run('authenticated', :'padmin', $q$insert into j select 'perm1', fp_admin_permissions()$q$);
select t.check('without 2FA, staff have no role at all: every admin function and table refuses them',
  (select v ->> 'role' is null and v ->> 'mfa_required' = 'true' from j where k = 'perm1')
  and t.run('authenticated', :'padmin', $q$select fp_admin_tenants()$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'super', $q$select fp_admin_security_overview()$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'super', 'select * from fp_platform_invoices') = 'ok:0'
  and not (select fp_is_platform_admin()));
select set_config('request.jwt.claim.aal', '', false);
select t.run('authenticated', :'padmin', $q$insert into j select 'perm0', fp_admin_permissions()$q$);
select t.check('a session with no authentication level at all is treated as without 2FA',
  (select v ->> 'role' is null and v ->> 'mfa_required' = 'true' from j where k = 'perm0'));
select t.check('tenants are not affected by the staff 2FA rule',
  t.run('authenticated', :'ownerA', format($q$select * from fp_requests where org_id = %L$q$, :'orgA')) = 'ok:2');
select set_config('request.jwt.claim.aal', '', false);
update fp_platform_settings set admin_require_2fa = false;
select t.check('session timeout is limited to 5 minutes – 7 days',
  t.run('authenticated', :'super', $q$select fp_admin_save_security('{"admin_session_minutes":1}')$q$) like 'err:%invalid_value%');

\ir _report.sql
