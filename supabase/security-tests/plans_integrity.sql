-- Plan limits + data integrity suite (0072). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email)
  select ('00000000-0000-0000-0000-0000000000' || lpad(to_hex(g), 2, '0'))::uuid, 'u' || g || '@a.test'
  from generate_series(1, 20) g;
\set admin '00000000-0000-0000-0000-000000000001'
select t.run('authenticated', :'admin', $q$select fp_create_organization('Org A')$q$);
select id as "org" from fp_organizations where name = 'Org A' \gset

-- ===========================================================================
-- New organisations
-- ===========================================================================
select t.check('a new organisation starts on a 14-day Pro trial',
  (select plan_code = 'pro' and status = 'trialing'
          and current_period_end between now() + interval '13 days' and now() + interval '15 days'
   from fp_subscriptions where org_id = :'org'));
select t.check('a new organisation gets the default expense categories',
  (select count(*) from fp_expense_categories where org_id = :'org') = 6);

-- ===========================================================================
-- Limits (free plan: 25 assets, 3 members, 1 site)
-- ===========================================================================
update fp_subscriptions set current_period_end = now() - interval '1 day' where org_id = :'org';

insert into fp_sites (org_id, name_i18n) values (:'org', '{"en":"HQ"}');
select t.check('after the trial, the free plan''s site limit applies',
  t.run('authenticated', :'admin', format($q$insert into fp_sites (org_id, name_i18n) values (%L, '{"en":"Branch"}')$q$, :'org'))
    like 'err:plan_limit_reached:sites%');

select t.run('authenticated', :'admin', format($q$
  insert into fp_assets (org_id, name_i18n) select %L, '{"en":"A"}' from generate_series(1, 25)$q$, :'org')) as r \gset
select t.check('assets up to the limit are allowed; the next one is refused',
  :'r' = 'ok:25'
  and t.run('authenticated', :'admin', format($q$insert into fp_assets (org_id, name_i18n) values (%L, '{"en":"B"}')$q$, :'org'))
    like 'err:plan_limit_reached:assets%');
update fp_assets set status = 'retired' where id = (select id from fp_assets where org_id = :'org' limit 1);
select t.check('retired assets don''t count towards the limit',
  t.run('authenticated', :'admin', format($q$insert into fp_assets (org_id, name_i18n) values (%L, '{"en":"C"}')$q$, :'org')) = 'ok:1');

select t.run('authenticated', :'admin', format($q$
  insert into fp_invites (org_id, email, role) values (%L, 'u2@a.test', 'technician'), (%L, 'u3@a.test', 'technician')$q$, :'org', :'org')) as r \gset
select t.check('pending invitations count towards the member limit',
  :'r' = 'ok:2'
  and t.run('authenticated', :'admin', format($q$insert into fp_invites (org_id, email, role) values (%L, 'u4@a.test', 'technician')$q$, :'org'))
    like 'err:plan_limit_reached:members%');
select token as "tok" from fp_invites where email = 'u2@a.test' \gset
select t.check('invited members within the limit can still join',
  t.run('authenticated', '00000000-0000-0000-0000-000000000002', format($q$select fp_accept_invite(%L)$q$, :'tok')) = 'ok:1');
select t.check('occupants and vendors don''t count towards the member limit (0095)',
  t.run('authenticated', :'admin', format($q$
    insert into fp_invites (org_id, email, role) values (%L, 'u5@a.test', 'occupant'), (%L, 'u6@a.test', 'vendor')$q$, :'org', :'org')) = 'ok:2');
select token as "tok" from fp_invites where email = 'u5@a.test' \gset
select t.check('an occupant can join when the staff limit is full, and isn''t counted in usage',
  t.run('authenticated', '00000000-0000-0000-0000-000000000005', format($q$select fp_accept_invite(%L)$q$, :'tok')) = 'ok:1'
  and fp_staff_count(:'org') = 2);
select t.check('five active plans, Enterprise priced on request (0095)',
  (select array_agg(code order by sort) from fp_plans where active) = array['free', 'starter', 'pro', 'business', 'enterprise']
  and (select contact_sales from fp_plans where code = 'enterprise'));

update fp_subscriptions set plan_code = 'business', status = 'active', current_period_end = now() + interval '30 days' where org_id = :'org';
select t.check('an active paid plan lifts the limits',
  t.run('authenticated', :'admin', format($q$insert into fp_sites (org_id, name_i18n) values (%L, '{"en":"Branch"}')$q$, :'org')) = 'ok:1');
select t.check('members can read their usage and limits',
  t.run('authenticated', :'admin', format($q$select fp_plan_usage(%L)$q$, :'org')) = 'ok:1'
  and (fp_plan_usage(:'org') -> 'sites' ->> 'used')::int = 2);

-- ===========================================================================
-- Bookings, catalogues, values
-- ===========================================================================
insert into fp_desks (id, org_id, name_i18n) values ('d1000000-0000-0000-0000-000000000001', :'org', '{"en":"Desk 1"}');
select t.run('authenticated', :'admin', format($q$
  insert into fp_desk_bookings (org_id, desk_id, booked_by, booked_for) values (%L, 'd1000000-0000-0000-0000-000000000001', %L, '2026-10-01')$q$, :'org', :'admin'));
select t.check('a desk cannot be booked twice for the same day',
  t.run('authenticated', :'admin', format($q$
    insert into fp_desk_bookings (org_id, desk_id, booked_by, booked_for) values (%L, 'd1000000-0000-0000-0000-000000000001', %L, '2026-10-01')$q$, :'org', :'admin'))
    like 'err:%duplicate%');
select t.check('re-adding an existing fault type name is refused (no duplicate catalogue entries)',
  t.run('authenticated', :'admin', format($q$
    insert into fp_fault_types (org_id, name_i18n) select %L, name_i18n from fp_fault_types where org_id = %L limit 1$q$, :'org', :'org'))
    like 'err:%duplicate%');
select t.check('an unknown priority is refused',
  t.run('authenticated', :'admin', format($q$
    insert into fp_requests (org_id, title, body_original, source_lng, priority) values (%L, 'x', 'x', 'en', 'urgent!!')$q$, :'org')) like 'err:%');

-- ===========================================================================
-- Work order versions
-- ===========================================================================
select t.run('authenticated', :'admin', format($q$
  insert into fp_work_orders (id, org_id, title) values ('40000000-0000-0000-0000-000000000001', %L, 'Fix')$q$, :'org'));
select t.run('authenticated', :'admin', $q$update fp_work_orders set title = 'Fix pump' where id = '40000000-0000-0000-0000-000000000001'$q$);
select t.check('every change to a work order increases its version',
  (select version from fp_work_orders where id = '40000000-0000-0000-0000-000000000001') = 2);
select t.check('an edit based on an old version changes nothing (the app then reports the conflict)',
  t.run('authenticated', :'admin', $q$update fp_work_orders set title = 'Stale edit' where id = '40000000-0000-0000-0000-000000000001' and version = 1$q$) = 'ok:0');

\ir _report.sql
