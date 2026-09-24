-- Inventory integrity suite (0070). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@a.test');
\set admin '00000000-0000-0000-0000-00000000000a'
\set tech  '00000000-0000-0000-0000-0000000000a1'
select t.run('authenticated', :'admin', $q$select fp_create_organization('Org A')$q$);
select id as "org" from fp_organizations where name = 'Org A' \gset
insert into fp_invites (org_id, email, role, token) values (:'org', 'tech@a.test', 'technician', '10000000-0000-0000-0000-000000000001');
select t.run('authenticated', :'tech', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);
insert into fp_technician_profiles (org_id, user_id, labor_rate) values (:'org', :'tech', 20);

select t.run('authenticated', :'admin', format($q$
  insert into fp_parts (id, org_id, name_i18n, stock_balance, unit_cost) values
    ('30000000-0000-0000-0000-000000000001', %L, '{"en":"Filter"}', 5, 2)$q$, :'org')) as r \gset
select t.check('a new part''s starting stock is recorded as an opening receipt in the ledger',
  :'r' = 'ok:1'
  and (select stock_balance from fp_parts where id = '30000000-0000-0000-0000-000000000001') = 5
  and (select sum(quantity_delta) from fp_inventory_transactions where part_id = '30000000-0000-0000-0000-000000000001') = 5);

select t.run('authenticated', :'admin', format($q$
  insert into fp_work_orders (id, org_id, title) values ('40000000-0000-0000-0000-000000000001', %L, 'Replace filter')$q$, :'org'));
select t.run('authenticated', :'admin', format($q$
  update fp_work_orders set assigned_to = %L where id = '40000000-0000-0000-0000-000000000001'$q$, :'tech'));

select t.run('authenticated', :'tech', format($q$
  insert into fp_wo_parts (id, org_id, work_order_id, part_id, quantity) values
    ('70000000-0000-0000-0000-000000000001', %L, '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 3)$q$, :'org')) as r \gset
select t.check('the assigned technician can issue parts; stock goes down and the ledger records who',
  :'r' = 'ok:1'
  and (select stock_balance from fp_parts where id = '30000000-0000-0000-0000-000000000001') = 2
  and (select created_by from fp_inventory_transactions where type = 'issue') = :'tech'::uuid);
select t.check('issuing more than is in stock is refused',
  t.run('authenticated', :'tech', format($q$
    insert into fp_wo_parts (org_id, work_order_id, part_id, quantity) values
      (%L, '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 3)$q$, :'org')) like 'err:Not enough stock%'
  and (select stock_balance from fp_parts where id = '30000000-0000-0000-0000-000000000001') = 2);

select t.run('authenticated', :'tech', $q$delete from fp_wo_parts where id = '70000000-0000-0000-0000-000000000001'$q$) as r \gset
select t.check('removing a part line returns the stock',
  :'r' = 'ok:1'
  and (select stock_balance from fp_parts where id = '30000000-0000-0000-0000-000000000001') = 5
  and exists (select 1 from fp_inventory_transactions where type = 'return' and quantity_delta = 3));

select t.run('authenticated', :'admin', $q$update fp_parts set stock_balance = 9 where id = '30000000-0000-0000-0000-000000000001'$q$);
select t.check('a direct stock edit is recorded as an adjustment, so the ledger always adds up',
  (select sum(quantity_delta) from fp_inventory_transactions where part_id = '30000000-0000-0000-0000-000000000001') = 9
  and (select stock_balance from fp_parts where id = '30000000-0000-0000-0000-000000000001') = 9);

update fp_organizations set settings = settings || '{"allow_negative_stock": true}' where id = :'org';
select t.check('an organisation can allow negative stock',
  t.run('authenticated', :'tech', format($q$
    insert into fp_wo_parts (org_id, work_order_id, part_id, quantity) values
      (%L, '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 10)$q$, :'org')) = 'ok:1');

-- ===========================================================================
-- Labour
-- ===========================================================================
select t.run('authenticated', :'tech', format($q$
  insert into fp_wo_labor (org_id, work_order_id, minutes, rate_snapshot) values
    (%L, '40000000-0000-0000-0000-000000000001', 60, 999)$q$, :'org')) as r \gset
select t.check('a technician''s time uses their profile rate, not a rate they send',
  :'r' = 'ok:1' and (select rate_snapshot from fp_wo_labor where user_id = :'tech') = 20);
select t.check('a technician cannot log time as someone else',
  t.run('authenticated', :'tech', format($q$
    insert into fp_wo_labor (org_id, work_order_id, user_id, minutes) values
      (%L, '40000000-0000-0000-0000-000000000001', %L, 60)$q$, :'org', :'admin')) like 'err:%');
select t.run('authenticated', :'tech', $q$update fp_wo_labor set rate_snapshot = 999, minutes = 90$q$);
select t.check('a technician cannot raise their rate by editing the line',
  (select rate_snapshot from fp_wo_labor where user_id = :'tech') = 20
  and (select minutes from fp_wo_labor where user_id = :'tech') = 90);
select t.check('a manager can set a specific rate',
  t.run('authenticated', :'admin', format($q$
    insert into fp_wo_labor (org_id, work_order_id, user_id, minutes, rate_snapshot) values
      (%L, '40000000-0000-0000-0000-000000000001', %L, 30, 35)$q$, :'org', :'tech')) = 'ok:1');

-- ===========================================================================
-- Locked when finished
-- ===========================================================================
set session_replication_role = replica;  -- jump straight to closed (lifecycle trigger bypassed)
update fp_work_orders set status = 'closed' where id = '40000000-0000-0000-0000-000000000001';
set session_replication_role = origin;
select t.check('parts and labour cannot be added to a closed work order',
  t.run('authenticated', :'admin', format($q$
    insert into fp_wo_parts (org_id, work_order_id, part_id, quantity) values
      (%L, '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1)$q$, :'org')) like 'err:%can no longer be changed%'
  and t.run('authenticated', :'admin', $q$delete from fp_wo_labor$q$) like 'err:%can no longer be changed%');

select t.check('a part with stock history cannot be hard-deleted (its ledger is kept)',
  t.run('authenticated', :'admin', $q$delete from fp_parts where id = '30000000-0000-0000-0000-000000000001'$q$) like 'err:%'
  and exists (select 1 from fp_inventory_transactions where part_id = '30000000-0000-0000-0000-000000000001'));

delete from fp_organizations where id = :'org';
select t.check('deleting an organisation still removes its parts and ledger',
  not exists (select 1 from fp_inventory_transactions where org_id = :'org')
  and not exists (select 1 from fp_parts where org_id = :'org'));

\ir _report.sql
