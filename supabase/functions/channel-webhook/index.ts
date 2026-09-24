// supabase/functions/channel-webhook/index.ts
//
// Inbound messages from external channels land here, are normalised, and are
// written into fp_conversations / fp_messages. Standalone Edge Function (Deno).
//
// Deploy:
//   supabase functions deploy channel-webhook --no-verify-jwt
//   supabase secrets set WHATSAPP_VERIFY_TOKEN=your-verify-token
//   supabase secrets set WHATSAPP_APP_SECRET=<Meta app secret>   # required: signs every delivery
//   # Optional, single-tenant fallback for deployments without fp_channel_accounts rows:
//   supabase secrets set WHATSAPP_ORG_ID=<org uuid>
//
// Point your WhatsApp Cloud API webhook at:
//   https://<project-ref>.functions.supabase.co/channel-webhook
//
// Zalo OA (migration 0076) uses the same function: deliveries carrying
// X-ZEvent-Signature are handled as Zalo events. Secrets: ZALO_APP_ID and
// ZALO_OA_SECRET_KEY (see _shared/zalo.ts); without them Zalo deliveries are
// rejected. Zalo only accepts a webhook URL on a domain verified in the Zalo
// app, so point it at your own domain in front of this function (README).
//
// Security (migration 0064):
//   * Every POST must carry Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw
//     body with the app secret); anything else is rejected, so nobody can
//     inject fake customer messages.
//   * Each message is routed to the organisation that owns the receiving
//     number (fp_channel_accounts.external_id = metadata.phone_number_id).
//   * Meta retries deliveries; messages are stored once (external_id).
//   * Delivery receipts (sent / delivered / read / failed) update our
//     outbound messages.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validZaloSignature, zaloDisplayName, zaloWebhookConfigured } from '../_shared/zalo.ts';

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
const FALLBACK_ORG_ID = Deno.env.get('WHATSAPP_ORG_ID') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function validSignature(raw: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  const given = header.slice('sha256='.length);
  // Constant-time comparison.
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

type Account = { id: string; org_id: string };
const accountCache = new Map<string, Account | null>();
async function channelAccount(channel: 'whatsapp' | 'zalo', externalId: string): Promise<Account | null> {
  const key = `${channel}:${externalId}`;
  if (!accountCache.has(key)) {
    const { data } = await supabase
      .from('fp_channel_accounts')
      .select('id, org_id')
      .eq('channel', channel)
      .eq('external_id', externalId)
      .eq('active', true)
      .maybeSingle();
    accountCache.set(key, (data as Account | null) ?? null);
  }
  return accountCache.get(key) ?? null;
}

async function orgForNumber(phoneNumberId: string | undefined): Promise<string | null> {
  if (phoneNumberId) {
    const account = await channelAccount('whatsapp', phoneNumberId);
    if (account) return account.org_id;
  }
  return FALLBACK_ORG_ID || null;
}

async function upsertInbound(opts: {
  orgId: string;
  channel: string;
  handle: string;
  name: string | null;
  body: string;
  externalId: string | null;
  // Looked up only when the conversation is new.
  lookupName?: () => Promise<string | null>;
}) {
  const { data: existing } = await supabase
    .from('fp_conversations')
    .select('id')
    .eq('org_id', opts.orgId)
    .eq('channel', opts.channel)
    .eq('contact_handle', opts.handle)
    .maybeSingle();

  let conversationId = existing?.id as string | undefined;
  if (!conversationId) {
    const { data: created, error } = await supabase
      .from('fp_conversations')
      .insert({
        org_id: opts.orgId,
        channel: opts.channel,
        contact_handle: opts.handle,
        contact_name: opts.name ?? (await opts.lookupName?.()) ?? null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    conversationId = created.id;
  }

  const { error } = await supabase.from('fp_messages').insert({
    org_id: opts.orgId,
    conversation_id: conversationId,
    direction: 'in',
    body: opts.body.slice(0, 4000),
    external_id: opts.externalId,
  });
  // 23505 = already stored (Meta retried the delivery).
  if (error && error.code !== '23505') throw new Error(error.message);
}

type WaValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string } }[];
  messages?: { id?: string; from?: string; text?: { body?: string } }[];
  statuses?: { id?: string; status?: string; errors?: { title?: string }[] }[];
};

