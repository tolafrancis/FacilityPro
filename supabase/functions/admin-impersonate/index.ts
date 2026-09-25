// supabase/functions/admin-impersonate/index.ts
//
// "Sign in as" for platform support (admin panel, 0084). Returns a one-time
// sign-in link for a member of a tenant, so staff can see exactly what the
// user sees. Open it in a private window: it signs that window in as the
// user.
//
// Rules:
//   * the caller must have the tenants.impersonate permission (checked in the
//     database with the caller's own token: fp_admin_can);
//   * the user must be a member of the given tenant, and not platform staff;
//   * a reason (10–500 characters) is required;
//   * at most 20 per staff member per hour;
//   * every link is recorded in the admin audit trail (who, whom, why, IP)
//     before it is created.
//
// Deploy (JWT verification on — only signed-in callers):
//   supabase functions deploy admin-impersonate --project-ref <ref>
// Uses APP_URL (already set) for where the link lands.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');
const service = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const HOURLY_LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth } = await asCaller.auth.getUser();
  if (!auth?.user) return json({ error: 'not_signed_in' }, 401);

  const { data: allowed, error: permErr } = await asCaller.rpc('fp_admin_can', { p_permission: 'tenants.impersonate' });
  if (permErr || allowed !== true) return json({ error: 'not_authorized' }, 403);

  let body: { org_id?: unknown; user_id?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  const orgId = typeof body.org_id === 'string' && UUID.test(body.org_id) ? body.org_id : '';
  const userId = typeof body.user_id === 'string' && UUID.test(body.user_id) ? body.user_id : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!orgId || !userId) return json({ error: 'invalid_request' }, 400);
  if (reason.length < 10 || reason.length > 500) return json({ error: 'reason_required' }, 400);
  if (userId === auth.user.id) return json({ error: 'cannot_impersonate_self' }, 400);

  const { data: member } = await service.from('fp_users_orgs').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
  if (!member) return json({ error: 'not_a_member' }, 404);
  const { data: staff } = await service.from('fp_platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (staff) return json({ error: 'cannot_impersonate_staff' }, 403);

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await service
    .from('fp_admin_audit')
    .select('id', { count: 'exact', head: true })
    .eq('admin_id', auth.user.id)
    .eq('action', 'tenant.impersonate')
    .gte('at', since);
  if ((count ?? 0) >= HOURLY_LIMIT) return json({ error: 'rate_limited' }, 429);

  const { data: target, error: userErr } = await service.auth.admin.getUserById(userId);
  const email = target?.user?.email;
  if (userErr || !email) return json({ error: 'user_not_found' }, 404);

  // Record first: no link without an audit entry.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const { error: auditErr } = await service.from('fp_admin_audit').insert({
    admin_id: auth.user.id,
    action: 'tenant.impersonate',
    target_type: 'auth.users',
    target_id: userId,
    org_id: orgId,
    ip,
    after: { reason, email, role: member.role },
  });
  if (auditErr) return json({ error: 'audit_failed' }, 500);

  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${APP_URL || new URL(req.headers.get('origin') ?? SUPABASE_URL).origin}/` },
  });
  const url = link?.properties?.action_link;
  if (linkErr || !url) return json({ error: 'link_failed' }, 500);

  return json({ url, email });
});
