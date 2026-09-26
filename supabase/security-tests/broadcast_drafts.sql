-- Announcement drafts suite (0094). Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'occ@a.test');
\set admin '00000000-0000-0000-0000-00000000000a'
\set tech  '00000000-0000-0000-0000-0000000000a1'
\set occ   '00000000-0000-0000-0000-0000000000a2'
select t.run('authenticated', :'admin', $q$select fp_create_organization('Org A')$q$);
select id as "org" from fp_organizations where name = 'Org A' \gset
insert into fp_invites (org_id, email, role, token) values
  (:'org', 'tech@a.test', 'technician', '10000000-0000-0000-0000-000000000001'),
  (:'org', 'occ@a.test',  'occupant',   '10000000-0000-0000-0000-000000000002');
select t.run('authenticated', :'tech', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);
select t.run('authenticated', :'occ',  $q$select fp_accept_invite('10000000-0000-0000-0000-000000000002')$q$);

insert into fp_broadcasts (org_id, title, audience, message, is_published) values
  (:'org', 'Published notice', 'all', 'Water off on Saturday', true),
  (:'org', 'Draft notice', 'all', 'Not ready yet', false);

select t.check('an occupant sees published announcements',
  t.run('authenticated', :'occ', $q$select 1 from fp_broadcasts where title = 'Published notice'$q$) = 'ok:1');
select t.check('an occupant does not see drafts',
  t.run('authenticated', :'occ', $q$select 1 from fp_broadcasts where title = 'Draft notice'$q$) = 'ok:0');
select t.check('a technician does not see drafts',
  t.run('authenticated', :'tech', $q$select 1 from fp_broadcasts where title = 'Draft notice'$q$) = 'ok:0');
select t.check('the org admin still sees drafts to edit them',
  t.run('authenticated', :'admin', $q$select 1 from fp_broadcasts where title = 'Draft notice'$q$) = 'ok:1');

\ir _report.sql
