// supabase/functions/channel-webhook/index.ts
//
// Inbound messages from external channels land here, are normalised, and are
// written into fp_conversations / fp_messages. Standalone Edge Function (Deno).
//
// Deploy:
//   supabase functions deploy channel-webhook --no-verify-jwt
//   supabase secrets set WHATSAPP_VERIFY_TOKEN=your-verify-token
//   supabase secrets set WHATSAPP_ORG_ID=<the org uuid that owns this number>
//
// Point your WhatsApp Cloud API (or Zalo/Line) webhook at:
//   https://<project-ref>.functions.supabase.co/channel-webhook
//
// This implements the WhatsApp Cloud API shape (GET verification + POST
// messages). To add Zalo/Line, branch on the payload and reuse upsertInbound().

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const ORG_ID = Deno.env.get('WHATSAPP_ORG_ID') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function upsertInbound(opts: {
  channel: string;
  handle: string;
  name: string | null;
  body: string;
}) {
  const { data: existing } = await supabase
    .from('fp_conversations')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('channel', opts.channel)
    .eq('contact_handle', opts.handle)
    .maybeSingle();

  let conversationId = existing?.id as string | undefined;
  if (!conversationId) {
    const { data: created, error } = await supabase
      .from('fp_conversations')
      .insert({
        org_id: ORG_ID,
        channel: opts.channel,
        contact_handle: opts.handle,
        contact_name: opts.name,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    conversationId = created.id;
  }

  await supabase.from('fp_messages').insert({
    org_id: ORG_ID,
    conversation_id: conversationId,
    direction: 'in',
    body: opts.body,
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // WhatsApp webhook verification handshake.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  try {
    const payload = await req.json();
    // WhatsApp Cloud API shape.
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (msg) {
      const handle = msg.from as string;
      const name = value?.contacts?.[0]?.profile?.name ?? null;
      const body = msg.text?.body ?? '[non-text message]';
      await upsertInbound({ channel: 'whatsapp', handle, name, body });
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
    });
  }
});
