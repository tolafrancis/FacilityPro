// supabase/functions/process-outbox/index.ts
//
// Delivers pending FacilitySpace email notifications from fp_notification_outbox.
// This is a standalone Supabase Edge Function (Deno) — it is NOT bundled with
// the web app and does not affect the frontend build.
//
// Deploy:
//   supabase functions deploy process-outbox --no-verify-jwt
//
// Secrets (set once):
//   supabase secrets set RESEND_API_KEY=re_xxx
//   supabase secrets set OUTBOX_FROM="FacilitySpace <notifications@yourdomain.com>"
//   # For SMS (optional):
//   supabase secrets set TWILIO_ACCOUNT_SID=ACxxx
//   supabase secrets set TWILIO_AUTH_TOKEN=xxx
//   supabase secrets set TWILIO_FROM="+1..."
//   # For web push (optional): generate a VAPID keypair (npx web-push generate-vapid-keys)
//   supabase secrets set VAPID_PUBLIC_KEY=xxx
//   supabase secrets set VAPID_PRIVATE_KEY=xxx
//   supabase secrets set VAPID_SUBJECT="mailto:ops@yourdomain.com"
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//   The VAPID_PUBLIC_KEY must also be exposed to the web app as VITE_VAPID_PUBLIC_KEY.
//
// Schedule it (so messages go out without manual calls). Either:
//   - Supabase Dashboard -> Edge Functions -> Schedules (e.g. every 5 minutes), or
//   - pg_cron + pg_net from the SQL editor:
//       select cron.schedule('fp-outbox', '*/5 * * * *', $$
//         select net.http_post(
//           url := 'https://<project-ref>.functions.supabase.co/process-outbox',
//           headers := '{"Authorization":"Bearer <anon-or-service-key>"}'::jsonb
//         );
//       $$);
//
// Each row carries a `channel` ('email' | 'sms' | 'push'); add more by branching
// in deliver().

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const OUTBOX_FROM = Deno.env.get('OUTBOX_FROM') ?? 'FacilitySpace <onboarding@resend.dev>';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_FROM = Deno.env.get('TWILIO_FROM') ?? '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ops@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface OutboxRow {
  id: string;
  channel: string;
  to_address: string;
  subject: string;
  body: string | null;
}

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: OUTBOX_FROM,
      to: [to],
      subject,
      text: body,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

async function sendSms(to: string, body: string): Promise<void> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
    throw new Error('Twilio secrets not set');
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) {
    throw new Error(`Twilio ${res.status}: ${await res.text()}`);
  }
}

async function sendPush(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  body: string
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID keys not set');
  const { data, error } = await supabase
    .from('fp_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  const subs = data ?? [];
  if (subs.length === 0) throw new Error('No push subscriptions');

  const payload = JSON.stringify({ title, body });
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
    } catch (e) {
      // Drop expired/invalid subscriptions.
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from('fp_push_subscriptions').delete().eq('id', s.id);
      }
    }
  }
}

async function deliver(row: OutboxRow, supabase: SupabaseClient): Promise<void> {
  if (row.channel === 'sms') {
    await sendSms(row.to_address, row.body ?? row.subject);
  } else if (row.channel === 'push') {
    await sendPush(supabase, row.to_address, row.subject, row.body ?? row.subject);
  } else {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
    await sendEmail(row.to_address, row.subject, row.body ?? row.subject);
  }
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase
    .from('fp_notification_outbox')
    .select('id, channel, to_address, subject, body')
    .eq('status', 'pending')
    .order('created_at')
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const rows = (data ?? []) as OutboxRow[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await deliver(row, supabase);
      await supabase
        .from('fp_notification_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
        .eq('id', row.id);
      sent++;
    } catch (e) {
      await supabase
        .from('fp_notification_outbox')
        .update({ status: 'failed', error: e instanceof Error ? e.message : String(e) })
        .eq('id', row.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ processed: rows.length, sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
