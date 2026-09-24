-- Inbox + channel accounts suite (0064). Every check states the intended
-- behaviour. Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'occ@a.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'vendor@a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@b.test'),
  ('00000000-0000-0000-0000-0000000000f0', 'ops@platform.test');
\set admin  '00000000-0000-0000-0000-00000000000a'
\set tech   '00000000-0000-0000-0000-0000000000a1'
\set occ    '00000000-0000-0000-0000-0000000000a2'
\set vendor '00000000-0000-0000-0000-0000000000a4'
\set adminB '00000000-0000-0000-0000-00000000000b'
\set ops    '00000000-0000-0000-0000-0000000000f0'
insert into fp_platform_admins (user_id) values (:'ops');

select t.run('authenticated', :'admin',  $q$select fp_create_organization('Org A')$q$);
select t.run('authenticated', :'adminB', $q$select fp_create_organization('Org B')$q$);
select id as "org"  from fp_organizations where name = 'Org A' \gset
select id as "orgB" from fp_organizations where name = 'Org B' \gset
insert into fp_invites (org_id, email, role, token) values
  (:'org', 'tech@a.test',   'technician', '10000000-0000-0000-0000-000000000001'),
  (:'org', 'occ@a.test',    'occupant',   '10000000-0000-0000-0000-000000000002'),
  (:'org', 'vendor@a.test', 'vendor',     '10000000-0000-0000-0000-000000000003');
select t.run('authenticated', :'tech',   $q$select fp_accept_invite('10000000-0000-0000-0000-000000000001')$q$);
select t.run('authenticated', :'occ',    $q$select fp_accept_invite('10000000-0000-0000-0000-000000000002')$q$);
select t.run('authenticated', :'vendor', $q$select fp_accept_invite('10000000-0000-0000-0000-000000000003')$q$);

insert into fp_conversations (id, org_id, channel, contact_name, contact_handle) values
  ('c0000000-0000-0000-0000-000000000001', :'org', 'whatsapp', 'Chị Lan', '84901112233');
insert into fp_messages (org_id, conversation_id, direction, body) values
  (:'org', 'c0000000-0000-0000-0000-000000000001', 'in', 'Máy lạnh phòng 302 bị hỏng');

-- ===========================================================================
-- Who can read the inbox
-- ===========================================================================
select t.check('staff can read conversations and messages',
  t.run('authenticated', :'tech', $q$select * from fp_conversations$q$) = 'ok:1'
  and t.run('authenticated', :'tech', $q$select * from fp_messages$q$) = 'ok:1');
select t.check('occupant cannot read the inbox',
  t.run('authenticated', :'occ', $q$select * from fp_conversations$q$) = 'ok:0'
  and t.run('authenticated', :'occ', $q$select * from fp_messages$q$) = 'ok:0');
select t.check('vendor cannot read the inbox',
  t.run('authenticated', :'vendor', $q$select * from fp_messages$q$) = 'ok:0');
select t.check('another org cannot read the inbox',
  t.run('authenticated', :'adminB', $q$select * from fp_messages$q$) = 'ok:0');

-- ===========================================================================
-- Writing
-- ===========================================================================
select t.run('authenticated', :'tech', format(
  $q$insert into fp_messages (org_id, conversation_id, direction, body) values (%L, 'c0000000-0000-0000-0000-000000000001', 'out', 'Chúng tôi sẽ đến trong 30 phút')$q$, :'org')) as r \gset
select t.check('staff reply is stored as sent by them',
  :'r' = 'ok:1'
  and (select sender from fp_messages where body like 'Chúng tôi%') = :'tech'::uuid);

select t.check('staff cannot forge an inbound customer message',
  t.run('authenticated', :'tech', format(
    $q$insert into fp_messages (org_id, conversation_id, direction, body) values (%L, 'c0000000-0000-0000-0000-000000000001', 'in', 'fake')$q$, :'org')) like 'err:%');
select t.check('a reply cannot claim another sender',
  t.run('authenticated', :'tech', format(
    $q$insert into fp_messages (org_id, conversation_id, direction, body, sender) values (%L, 'c0000000-0000-0000-0000-000000000001', 'out', 'x', %L)$q$, :'org', :'admin')) like 'err:%');
select t.check('a client cannot mark a message delivered',
  t.run('authenticated', :'tech', format(
    $q$insert into fp_messages (org_id, conversation_id, direction, body, delivery_status) values (%L, 'c0000000-0000-0000-0000-000000000001', 'out', 'x', 'sent')$q$, :'org')) like 'err:%');
select t.run('authenticated', :'admin', $q$update fp_messages set body = 'edited', delivery_status = 'read'$q$);
select t.check('messages cannot be edited by clients',
  not exists (select 1 from fp_messages where body = 'edited'));
select t.check('occupant cannot start a conversation',
  t.run('authenticated', :'occ', format(
    $q$insert into fp_conversations (org_id, channel, contact_handle) values (%L, 'whatsapp', '84900000000')$q$, :'org')) like 'err:%');

-- ===========================================================================
-- Channel accounts (WhatsApp number → org)
-- ===========================================================================
select t.check('an org admin cannot register a WhatsApp number (could hijack another org''s messages)',
  t.run('authenticated', :'adminB', format(
    $q$insert into fp_channel_accounts (org_id, channel, external_id) values (%L, 'whatsapp', '1234567890')$q$, :'orgB')) like 'err:%');
select t.check('platform admin connects a number to an org',
  t.run('authenticated', :'ops', format(
    $q$insert into fp_channel_accounts (org_id, channel, external_id, display_name) values (%L, 'whatsapp', '1234567890', '+84 28 1234 5678')$q$, :'org')) = 'ok:1');
select t.check('a number can belong to only one org',
  t.run('authenticated', :'ops', format(
    $q$insert into fp_channel_accounts (org_id, channel, external_id) values (%L, 'whatsapp', '1234567890')$q$, :'orgB')) like 'err:%');
select t.check('the org''s managers can see their connected number; other orgs cannot',
  t.run('authenticated', :'admin', $q$select * from fp_channel_accounts$q$) = 'ok:1'
  and t.run('authenticated', :'adminB', $q$select * from fp_channel_accounts$q$) = 'ok:0'
  and t.run('authenticated', :'tech', $q$select * from fp_channel_accounts$q$) = 'ok:0');

-- ===========================================================================
-- Webhook deliveries (service role): dedupe by external id
-- ===========================================================================
select t.run('service_role', null, format(
  $q$insert into fp_messages (org_id, conversation_id, direction, body, external_id) values (%L, 'c0000000-0000-0000-0000-000000000001', 'in', 'hello', 'wamid.1')$q$, :'org'));
select t.check('a retried webhook delivery is stored once',
  t.run('service_role', null, format(
    $q$insert into fp_messages (org_id, conversation_id, direction, body, external_id) values (%L, 'c0000000-0000-0000-0000-000000000001', 'in', 'hello', 'wamid.1')$q$, :'org')) like 'err:%duplicate%'
  and (select count(*) from fp_messages where external_id = 'wamid.1') = 1);

\ir _report.sql
