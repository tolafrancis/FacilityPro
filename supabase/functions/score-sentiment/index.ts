// supabase/functions/score-sentiment/index.ts
//
// Classifies the sentiment of inbound inbox messages with Claude, then writes
// fp_messages.sentiment ('low' | 'neutral' | 'high') + sentiment_score (-1..1).
// When a message is marked 'low', the DB trigger (0037) fires the workflow
// trigger `low_sentiment`. This replaces the lexical keyword heuristic.
//
// Standalone Supabase Edge Function (Deno) — not bundled with the web app.
//
// Deploy:
//   supabase functions deploy score-sentiment --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Schedule it (e.g. every 2 minutes) via pg_cron + pg_net, the same way as
// process-outbox; it rejects callers without the service-role key (or
// CRON_SECRET). Only organisations with settings.ai_sentiment = true are
// scored: their inbound message text is sent to Anthropic.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { forbidden, isSchedulerRequest } from '../_shared/scheduler-auth.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
// Cheap, fast model is ideal for short-text classification.
const MODEL = 'claude-haiku-4-5-20251001';

interface MessageRow {
  id: string;
  body: string;
}

async function classify(text: string): Promise<{ sentiment: string; score: number }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 64,
      system:
        'You classify the sentiment of a facilities/maintenance requestor message. ' +
        'Reply with ONLY compact JSON: {"sentiment":"low|neutral|high","score":<number -1..1>}. ' +
        '"low" means negative/unhappy/angry. No prose.',
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const raw = (data?.content?.[0]?.text ?? '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  const parsed = match ? JSON.parse(match[0]) : { sentiment: 'neutral', score: 0 };
  const sentiment = ['low', 'neutral', 'high'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral';
  const score = typeof parsed.score === 'number' ? parsed.score : 0;
  return { sentiment, score };
}

Deno.serve(async (req) => {
  // Scheduler only (0061 pg_cron sends the service-role key).
  if (!isSchedulerRequest(req)) return forbidden();
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Only organisations that turned this on (Settings → Organisation profile)
  // have message text sent to the AI provider (audit S2-M5).
  const { data: orgs, error: orgError } = await supabase
    .from('fp_organizations')
    .select('id')
    .eq('settings->>ai_sentiment', 'true');
  if (orgError) {
    return new Response(JSON.stringify({ error: orgError.message }), { status: 500 });
  }
  const optedIn = (orgs ?? []).map((o) => o.id as string);
  if (optedIn.length === 0) {
    return new Response(JSON.stringify({ processed: 0, scored: 0, failed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await supabase
    .from('fp_messages')
    .select('id, body')
    .eq('direction', 'in')
    .is('sentiment', null)
    .in('org_id', optedIn)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const rows = (data ?? []) as MessageRow[];
  let scored = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const { sentiment, score } = await classify(row.body ?? '');
      await supabase
        .from('fp_messages')
        .update({ sentiment, sentiment_score: score })
        .eq('id', row.id);
      scored++;
    } catch (_e) {
      failed++;
    }
  }

  return new Response(JSON.stringify({ processed: rows.length, scored, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
