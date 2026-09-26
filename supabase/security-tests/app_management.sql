-- App management suite (0088). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@platform.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin@platform.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'support@platform.test'),
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@alpha.test'),
  ('00000000-0000-0000-0000-00000000000b', 'owner@beta.test');
\set super   '00000000-0000-0000-0000-0000000000f1'
\set padmin  '00000000-0000-0000-0000-0000000000f2'
\set support '00000000-0000-0000-0000-0000000000f3'
\set ownerA  '00000000-0000-0000-0000-00000000000a'
\set techA   '00000000-0000-0000-0000-0000000000a1'
\set ownerB  '00000000-0000-0000-0000-00000000000b'
insert into fp_platform_admins (user_id, role) values (:'super', 'super_admin'), (:'padmin', 'admin'), (:'support', 'support');
select t.run('authenticated', :'ownerA', $q$select fp_create_organization('Alpha Towers')$q$);
select t.run('authenticated', :'ownerB', $q$select fp_create_organization('Beta Clinic')$q$);
select id as "orgA" from fp_organizations where name = 'Alpha Towers' \gset
select id as "orgB" from fp_organizations where name = 'Beta Clinic' \gset
insert into fp_users_orgs (user_id, org_id, role) values (:'techA', :'orgA', 'technician');
-- Alpha pays for Business; Beta stays on its Pro trial.
update fp_subscriptions set plan_code = 'business', status = 'active' where org_id = :'orgA';
create temp table j (k text, v jsonb);
grant all on j to authenticated, anon;

-- ===========================================================================
-- Settings and maintenance
-- ===========================================================================
select t.run('authenticated', :'super', $q$select fp_admin_save_settings('{"app_name":"FacilityPro","supported_lngs":["en","vi"],"default_lng":"vi","maintenance_mode":true,"maintenance_message":"Upgrading the database","maintenance_until":"2030-01-01T02:00:00Z","mobile_min_version":"1.2","mobile_latest_version":"1.4.2","support_email":"help@example.com"}')$q$) as r \gset
select t.run('anon', null, $q$insert into j select 'status', fp_app_status()$q$);
select t.check('a super admin turns on maintenance; anyone can read the app status',
  :'r' = 'ok:1'
  and (select v ->> 'maintenance_mode' = 'true' and v ->> 'maintenance_message' = 'Upgrading the database' and v ->> 'maintenance_until' is not null
              and v ->> 'mobile_latest_version' = '1.4.2' and v ->> 'support_email' = 'help@example.com' from j where k = 'status')
  and exists (select 1 from fp_admin_audit where target_type = 'fp_platform_settings' and admin_id = :'super'));
select t.check('bad settings are refused',
  t.run('authenticated', :'super', $q$select fp_admin_save_settings('{"supported_lngs":["en"],"default_lng":"vi"}')$q$) like 'err:%invalid_default_language%'
  and t.run('authenticated', :'super', $q$select fp_admin_save_settings('{"default_timezone":"Mars/Base"}')$q$) like 'err:%invalid_timezone%'
  and t.run('authenticated', :'super', $q$select fp_admin_save_settings('{"mobile_min_version":"2.0","mobile_latest_version":"1.9"}')$q$) like 'err:%invalid_version%'
  and t.run('authenticated', :'super', $q$select fp_admin_save_settings('{"email_from_address":"nope"}')$q$) like 'err:%invalid_email%');
