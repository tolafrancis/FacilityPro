// supabase/functions/channel-send/index.ts
//
// Delivers an outbound message to its external channel. The web app inserts the
// outbound row into fp_messages, then invokes this function with the message id.
// Standalone Edge Function (Deno).
//
// Deploy:
//   supabase functions deploy channel-send
//   supabase secrets set WHATSAPP_TOKEN=EAAG...        # WhatsApp Cloud API token
//   supabase secrets set WHATSAPP_PHONE_ID=1234567890  # WhatsApp phone number id
//
// 'manual' and 'web' conversations need no external delivery. Extend the switch
// for Zalo/Line.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function sendWhatsApp(to: string, body: string): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) throw new Error('WhatsApp secrets not set');
  const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  try {
    const { message_id } = await req.json();
    if (!message_id) return new Response('message_id required', { status: 400 });

    const { data: msg, error } = await supabase
      .from('fp_messages')
      .select('id, body, conversation_id, direction')
      .eq('id', message_id)
      .single();
    if (error || !msg) return new Response('message not found', { status: 404 });
    if (msg.direction !== 'out') return new Response('not outbound', { status: 200 });

    const { data: conv } = await supabase
      .from('fp_conversations')
      .select('channel, contact_handle')
      .eq('id', msg.conversation_id)
      .single();

    if (conv && conv.contact_handle) {
      switch (conv.channel) {
        case 'whatsapp':
          await sendWhatsApp(conv.contact_handle, msg.body);
          break;
        // case 'zalo': await sendZalo(...); break;
        default:
          break; // manual/web/email: nothing to deliver externally
      }
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
    });
  }
});
