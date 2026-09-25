// supabase/functions/public-report/index.ts
//
// CAPTCHA-protected entry point for anonymous QR fault reports. Verifies a
// Cloudflare Turnstile token, then files the report through fp_public_report()
// with the service role, passing the real client IP so the database's
// per-client rate limit (migration 0063) applies to the person, not to this
// function.
//
// Only needed if you turn CAPTCHA on (VITE_TURNSTILE_SITE_KEY in the web app).
// Deploy:
//   supabase functions deploy public-report
//   supabase secrets set TURNSTILE_SECRET_KEY=0x...
//   # Optional: only accept tokens issued on these hostnames (comma-separated)
//   supabase secrets set TURNSTILE_ALLOWED_HOSTNAMES=app.yourdomain.com
// Then make the CAPTCHA mandatory by closing the direct RPC to anonymous
// callers (see README):
//   revoke execute on function fp_public_report(uuid, text, text, text, text, uuid, uuid, text, text) from anon;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyTurnstile } from '../_shared/turnstile.ts';

const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
const ALLOWED_HOSTNAMES = (Deno.env.get('TURNSTILE_ALLOWED_HOSTNAMES') ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function clientIp(req: Request): string | null {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!TURNSTILE_SECRET_KEY) return json({ error: 'captcha_not_configured' }, 500);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 16 * 1024) return json({ error: 'report_too_long' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }

  const ip = clientIp(req);
  const token = typeof body.captchaToken === 'string' ? body.captchaToken : '';
  const captcha = token
    ? await verifyTurnstile(token, { secret: TURNSTILE_SECRET_KEY, ip, action: 'public_report', hostnames: ALLOWED_HOSTNAMES })
    : 'failed';
  if (captcha === 'unavailable') return json({ error: 'captcha_unavailable' }, 503);
  if (captcha !== 'ok') return json({ error: 'captcha_failed' }, 403);

  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await supabase.rpc('fp_public_report', {
    p_org: str(body.org),
    p_title: str(body.title) ?? '',
    p_body: str(body.body),
    p_severity: str(body.severity) ?? 'medium',
    p_lng: str(body.lng) ?? 'en',
    p_asset: str(body.asset),
    p_location: str(body.location),
    p_reporter: str(body.reporter),
    p_client_ip: ip,
  });

  if (error) {
    const code = error.message.split(/[\s:]/)[0];
    const known = ['rate_limited', 'report_too_long', 'report_invalid_asset', 'report_invalid_location'];
    return json({ error: known.includes(code) ? code : 'report_failed' }, code === 'rate_limited' ? 429 : 400);
  }
  return json({ id: data });
});
