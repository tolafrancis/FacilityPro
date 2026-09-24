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

const orgCache = new Map<string, string | null>();
async function orgForNumber(phoneNumberId: string | undefined): Promise<string | null> {
  if (phoneNumberId) {
    if (!orgCache.has(phoneNumberId)) {
      const { data } = await supabase
        .from('fp_channel_accounts')
        .select('org_id')
        .eq('channel', 'whatsapp')
        .eq('external_id', phoneNumberId)
        .eq('active', true)
        .maybeSingle();
      orgCache.set(phoneNumberId, (data?.org_id as string | undefined) ?? null);
    }
    const org = orgCache.get(phoneNumberId);
    if (org) return org;
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
        contact_name: opts.name,
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
