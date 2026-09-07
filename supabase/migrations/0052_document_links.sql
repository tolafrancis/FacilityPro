-- 0052_document_links.sql
-- Audit finding: fp_documents has no relationship to anything — an asset's
-- manual, a vendor's insurance certificate, and a permit's supporting file
-- all live in one flat, unlinked list. This adds a generic join table so a
-- document can attach to the record it actually belongs to, without forcing
-- fp_documents itself to carry six mutually-exclusive nullable FK columns.

create table fp_document_links (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references fp_organizations(id) on delete cascade,
  document_id uuid not null references fp_documents(id) on delete cascade,
  entity_type text not null check (entity_type in ('asset','work_order','vendor','contract','location','part')),
  entity_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (document_id, entity_type, entity_id)
);

create index fp_document_links_document_idx on fp_document_links (document_id);
create index fp_document_links_entity_idx on fp_document_links (entity_type, entity_id);

alter table fp_document_links enable row level security;

-- Mirrors fp_documents' own policies: members read, any member can attach an
-- existing document (matches today's documents_select), admin/manager manage.
create policy document_links_select on fp_document_links for select to authenticated
  using ( fp_is_member(org_id) );
create policy document_links_insert on fp_document_links for insert to authenticated
  with check ( fp_has_role(org_id, array['org_admin','manager']) );
create policy document_links_delete on fp_document_links for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
