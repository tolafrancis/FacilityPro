-- 0074_asset_qr_and_links.sql
-- Audit findings S1-M2 (asset QR codes only opened the public report form,
-- and printed codes carried whatever address the browser was on) and S2-L2
-- (document links accepted javascript: URLs). Covered by
-- supabase/security-tests/asset_qr.sql.
--
--   * Every asset has a random qr_code. Printed codes point at
--     <public app URL>/a/<qr_code>: signed-in members open the asset; anyone
--     else gets the public report form when the organisation allows it, or
--     the sign-in page.
--   * fp_resolve_asset_qr(code) is what that page calls. It reveals only
--     ids (and whether public reporting is on), never names or details.
--   * Document links must be http(s).

alter table fp_assets alter column qr_code set default replace(gen_random_uuid()::text, '-', '');
update fp_assets set qr_code = replace(gen_random_uuid()::text, '-', '') where qr_code is null;

create or replace function fp_resolve_asset_qr(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'asset_id', a.id,
    'org_id', a.org_id,
    'location_id', a.location_id,
    'public_reports', o.allow_public_requests,
    'is_member', fp_is_member(a.org_id)
  )
  from fp_assets a join fp_organizations o on o.id = a.org_id
  where a.qr_code = p_code
    and length(p_code) between 8 and 64;
$$;

grant execute on function fp_resolve_asset_qr(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Document links: http(s) only
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from fp_documents where link is not null and link !~* '^https?://';
  if n > 0 then
    raise warning '0074: % document link(s) are not http(s) URLs; they are kept but no longer shown as links. Find them with: select id, org_id, link from fp_documents where link !~* ''^https?://'';', n;
  end if;
end $$;
alter table fp_documents drop constraint if exists fp_documents_link_check;
alter table fp_documents add constraint fp_documents_link_check
  check (link is null or link ~* '^https?://') not valid;
