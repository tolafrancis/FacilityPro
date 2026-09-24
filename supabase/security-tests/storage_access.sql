-- Storage access suite (0062): who may upload, read and delete files in the
-- fp-media bucket, and which documents each role sees. Rows are written to
-- storage.objects as the signed-in user, which is what the Storage API does.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

-- ---------------------------------------------------------------------------
-- Fixture: org A (admin, assigned tech, another tech, occupant, vendor) and
-- org B (admin).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'tech2@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'occ@a.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'vendor@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test');
\set admin  '00000000-0000-0000-0000-00000000000a'
\set tech   '00000000-0000-0000-0000-0000000000a1'
\set tech2  '00000000-0000-0000-0000-0000000000a3'
\set occ    '00000000-0000-0000-0000-0000000000a2'
\set vendor '00000000-0000-0000-0000-0000000000a4'
\set adminB '00000000-0000-0000-0000-00000000000b'

select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$);
select id as "org"  from fp_organizations where name = 'Org A' \gset
select id as "orgB" from fp_organizations where name = 'Org B' \gset
insert into fp_invites (org_id, email, role, token) values
  (:'org', 'tech@a.test',   'technician', '10000000-0000-0000-0000-000000000001'),
  (:'org', 'tech2@a.test',  'technician', '10000000-0000-0000-0000-000000000002'),
  (:'org', 'occ@a.test',    'occupant',   '10000000-0000-0000-0000-000000000003'),
  (:'org', 'vendor@a.test', 'vendor',     '10000000-0000-0000-0000-000000000004');
