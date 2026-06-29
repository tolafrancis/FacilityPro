-- 0008_media_storage.sql
-- Phase 1: media evidence table + a private storage bucket with org-scoped policies.

-- ---------------------------------------------------------------------------
-- Media (photo/video evidence) attached to requests and work orders.
-- ---------------------------------------------------------------------------
create table fp_media (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references fp_organizations(id) on delete cascade,
  work_order_id uuid references fp_work_orders(id) on delete cascade,
  request_id    uuid references fp_requests(id) on delete cascade,
  path          text not null,                 -- storage object path
  kind          text not null default 'image', -- 'image' | 'video'
  phase         text,                          -- 'before' | 'after' | null
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index fp_media_wo_idx  on fp_media (work_order_id);
create index fp_media_req_idx on fp_media (request_id);

alter table fp_media enable row level security;

create policy media_select on fp_media for select to authenticated
  using ( fp_is_member(org_id) );
create policy media_insert on fp_media for insert to authenticated
  with check ( fp_is_member(org_id) );
create policy media_delete on fp_media for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager'])
          or created_by = auth.uid() );

-- ---------------------------------------------------------------------------
-- Storage bucket for media. Private; access via signed URLs.
-- Object paths begin with the org id:  {org_id}/work-orders/{wo}/{file}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fp-media', 'fp-media', false)
on conflict (id) do nothing;

create policy "fp_media storage read" on storage.objects for select to authenticated
  using (
    bucket_id = 'fp-media'
    and fp_is_member( ((storage.foldername(name))[1])::uuid )
  );

create policy "fp_media storage insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fp-media'
    and fp_is_member( ((storage.foldername(name))[1])::uuid )
  );

create policy "fp_media storage delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'fp-media'
    and fp_is_member( ((storage.foldername(name))[1])::uuid )
  );
