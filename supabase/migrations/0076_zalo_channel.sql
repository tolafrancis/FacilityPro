-- 0076_zalo_channel.sql
-- Zalo Official Account alongside WhatsApp in the inbox.
-- Covered by supabase/security-tests/inbox_channels.sql.
--
--   * A Zalo OA is connected like a WhatsApp number: a platform admin adds a
--     fp_channel_accounts row (channel 'zalo', external_id = the OA id).
--     Inbound events are routed to the org that owns the OA, and replies are
--     sent from it.
--   * Zalo OA access tokens last ~25 hours and are renewed with a refresh
--     token that is single-use and rotates on every renewal, so the pair has
--     to live in the database, not in a static secret. fp_channel_tokens
--     holds it, readable and writable by the service role only (the
--     channel-send / channel-webhook Edge Functions). No client role can see
--     a token, including the org's own admins.
--   * refreshing_until is a short lease: whichever function claims it renews
--     the token, so two concurrent sends can't both spend the same refresh
--     token (the loser would invalidate the OA's connection).

create table if not exists fp_channel_tokens (
  channel_account_id uuid primary key references fp_channel_accounts(id) on delete cascade,
  access_token       text,
  refresh_token      text not null,
  expires_at         timestamptz,
  refreshing_until   timestamptz,
  last_error         text,
  updated_at         timestamptz not null default now()
);

alter table fp_channel_tokens enable row level security;  -- no policies: service role only
revoke all on fp_channel_tokens from public, anon, authenticated;
