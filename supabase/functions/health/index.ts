// supabase/functions/health/index.ts
//
// One URL for an external uptime monitor (UptimeRobot, Better Stack, …):
// 200 when background jobs, email delivery and workflows are healthy, 503
// with the list of problems otherwise (migration 0066). Because the monitor
// alerts through its own channel, you hear about it even when our email
// delivery is the thing that's broken.
//
// Deploy:
//   supabase functions deploy health --no-verify-jwt
//   supabase secrets set HEALTH_TOKEN=<long random string>
// Monitor:
//   https://<project-ref>.functions.supabase.co/health?token=<HEALTH_TOKEN>
//   (alert on any non-200 status)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HEALTH_TOKEN = Deno.env.get('HEALTH_TOKEN') ?? '';

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const given = new URL(req.url).searchParams.get('token') ?? req.headers.get('x-health-token') ?? '';
  if (!HEALTH_TOKEN || !sameSecret(given, HEALTH_TOKEN)) {
    return new Response('forbidden', { status: 403 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await supabase.rpc('fp_system_status');
  if (error) {
    // The database itself is unreachable or broken: that's the worst case.
    return Response.json({ ok: false, problems: ['database'], error: error.message }, { status: 503 });
  }
  return Response.json(data, { status: (data as { ok?: boolean })?.ok ? 200 : 503 });
});
