// supabase/functions/channel-send/index.ts
//
// Delivers an outbound inbox message to its external channel. The web app
// inserts the outbound row into fp_messages, then invokes this function with
// the message id. Standalone Edge Function (Deno).
//
// Deploy:
//   supabase functions deploy channel-send
//   supabase secrets set WHATSAPP_TOKEN=EAAG...         # WhatsApp Cloud API token (platform business account)
//   # Optional, single-tenant fallback for deployments without fp_channel_accounts rows:
//   supabase secrets set WHATSAPP_PHONE_ID=1234567890 WHATSAPP_ORG_ID=<org uuid>
//
// Security (migration 0064):
//   * The message is read with the caller's own JWT, so RLS decides whether
//     they may see it at all (staff of that organisation only), and only the
//     message's author can send it, once.
//   * It is sent from the number connected to that organisation
//     (fp_channel_accounts); an organisation without a number can't send.
//   * At most 500 outbound WhatsApp messages per organisation per day.
//
// 'manual' and 'web' conversations need no external delivery. Extend the
// switch for Zalo/Line.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const FALLBACK_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') ?? '';
const FALLBACK_ORG_ID = Deno.env.get('WHATSAPP_ORG_ID') ?? '';
const DAILY_LIMIT = 500;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const service = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function sendWhatsApp(phoneId: string, to: string, body: string): Promise<string | null> {
  if (!WHATSAPP_TOKEN) throw new Error('WhatsApp secrets not set');
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { messages?: { id?: string }[] };
  return data.messages?.[0]?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  // The caller's own client: every read below goes through their RLS.
  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth } = await asCaller.auth.getUser();
  if (!auth?.user) return json({ error: 'not_signed_in' }, 401);

  let messageId: unknown;
  try {
    ({ message_id: messageId } = await req.json());
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  if (typeof messageId !== 'string') return json({ error: 'message_id required' }, 400);

  const { data: msg } = await asCaller
    .from('fp_messages')
    .select('id, org_id, body, conversation_id, direction, sender, delivery_status')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return json({ error: 'message_not_found' }, 404);
  if (msg.direction !== 'out' || msg.sender !== auth.user.id) return json({ error: 'not_allowed' }, 403);
  if (msg.delivery_status) return json({ status: msg.delivery_status });

  const { data: conv } = await asCaller
    .from('fp_conversations')
    .select('channel, contact_handle')
    .eq('id', msg.conversation_id)
    .maybeSingle();
  if (!conv?.contact_handle || conv.channel !== 'whatsapp') {
    return json({ status: 'not_external' }); // manual/web/email: nothing to deliver
  }

  const { data: account } = await service
    .from('fp_channel_accounts')
    .select('external_id')
    .eq('org_id', msg.org_id)
    .eq('channel', 'whatsapp')
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  const phoneId =
    (account?.external_id as string | undefined) ??
    (FALLBACK_PHONE_ID && msg.org_id === FALLBACK_ORG_ID ? FALLBACK_PHONE_ID : null);
  if (!phoneId) return json({ error: 'channel_not_configured' }, 400);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await service
    .from('fp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', msg.org_id)
    .eq('direction', 'out')
    .in('delivery_status', ['sent', 'delivered', 'read'])
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    await service.from('fp_messages').update({ delivery_status: 'failed', delivery_error: 'daily_limit_reached' }).eq('id', msg.id);
    return json({ error: 'rate_limited' }, 429);
  }

  try {
    const externalId = await sendWhatsApp(phoneId, conv.contact_handle, msg.body);
    await service.from('fp_messages').update({ delivery_status: 'sent', external_id: externalId, delivery_error: null }).eq('id', msg.id);
    return json({ status: 'sent' });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await service.from('fp_messages').update({ delivery_status: 'failed', delivery_error: error.slice(0, 500) }).eq('id', msg.id);
    return json({ error: 'send_failed', detail: error }, 502);
  }
});
