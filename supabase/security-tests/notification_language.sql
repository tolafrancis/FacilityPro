-- Notification language suite (0075). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@a.test');
\set admin '00000000-0000-0000-0000-00000000000a'
\set tech  '00000000-0000-0000-0000-0000000000a1'
select t.run('authenticated', :'admin', $q$select fp_create_organization('Công ty A', 'vi')$q$);
select id as "org" from fp_organizations where name = 'Công ty A' \gset
insert into fp_invites (org_id, email, role, token) values (:'org', 'tech@a.test', 'technician', '10000000-0000-0000-0000-000000000001');
select t.run('authenticated', :'tech', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);
update fp_users_orgs set preferred_lng = 'vi' where user_id = :'tech';
insert into fp_notification_prefs (user_id, email_enabled) values (:'tech', true);

select t.run('authenticated', :'admin', format($q$
  insert into fp_work_orders (org_id, title, assigned_to) values (%L, 'Thay lọc gió', %L)$q$, :'org', :'tech'));

select t.check('a generated notification carries English and Vietnamese titles; the work order title is kept',
  (select title_i18n ->> 'vi' = 'Có lệnh công việc mới được giao' and title_i18n ->> 'en' = 'New work order assigned'
          and body = 'Thay lọc gió'
   from fp_notifications where user_id = :'tech' and kind = 'wo_assigned'));
select t.check('emails go out in the recipient''s language',
  exists (select 1 from fp_notification_outbox where to_address = 'tech@a.test' and channel = 'email'
          and subject = 'Có lệnh công việc mới được giao')
  and not exists (select 1 from fp_notification_outbox where to_address = 'tech@a.test' and subject like 'Work order%'));
select t.check('patterns with names are translated too',
  fp_localize('New message from Chị Lan', 'vi') = 'Tin nhắn mới từ Chị Lan'
  and fp_localize('No data since 2026-09-24 10:00.', 'vi') = 'Không có dữ liệu từ 2026-09-24 10:00.'
  and fp_localize('Something a person typed', 'vi') = 'Something a person typed'
  and fp_localize('Low stock', 'en') = 'Low stock');
select t.check('a new organisation''s default fault and asset types have Vietnamese names',
  (select name_i18n ->> 'vi' from fp_fault_types where org_id = :'org' and name_i18n ->> 'en' = 'Water Leak') = 'Rò rỉ nước'
  and (select name_i18n ->> 'vi' from fp_asset_types where org_id = :'org' and name_i18n ->> 'en' = 'Elevator') = 'Thang máy');

insert into fp_pm_schedules (id, org_id, name_i18n, interval_days, next_due_at)
  values ('90000000-0000-0000-0000-000000000001', :'org', '{"en":"Monthly filter change","vi":"Thay lọc hàng tháng"}', 30, now() - interval '1 hour');
select t.run('service_role', null, $q$select fp_run_job('generate_due_pm')$q$);
select t.check('PM work orders are titled in the organisation''s language',
  (select title from fp_work_orders where pm_schedule_id = '90000000-0000-0000-0000-000000000001' limit 1) = 'Thay lọc hàng tháng');

\ir _report.sql