select t.run('authenticated', :'tech',   $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);
select t.run('authenticated', :'tech2',  $q$select fp_accept_invite('10000000-0000-0000-0000-000000000002')$q$);
select t.run('authenticated', :'occ',    $q$select fp_accept_invite('10000000-0000-0000-0000-000000000003')$q$);
select t.run('authenticated', :'vendor', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000004')$q$);

insert into fp_work_orders (id, org_id, title, assigned_to) values
  ('40000000-0000-0000-0000-000000000001', :'org', 'Fix pump', :'tech');
insert into fp_requests (id, org_id, title, created_by) values
  ('90000000-0000-0000-0000-000000000001', :'org', 'Leak', :'occ');

\set wopath  :org'/work-orders/40000000-0000-0000-0000-000000000001/1-after.jpg'
\set reqpath :org'/requests/90000000-0000-0000-0000-000000000001/1-leak.jpg'
\set docpath :org'/documents/1-contract.pdf'
\set pubpath :org'/documents/2-manual.pdf'
\set legacy  :org'/3f0e9d4c-legacy-insurance.pdf'

create function t.upload(p_role text, p_uid uuid, p_name text) returns text language sql as
  $$ select t.run(p_role, p_uid, format($f$insert into storage.objects (bucket_id, name) values ('fp-media', %L)$f$, p_name)) $$;
create function t.can_read(p_uid uuid, p_name text) returns boolean language sql as
  $$ select t.run('authenticated', p_uid, format($f$select 1 from storage.objects where bucket_id = 'fp-media' and name = %L$f$, p_name)) = 'ok:1' $$;
create function t.obj_exists(p_name text) returns boolean language sql as
  $$ select exists (select 1 from storage.objects where name = p_name) $$;

-- ===========================================================================
-- Uploads
-- ===========================================================================
select t.check('assigned technician can upload a work-order photo', t.upload('authenticated', :'tech', :'wopath') = 'ok:1');
select t.check('another technician cannot upload to someone else''s work order',
  t.upload('authenticated', :'tech2', :'org' || '/work-orders/40000000-0000-0000-0000-000000000001/2.jpg') like 'err:%');
select t.check('occupant cannot upload work-order evidence',
  t.upload('authenticated', :'occ', :'org' || '/work-orders/40000000-0000-0000-0000-000000000001/3.jpg') like 'err:%');
select t.check('another org''s admin cannot upload into this org',
  t.upload('authenticated', :'adminB', :'org' || '/work-orders/40000000-0000-0000-0000-000000000001/4.jpg') like 'err:%');
select t.check('manager can upload a work-order photo',
  t.upload('authenticated', :'admin', :'org' || '/work-orders/40000000-0000-0000-0000-000000000001/5.jpg') = 'ok:1');

select t.check('reporter can upload a photo to their request', t.upload('authenticated', :'occ', :'reqpath') = 'ok:1');
select t.check('another org cannot upload to this org''s request',
  t.upload('authenticated', :'adminB', :'org' || '/requests/90000000-0000-0000-0000-000000000001/x.jpg') like 'err:%');

select t.check('technician cannot upload documents', t.upload('authenticated', :'tech', :'org' || '/documents/x.pdf') like 'err:%');
select t.check('manager can upload documents',
  t.upload('authenticated', :'admin', :'docpath') = 'ok:1' and t.upload('authenticated', :'admin', :'pubpath') = 'ok:1');

select t.check('files outside an org folder are refused (no crash on a junk path)',
  t.upload('authenticated', :'admin', 'not-an-org/x.jpg') like 'err:%row-level security%'
  and t.upload('authenticated', :'admin', :'org' || '/random/x.jpg') like 'err:%row-level security%');

-- Legacy document (uploaded before 0062, stored at the org root).
insert into storage.objects (bucket_id, name) values ('fp-media', :'legacy');

-- ===========================================================================
-- Records behind the files
-- ===========================================================================
select t.check('occupant cannot attach a photo record to a work order',
  t.run('authenticated', :'occ', format(
    $q$insert into fp_media (org_id, work_order_id, path) values (%L, '40000000-0000-0000-0000-000000000001', %L)$q$, :'org', :'wopath')) like 'err:%');
select t.check('photo record must point inside its own org and work order',
  t.run('authenticated', :'tech', format(
    $q$insert into fp_media (org_id, work_order_id, path) values (%L, '40000000-0000-0000-0000-000000000001', %L)$q$,
    :'org', :'orgB' || '/work-orders/40000000-0000-0000-0000-000000000001/x.jpg')) like 'err:%');
select t.check('photo record cannot claim another uploader',
  t.run('authenticated', :'tech', format(
    $q$insert into fp_media (org_id, work_order_id, path, created_by) values (%L, '40000000-0000-0000-0000-000000000001', %L, %L)$q$,
    :'org', :'wopath', :'tech2')) like 'err:%');
select t.run('authenticated', :'tech', format(
    $q$insert into fp_media (org_id, work_order_id, path, phase) values (%L, '40000000-0000-0000-0000-000000000001', %L, 'after')$q$, :'org', :'wopath')) as r \gset
select t.check('assigned technician records the photo (uploader filled in by the database)',
  :'r' = 'ok:1'
  and (select created_by from fp_media where path = :'wopath') = :'tech'::uuid);
select t.check('reporter records the request photo',
  t.run('authenticated', :'occ', format(
    $q$insert into fp_media (org_id, request_id, path) values (%L, '90000000-0000-0000-0000-000000000001', %L)$q$, :'org', :'reqpath')) = 'ok:1');

insert into fp_documents (org_id, title, file_path, visibility) values
  (:'org', 'Service contract', :'docpath', 'staff'),
  (:'org', 'Tenant handbook', :'pubpath', 'everyone'),
  (:'org', 'Insurance (legacy)', :'legacy', 'staff');

-- ===========================================================================
-- Reading
-- ===========================================================================
select t.check('members can view work-order evidence', t.can_read(:'occ', :'wopath') and t.can_read(:'tech2', :'wopath'));
select t.check('another org cannot read this org''s evidence', not t.can_read(:'adminB', :'wopath'));
select t.check('a file with no record behind it is not readable by non-managers',
  not t.can_read(:'tech', :'org' || '/work-orders/40000000-0000-0000-0000-000000000001/5.jpg'));
select t.check('managers see every file in their org (so orphans can be cleaned up)',
  t.can_read(:'admin', :'org' || '/work-orders/40000000-0000-0000-0000-000000000001/5.jpg')
  and not t.can_read(:'adminB', :'org' || '/work-orders/40000000-0000-0000-0000-000000000001/5.jpg'));

select t.check('staff can read staff-only documents', t.can_read(:'tech', :'docpath') and t.can_read(:'admin', :'docpath'));
select t.check('occupant cannot read staff-only documents', not t.can_read(:'occ', :'docpath'));
select t.check('vendor cannot read staff-only documents', not t.can_read(:'vendor', :'docpath'));
select t.check('occupant and vendor can read documents shared with everyone',
  t.can_read(:'occ', :'pubpath') and t.can_read(:'vendor', :'pubpath'));
select t.check('legacy document files follow their document''s visibility',
  t.can_read(:'tech', :'legacy') and not t.can_read(:'occ', :'legacy'));

select t.check('occupant only sees documents shared with everyone',
  t.run('authenticated', :'occ', $q$select * from fp_documents$q$) = 'ok:1');
select t.check('staff see all documents',
  t.run('authenticated', :'tech', $q$select * from fp_documents$q$) = 'ok:3');

-- ===========================================================================
-- Deleting
-- ===========================================================================
select t.run('authenticated', :'occ', format($q$delete from storage.objects where name = %L$q$, :'wopath'));
select t.run('authenticated', :'tech', format($q$delete from storage.objects where name = %L$q$, :'wopath'));
select t.check('occupant and uploader cannot delete evidence files', t.obj_exists(:'wopath'));
select t.run('authenticated', :'tech', format($q$delete from fp_media where path = %L$q$, :'wopath'));
select t.check('uploader cannot delete the evidence record', exists (select 1 from fp_media where path = :'wopath'));
select t.run('authenticated', :'adminB', format($q$delete from storage.objects where name = %L$q$, :'docpath'));
select t.check('another org cannot delete this org''s files', t.obj_exists(:'docpath'));

select t.run('authenticated', :'admin', format($q$delete from fp_media where path = %L$q$, :'wopath'));
select t.run('authenticated', :'admin', format($q$delete from storage.objects where name = %L$q$, :'wopath'));
select t.check('manager can delete evidence (record and file)',
  not exists (select 1 from fp_media where path = :'wopath') and not t.obj_exists(:'wopath'));

-- ===========================================================================
-- Bucket limits
-- ===========================================================================
insert into storage.buckets (id, name, public) values ('fp-media', 'fp-media', false) on conflict do nothing;
select t.check('bucket limits size and file types (applied when the bucket exists)',
  (select file_size_limit = 26214400 and 'application/pdf' = any(allowed_mime_types)
   from storage.buckets where id = 'fp-media'));

\ir _report.sql
