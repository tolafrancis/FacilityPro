// Shared check for Edge Functions that only the scheduler may call (audit
// S2-M4). They're deployed with --no-verify-jwt, so without this anyone who
// knows the URL could trigger them.
//
// Accepted callers:
//   * pg_cron via fp_dispatch_edge_function (0061), which sends
//     `Authorization: Bearer <service_role key>` from Vault;
//   * an external scheduler sending `x-cron-secret: <CRON_SECRET>` (optional
//     secret: `supabase secrets set CRON_SECRET=…`).

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isSchedulerRequest(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  return sameSecret(bearer, serviceKey) || sameSecret(req.headers.get('x-cron-secret') ?? '', cronSecret);
}

export function forbidden(): Response {
  return new Response(JSON.stringify({ error: 'forbidden' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}