select t.check('only super admins change settings',
  t.run('authenticated', :'padmin', $q$select fp_admin_save_settings('{"maintenance_mode":false}')$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_save_settings('{"maintenance_mode":false}')$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', $q$update fp_platform_settings set maintenance_mode = false$q$) not like 'ok:1');

-- ===========================================================================
-- Features & modules
-- ===========================================================================
select t.run('authenticated', :'super', $q$select fp_admin_save_flag('{"key":"new_dashboard","description":"The redesigned dashboard","enabled":true,"rollout_pct":0}')$q$) as r \gset
select t.check('a new feature at 0% rollout is on for nobody',
  :'r' = 'ok:1' and not fp_flag_enabled('new_dashboard', :'orgA') and not fp_flag_enabled('new_dashboard', :'orgB'));
select t.run('authenticated', :'super', $q$select fp_admin_save_flag('{"key":"new_dashboard","rollout_pct":100}')$q$);
select t.run('authenticated', :'support', $q$insert into j select 'flags', fp_admin_flags()$q$);
select t.check('at 100% it is on for every tenant, and the list says so',
  fp_flag_enabled('new_dashboard', :'orgA')
  and (select (x ->> 'tenants_on')::int = 2 and (x ->> 'tenants_total')::int = 2
       from j, jsonb_array_elements(v) x where k = 'flags' and x ->> 'key' = 'new_dashboard'));
select t.run('authenticated', :'super', $q$select fp_admin_save_flag('{"key":"iot","enabled":false}')$q$);
select t.run('authenticated', :'techA', format($q$insert into j select 'orgflags', fp_org_flags(%L)$q$, :'orgA'));
select t.check('switching a module off shows in the tenant''s flags',
  (select v ->> 'iot' = 'false' and v ->> 'work_orders' = 'true' from j where k = 'orgflags'));
select t.check('modules can''t be deleted; features can; admins and tenants can''t change flags',
  t.run('authenticated', :'super', $q$select fp_admin_delete_flag('iot')$q$) like 'err:%module_flag%'
  and t.run('authenticated', :'super', $q$select fp_admin_delete_flag('new_dashboard')$q$) = 'ok:1'
  and t.run('authenticated', :'padmin', $q$select fp_admin_save_flag('{"key":"x1","enabled":true}')$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', $q$update fp_feature_flags set enabled = true where key = 'iot'$q$) not like 'ok:1'
  and exists (select 1 from fp_admin_audit where target_type = 'fp_feature_flags' and target_id = 'iot'));

-- ===========================================================================
-- Announcements
-- ===========================================================================
select t.run('authenticated', :'padmin', $q$insert into j select 'a_all', to_jsonb(fp_admin_save_announcement('{"title":"New mobile app","body":"Version 1.4 is out.","level":"info","audience":"all","published_at":"2020-01-01T00:00:00Z"}'))$q$);
select t.run('authenticated', :'padmin', $q$insert into j select 'a_biz', to_jsonb(fp_admin_save_announcement('{"title":"Business webinar","body":"Join us Friday.","audience":"plans","plan_codes":["business"],"published_at":"2020-01-01T00:00:00Z"}'))$q$);
select t.run('authenticated', :'padmin', format($q$insert into j select 'a_crit', to_jsonb(fp_admin_save_announcement(jsonb_build_object('title', 'Planned outage', 'body', 'Sunday 01:00–02:00', 'level', 'critical', 'audience', 'tenants', 'org_ids', jsonb_build_array(%L), 'published_at', '2020-01-01T00:00:00Z')))$q$, :'orgB'));
select t.run('authenticated', :'padmin', $q$insert into j select 'a_draft', to_jsonb(fp_admin_save_announcement('{"title":"Draft","body":"Not yet."}'))$q$);
select t.run('authenticated', :'padmin', $q$insert into j select 'a_old', to_jsonb(fp_admin_save_announcement('{"title":"Old","body":"Gone.","published_at":"2020-01-01T00:00:00Z","expires_at":"2020-02-01T00:00:00Z"}'))$q$);
select t.check('bad announcements are refused',
  t.run('authenticated', :'padmin', $q$select fp_admin_save_announcement('{"title":"x","body":"y","audience":"plans","plan_codes":[]}')$q$) like 'err:%invalid_audience%'
  and t.run('authenticated', :'padmin', $q$select fp_admin_save_announcement('{"title":"x","body":"y","published_at":"2030-01-02T00:00:00Z","expires_at":"2030-01-01T00:00:00Z"}')$q$) like 'err:%invalid_dates%'
  and t.run('authenticated', :'support', $q$select fp_admin_save_announcement('{"title":"x","body":"y"}')$q$) like 'err:%Not authorized%');

select t.run('authenticated', :'techA', format($q$insert into j select 'seeA', coalesce(jsonb_agg(title), '[]') from fp_my_announcements(%L)$q$, :'orgA'));
select t.run('authenticated', :'ownerB', format($q$insert into j select 'seeB', coalesce(jsonb_agg(title order by title), '[]') from fp_my_announcements(%L)$q$, :'orgB'));
select t.check('tenants see only live announcements meant for them (all, their plan, their tenant)',
  (select v = '["New mobile app", "Business webinar"]'::jsonb or v = '["Business webinar", "New mobile app"]'::jsonb from j where k = 'seeA')
  and (select v = '["New mobile app", "Planned outage"]'::jsonb from j where k = 'seeB'));
select t.check('a tenant can''t read another organisation''s announcements',
  t.run('authenticated', :'ownerB', format($q$select * from fp_my_announcements(%L)$q$, :'orgA')) = 'ok:0');

select (v #>> '{}') as "a_all" from j where k = 'a_all' \gset
select (v #>> '{}') as "a_crit" from j where k = 'a_crit' \gset
select t.run('authenticated', :'ownerB', format($q$select fp_dismiss_announcement(%L)$q$, :'a_all'));
select t.run('authenticated', :'ownerB', format($q$select fp_dismiss_announcement(%L)$q$, :'a_crit'));
select t.run('authenticated', :'ownerB', format($q$insert into j select 'seeB2', coalesce(jsonb_agg(title), '[]') from fp_my_announcements(%L)$q$, :'orgB'));
select t.check('dismissed announcements go away, except critical ones',
  (select v = '["Planned outage"]'::jsonb from j where k = 'seeB2'));
select t.run('authenticated', :'padmin', $q$insert into j select 'list', fp_admin_announcements()$q$);
select t.check('staff see each announcement''s state, reach and dismissals',
  (select bool_and(case x ->> 'title'
                     when 'New mobile app' then x ->> 'state' = 'live' and (x ->> 'tenants')::int = 2 and (x ->> 'dismissed')::int = 1
                     when 'Business webinar' then (x ->> 'tenants')::int = 1
                     when 'Draft' then x ->> 'state' = 'draft'
                     when 'Old' then x ->> 'state' = 'ended'
                     else true end)
   from j, jsonb_array_elements(v) x where k = 'list'));

-- ===========================================================================
-- Message templates
-- ===========================================================================
select t.check('super admins edit message templates; support staff and tenants cannot',
  t.run('authenticated', :'super', $q$update fp_message_templates set body = 'Hi! {{message}}' where key = 'support.ticket_reply' and lng = 'en'$q$) = 'ok:1'
  and t.run('authenticated', :'support', $q$update fp_message_templates set body = 'x' where key = 'support.ticket_reply'$q$) = 'ok:0'
  and t.run('authenticated', :'ownerA', 'select 1 from fp_message_templates') = 'ok:0');
select t.check('templates fill their placeholders and fall back to English',
  (fp_render_template('support.ticket_reply', 'en', '{"message":"Done."}') ->> 'body') = 'Hi! Done.'
  and (fp_render_template('support.ticket_solved', 'fr', '{"number":"7","subject":"QR"}') ->> 'subject') = 'Ticket #7 solved: QR');

\ir _report.sql
