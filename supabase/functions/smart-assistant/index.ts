// supabase/functions/smart-assistant/index.ts
//
// Server-side AI call for the Smart assistant page (audit S2-H5: the OpenAI
// key used to be compiled into the web app, i.e. public). The key now lives
// only here, as a function secret.
//
// Deploy:
//   supabase functions deploy smart-assistant
//   supabase secrets set OPENAI_API_KEY=sk-...
//   supabase secrets set OPENAI_MODEL=gpt-4o-mini        # optional
//
// Only signed-in members of the given organisation can call it; each user
// gets 30 requests per hour, and prompts are capped at 2,000 characters.
//
// { task: 'blog_post' } (admin console → Blog → AI Generate Blog) drafts a
// whole blog post for platform staff who can manage content: 20 drafts per
// hour, JSON fields for the editor. It never saves or publishes anything.
//   supabase secrets set OPENAI_BLOG_MODEL=gpt-4o      # optional, defaults to OPENAI_MODEL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { MAX_TOPIC, buildBlogMessages, cleanLinks, parseJsonObject, sanitizeBlogDraft } from '../_shared/blog-ai.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
const OPENAI_BLOG_MODEL = Deno.env.get('OPENAI_BLOG_MODEL') ?? OPENAI_MODEL;
const HOURLY_LIMIT = 30;
const BLOG_HOURLY_LIMIT = 20;
const MAX_PROMPT = 2000;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!OPENAI_API_KEY) return json({ error: 'not_configured' }, 503);

  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await asCaller.auth.getUser();
  if (!auth?.user) return json({ error: 'not_signed_in' }, 401);

  let body: { prompt?: unknown; org_id?: unknown; task?: unknown; topic?: unknown; lng?: unknown; links?: unknown; variation?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  if (body.task === 'blog_post') return blogPost(asCaller, auth.user.id, body);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const orgId = typeof body.org_id === 'string' ? body.org_id : '';
  if (!prompt) return json({ error: 'prompt_required' }, 400);
  if (prompt.length > MAX_PROMPT) return json({ error: 'prompt_too_long' }, 400);

  // Membership, checked through the caller's own RLS.
  const { data: membership } = await asCaller
    .from('fp_users_orgs')
    .select('org_id')
    .eq('user_id', auth.user.id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!membership) return json({ error: 'not_a_member' }, 403);

  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await service
    .from('fp_assistant_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
    .gte('created_at', since);
  if ((count ?? 0) >= HOURLY_LIMIT) return json({ error: 'rate_limited' }, 429);
  await service.from('fp_assistant_usage').insert({ user_id: auth.user.id, org_id: orgId });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content:
            'You are FacilityPro Smart Assistant. Return a short summary and 3 bullet-point actions for a maintenance or facilities request. Reply in the language the user wrote in.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    console.error('smart-assistant: OpenAI', res.status, await res.text());
    return json({ error: 'upstream_failed' }, 502);
  }
  const data = await res.json();
  const content = (data?.choices?.[0]?.message?.content as string | undefined) ?? '';
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  return json({
    summary: lines[0] ?? '',
    actions: lines.slice(1, 4).map((line) => line.replace(/^([-*•]|\d+[.)])\s*/, '')),
  });
});

// ---------------------------------------------------------------------------
// Blog drafts (admin console)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Caller = { rpc: (fn: string) => PromiseLike<{ data: any }> };

async function blogPost(
  asCaller: Caller,
  userId: string,
  body: { topic?: unknown; lng?: unknown; links?: unknown; variation?: unknown },
) {
  // Staff who manage content (the same permission the blog itself requires).
  const { data: perms } = await asCaller.rpc('fp_admin_permissions');
  const permissions = ((perms as { permissions?: unknown } | null)?.permissions ?? []) as unknown[];
  if (!permissions.includes('announcements.manage')) return json({ error: 'not_authorized' }, 403);

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic) return json({ error: 'topic_required' }, 400);
  if (topic.length > MAX_TOPIC) return json({ error: 'topic_too_long' }, 400);
  const lng = body.lng === 'vi' ? 'vi' : 'en';
  const links = cleanLinks(body.links);
  const variation = Number.isInteger(body.variation) ? Math.min(Math.max(body.variation as number, 0), 20) : 0;

  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await service
    .from('fp_assistant_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('org_id', null)
    .gte('created_at', since);
  if ((count ?? 0) >= BLOG_HOURLY_LIMIT) return json({ error: 'rate_limited' }, 429);
  await service.from('fp_assistant_usage').insert({ user_id: userId, org_id: null });

  const { system, user } = buildBlogMessages(topic, lng, links, variation);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: OPENAI_BLOG_MODEL,
        max_tokens: 4000,
        temperature: variation > 0 ? 0.9 : 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    console.error('smart-assistant blog: request failed', e);
    return json({ error: (e as Error).name === 'AbortError' ? 'timeout' : 'upstream_failed' }, 504);
  }
  clearTimeout(timer);
  if (!res.ok) {
    console.error('smart-assistant blog: OpenAI', res.status, await res.text());
    return json({ error: res.status === 429 ? 'provider_busy' : 'upstream_failed' }, 502);
  }
  const data = await res.json();
  const choice = data?.choices?.[0];
  const parsed = parseJsonObject((choice?.message?.content as string | undefined) ?? '');
  if (!parsed) return json({ error: 'invalid_output' }, 502);
  const { draft, missing } = sanitizeBlogDraft(parsed, links);
  if (!draft.body) return json({ error: 'invalid_output' }, 502);
  return json({ draft, missing, truncated: choice?.finish_reason === 'length' });
}
