-- 0062_storage_access.sql
-- Audit finding S2-H2: every member of an org — occupant and vendor logins
-- included — could read every file in the fp-media bucket (contracts, finance
-- documents, evidence photos) and delete any of them.
-- Covered by supabase/security-tests/storage_access.sql.
--
--   * Reading a file requires being able to see the record it belongs to
--     (a photo, a document or a permit), so file access follows the same RLS
--     as the data. Managers can see every file in their own org's folder.
--   * Documents get a visibility: 'staff' (default: admins, managers,
--     technicians) or 'everyone' (also occupants and vendors).
--   * Uploads must go under the org's own folder and match a record the
--     uploader may add evidence to: work-order photos by the assignee or a
--     manager, request photos by anyone who can see the request, documents
--     by managers.
--   * Deleting files and photo records is for managers only (evidence).
--   * The bucket rejects oversized files and unexpected file types.

-- ---------------------------------------------------------------------------
-- Document visibility
-- ---------------------------------------------------------------------------
alter table fp_documents
  add column if not exists visibility text not null default 'staff'
    check (visibility in ('staff', 'everyone'));

drop policy if exists documents_select on fp_documents;
create policy documents_select on fp_documents for select to authenticated
  using (
    fp_is_member(org_id)
    and (visibility = 'everyone' or fp_has_role(org_id, array['org_admin','manager','technician']))
  );

-- Links reveal which records a document is attached to: same visibility.
drop policy if exists document_links_select on fp_document_links;
create policy document_links_select on fp_document_links for select to authenticated
  using ( fp_is_member(org_id) and exists (select 1 from fp_documents d where d.id = document_id) );

-- ---------------------------------------------------------------------------
-- Photo / video evidence records
-- ---------------------------------------------------------------------------
drop policy if exists media_insert on fp_media;
create policy media_insert on fp_media for insert to authenticated
  with check (
    fp_is_member(org_id)
    and created_by = auth.uid()
    and split_part(path, '/', 1) = org_id::text
    and (
      (work_order_id is not null
        and path like org_id::text || '/work-orders/' || work_order_id::text || '/%'
        and exists (
          select 1 from fp_work_orders w
          where w.id = work_order_id and w.org_id = fp_media.org_id
            and (w.assigned_to = auth.uid() or fp_has_role(w.org_id, array['org_admin','manager']))
        ))
      or
      (request_id is not null
        and path like org_id::text || '/requests/' || request_id::text || '/%'
        and exists (select 1 from fp_requests r where r.id = request_id and r.org_id = fp_media.org_id))
    )
  );

drop policy if exists media_delete on fp_media;
create policy media_delete on fp_media for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );

-- ---------------------------------------------------------------------------
-- Storage objects (bucket fp-media)
-- ---------------------------------------------------------------------------
-- Org id from an object path "{org}/…", or NULL if the path doesn't start
-- with one (never raises, so a junk path is simply refused).
create or replace function fp_storage_org(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

drop policy if exists "fp_media storage read"   on storage.objects;
drop policy if exists "fp_media storage insert" on storage.objects;
drop policy if exists "fp_media storage delete" on storage.objects;

-- The subqueries run with the caller's RLS, so "a visible record points at
-- this file" is exactly "you may see this file". Managers see everything in
-- their org's folder (Postgres only deletes rows the caller can see, and a
-- manager must be able to clean up files whose record is already gone).
create policy "fp_media storage read" on storage.objects for select to authenticated
  using (
    bucket_id = 'fp-media'
    and (
      fp_has_role(fp_storage_org(name), array['org_admin','manager'])
      or exists (select 1 from fp_media m where m.path = storage.objects.name)
      or exists (select 1 from fp_documents d where d.file_path = storage.objects.name)
      or exists (select 1 from fp_permits p where p.file_path = storage.objects.name)
    )
  );

create policy "fp_media storage insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fp-media'
    and fp_is_member(fp_storage_org(name))
    and (
      (split_part(name, '/', 2) = 'work-orders'
        and exists (
          select 1 from fp_work_orders w
          where w.id::text = split_part(name, '/', 3)
            and w.org_id = fp_storage_org(name)
            and (w.assigned_to = auth.uid() or fp_has_role(w.org_id, array['org_admin','manager']))
        ))
      or
      (split_part(name, '/', 2) = 'requests'
        and exists (
          select 1 from fp_requests r
          where r.id::text = split_part(name, '/', 3) and r.org_id = fp_storage_org(name)
        ))
      or
      (split_part(name, '/', 2) in ('documents', 'permits')
        and fp_has_role(fp_storage_org(name), array['org_admin','manager']))
    )
  );

create policy "fp_media storage delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'fp-media' and fp_has_role(fp_storage_org(name), array['org_admin','manager']) );

-- ---------------------------------------------------------------------------
-- Bucket limits: 25 MB, photos/video/PDF/office documents only.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
      set file_size_limit = 26214400,
          allowed_mime_types = array[
            'image/*', 'video/*', 'application/pdf', 'text/plain', 'text/csv',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          ]
      where id = 'fp-media';
  end if;
end $$;

-- Used inside storage policies, evaluated as the caller.
grant execute on function fp_storage_org(text) to authenticated;
