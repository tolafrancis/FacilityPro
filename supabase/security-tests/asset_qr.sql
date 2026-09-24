-- Asset QR + document links suite (0074). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test');
\set admin  '00000000-0000-0000-0000-00000000000a'
\set adminB '00000000-0000-0000-0000-00000000000b'
select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$);
select id as "org" from fp_organizations where name = 'Org A' \gset

select t.run('authenticated', :'admin', format($q$
  insert into fp_assets (id, org_id, name_i18n) values ('20000000-0000-0000-0000-000000000001', %L, '{"en":"Secret chiller"}')$q$, :'org'));
select qr_code as "code" from fp_assets where id = '20000000-0000-0000-0000-000000000001' \gset

select t.check('every new asset gets a random QR code',
  length(:'code') = 32);
select t.check('a member resolving the code learns the asset and that they are a member',
  t.run('authenticated', :'admin', format($q$select 1 where (fp_resolve_asset_qr(%L) ->> 'is_member')::boolean$q$, :'code')) = 'ok:1');
select set_config('request.jwt.claim.sub', '', false);
select t.check('anyone can resolve a code to ids only (no names), for the report form',
  (select (fp_resolve_asset_qr(:'code') ->> 'asset_id') = '20000000-0000-0000-0000-000000000001'
          and fp_resolve_asset_qr(:'code')::text not like '%Secret%'
          and (fp_resolve_asset_qr(:'code') ->> 'public_reports')::boolean = false
          and (fp_resolve_asset_qr(:'code') ->> 'is_member')::boolean = false)
  and t.run('anon', null, format($q$select fp_resolve_asset_qr(%L)$q$, :'code')) = 'ok:1');
select t.check('another organisation''s admin is not a member',
  t.run('authenticated', :'adminB', format($q$select 1 where not (fp_resolve_asset_qr(%L) ->> 'is_member')::boolean$q$, :'code')) = 'ok:1');
select t.check('unknown or too-short codes resolve to nothing',
  fp_resolve_asset_qr('nope') is null and fp_resolve_asset_qr('0123456789abcdef') is null);

select t.check('document links must be http(s)',
  t.run('authenticated', :'admin', format($q$insert into fp_documents (org_id, title, link) values (%L, 'x', 'javascript:alert(1)')$q$, :'org')) like 'err:%'
  and t.run('authenticated', :'admin', format($q$insert into fp_documents (org_id, title, link) values (%L, 'y', 'https://example.com/manual.pdf')$q$, :'org')) = 'ok:1');

\ir _report.sql