// ---------------------------------------------------------------------------
// Zalo OA
// ---------------------------------------------------------------------------
type ZaloEvent = {
  event_name?: string;
  timestamp?: string | number;
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { msg_id?: string; msg_ids?: string[]; text?: string };
};

async function handleZalo(raw: string, signature: string): Promise<Response> {
  if (!zaloWebhookConfigured()) return new Response('Zalo secrets not set', { status: 500 });
  let event: ZaloEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('invalid body', { status: 400 });
  }
  if (!(await validZaloSignature(raw, String(event.timestamp ?? ''), signature))) {
    return new Response('invalid signature', { status: 401 });
  }

  const name = event.event_name ?? '';
  try {
    // A follower wrote to the OA: sender = follower, recipient = OA.
    if (name.startsWith('user_send_')) {
      const account = event.recipient?.id ? await channelAccount('zalo', event.recipient.id) : null;
      const userId = event.sender?.id;
      if (!account || !userId) {
        console.warn('channel-webhook: no organisation for Zalo OA', event.recipient?.id);
        return new Response('ok', { status: 200 });
      }
      await upsertInbound({
        orgId: account.org_id,
        channel: 'zalo',
        handle: userId,
        name: null,
        body: name === 'user_send_text' ? event.message?.text ?? '' : `[${name.slice('user_send_'.length)}]`,
        externalId: event.message?.msg_id ?? null,
        lookupName: () => zaloDisplayName(supabase, account.id, userId),
      });
      return new Response('ok', { status: 200 });
    }

    // Receipts for our replies: sender = OA, recipient = follower.
    const status = name === 'user_received_message' ? 'delivered' : name === 'user_seen_message' ? 'read' : null;
    if (status) {
      const account = event.sender?.id ? await channelAccount('zalo', event.sender.id) : null;
      const ids = [...(event.message?.msg_ids ?? []), ...(event.message?.msg_id ? [event.message.msg_id] : [])];
      if (account && ids.length) {
        // Never step back (a late "delivered" after "read").
        await supabase
          .from('fp_messages')
          .update({ delivery_status: status, delivery_error: null })
          .eq('org_id', account.org_id)
          .in('external_id', ids)
          .in('delivery_status', status === 'read' ? ['sent', 'delivered'] : ['sent']);
      }
    }
    // Follows, OA-side echoes and other events need nothing.
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('channel-webhook (zalo):', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500 });
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // WhatsApp webhook verification handshake.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (VERIFY_TOKEN && mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const zaloSignature = req.headers.get('x-zevent-signature');
  if (zaloSignature) return handleZalo(await req.text(), zaloSignature);

  // Fail closed: without the app secret nothing can be verified.
  if (!APP_SECRET) return new Response('WHATSAPP_APP_SECRET not set', { status: 500 });
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get('x-hub-signature-256')))) {
    return new Response('invalid signature', { status: 401 });
  }

  try {
    const payload = JSON.parse(raw);
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = (change?.value ?? {}) as WaValue;
        const orgId = await orgForNumber(value.metadata?.phone_number_id);
        if (!orgId) {
          console.warn('channel-webhook: no organisation for phone_number_id', value.metadata?.phone_number_id);
          continue;
        }

        for (const msg of value.messages ?? []) {
          if (!msg.from) continue;
          await upsertInbound({
            orgId,
            channel: 'whatsapp',
            handle: msg.from,
            name: value.contacts?.[0]?.profile?.name ?? null,
            body: msg.text?.body ?? '[non-text message]',
            externalId: msg.id ?? null,
          });
        }

        for (const st of value.statuses ?? []) {
          if (!st.id || !['sent', 'delivered', 'read', 'failed'].includes(st.status ?? '')) continue;
          await supabase
            .from('fp_messages')
            .update({
              delivery_status: st.status,
              delivery_error: st.status === 'failed' ? st.errors?.[0]?.title ?? 'failed' : null,
            })
            .eq('org_id', orgId)
            .eq('external_id', st.id);
        }
      }
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('channel-webhook:', e);
    // 500 makes Meta retry, which is what we want for a transient failure.
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
    });
  }
});
