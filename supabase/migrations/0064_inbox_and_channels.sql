-- 0064_inbox_and_channels.sql
-- Audit findings S2-H6 (inbox readable/writable by every member) and the
-- database side of S2-H4 (WhatsApp messaging was single-tenant and unsigned).
-- Covered by supabase/security-tests/inbox_channels.sql.
--
--   * Conversations and messages hold customers' names, phone numbers and
--     message text: staff only (admin, manager, technician). Occupant and
--     vendor logins no longer see them.
--   * Clients may only add outbound messages, as themselves. Inbound
--     messages come only from the channel-webhook Edge Function (service
--     role), so a member can't forge a "customer" message that notifies
--     managers and fires workflows.
--   * fp_channel_accounts maps an external sender id (WhatsApp
--     phone_number_id) to its organisation. Inbound messages are routed and
--     outbound messages are sent by that mapping. It is managed by platform
--     admins, since a tenant claiming another tenant's number would receive
--     its customers' messages.
--   * Messages record their external id (deduplicates webhook retries) and
--     delivery status.

-- ---------------------------------------------------------------------------
-- Conversations & messages: staff only
-- ---------------------------------------------------------------------------
drop policy if exists conv_select on fp_conversations;
drop policy if exists conv_write  on fp_conversations;
create policy conv_select on fp_conversations for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager','technician']) );
create policy conv_insert on fp_conversations for insert to authenticated
  with check ( fp_has_role(org_id, array['org_admin','manager','technician']) );
create policy conv_update on fp_conversations for update to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager','technician']) )
  with check ( fp_has_role(org_id, array['org_admin','manager','technician']) );
create policy conv_delete on fp_conversations for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );

alter table fp_messages alter column sender set default auth.uid();
alter table fp_messages
  add column if not exists external_id     text,
  add column if not exists delivery_status text check (delivery_status in ('pending','sent','delivered','read','failed')),
  add column if not exists delivery_error  text;
create unique index if not exists fp_messages_external_uk
  on fp_messages (org_id, external_id) where external_id is not null;

drop policy if exists msg_select on fp_messages;
drop policy if exists msg_write  on fp_messages;
create policy msg_select on fp_messages for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager','technician']) );
create policy msg_insert on fp_messages for insert to authenticated
  with check (
    fp_has_role(org_id, array['org_admin','manager','technician'])
    and direction = 'out'
    and sender = auth.uid()
    and external_id is null
    and delivery_status is null
  );
create policy msg_delete on fp_messages for delete to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) );
-- No client UPDATE: sentiment and delivery status are written by Edge
-- Functions with the service role.

-- ---------------------------------------------------------------------------
-- External channel accounts (platform-managed)
-- ---------------------------------------------------------------------------
create table if not exists fp_channel_accounts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references fp_organizations(id) on delete cascade,
  channel      text not null check (channel in ('whatsapp','zalo','line')),
  external_id  text not null,           -- WhatsApp: phone_number_id
  display_name text,                    -- e.g. the phone number, for the UI
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (channel, external_id)
);
create index if not exists fp_channel_accounts_org_idx on fp_channel_accounts (org_id, channel);

alter table fp_channel_accounts enable row level security;
drop policy if exists channel_accounts_select on fp_channel_accounts;
create policy channel_accounts_select on fp_channel_accounts for select to authenticated
  using ( fp_has_role(org_id, array['org_admin','manager']) or fp_is_platform_admin() );
drop policy if exists channel_accounts_write on fp_channel_accounts;
create policy channel_accounts_write on fp_channel_accounts for all to authenticated
  using ( fp_is_platform_admin() )
  with check ( fp_is_platform_admin() );

drop trigger if exists trg_audit_channel_accounts on fp_channel_accounts;
create trigger trg_audit_channel_accounts after insert or update or delete
  on fp_channel_accounts for each row execute function fp_audit();

-- ---------------------------------------------------------------------------
-- Smart assistant usage (per-user quota for the server-side AI call)
-- ---------------------------------------------------------------------------
create table if not exists fp_assistant_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid references fp_organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists fp_assistant_usage_user_idx on fp_assistant_usage (user_id, created_at desc);
alter table fp_assistant_usage enable row level security;  -- no policies: service role only
