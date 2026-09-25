// Cloudflare Worker in front of the static site (wrangler.jsonc).
//
// Only /webhooks/* reaches this code (assets.run_worker_first); every other
// request is served straight from the built site in dist/.
//
// /webhooks/zalo: Zalo only delivers to a URL on a domain verified in the
// Zalo app, and supabase.co can't be verified, so Zalo posts here and the
// request is forwarded unchanged (raw body + X-ZEvent-Signature) to the
// channel-webhook Edge Function, which checks the signature itself.

const DEFAULT_TARGET = 'https://jzrugcrpddcrlrymmurm.supabase.co/functions/v1/channel-webhook';
const FORWARD_HEADERS = ['content-type', 'x-zevent-signature'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/webhooks/zalo') {
      if (request.method !== 'POST' && request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
      }
      // Zalo's "Check" button (and any other unsigned request) only needs a
      // 200 to accept the URL. Nothing unsigned is forwarded or processed:
      // real events always carry X-ZEvent-Signature, which the function
      // verifies.
      if (request.method === 'GET' || !request.headers.get('x-zevent-signature')) {
        return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      const headers = new Headers();
      for (const name of FORWARD_HEADERS) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      const target = (env.ZALO_WEBHOOK_TARGET || DEFAULT_TARGET) + url.search;
      const upstream = await fetch(target, {
        method: 'POST',
        headers,
        body: await request.arrayBuffer(),
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'content-type': upstream.headers.get('content-type') ?? 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname.startsWith('/webhooks/')) {
      return new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
