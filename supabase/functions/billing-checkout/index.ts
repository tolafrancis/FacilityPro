// supabase/functions/billing-checkout/index.ts
//
// Tenant side of billing (migration 0086). Signed-in callers only; every
// check that matters runs in the database with the caller's own token
// (fp_billing_checkout_context / fp_billing_my_subscription: org admin of an
// open organisation, active plan, provider price set, valid coupon).
//
// POST { action: 'config' }                          → which providers are on
// POST { action: 'start', org_id, plan, interval, provider, coupon? }
//                                                    → { url } to pay at Stripe / PayPal
// POST { action: 'confirm', org_id, provider, session_id | subscription_id }
//                                                    → applies the result right away
//                                                      (the webhook does the same later)
// POST { action: 'portal', org_id }                  → { url } Stripe billing portal
// POST { action: 'cancel', org_id }                  → cancels a PayPal subscription
//
// Deploy with JWT verification on:
//   supabase functions deploy billing-checkout --project-ref <ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ProviderError, applyPaypalSubscription, applyStripeSubscription, billingEnv, billingStatus, corsHeaders, isUuid, json,
  parseCustomId, paypal, paypalBase, paypalToken, stripe, toMinor, type Json,
} from '../_shared/billing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');
const service = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth } = await asCaller.auth.getUser();
  if (!auth?.user) return json({ error: 'not_signed_in' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  const env = billingEnv();
  const status = billingStatus(env);
  const action = String(body.action ?? '');
  if (action === 'config') return json({ stripe: status.stripe.configured, paypal: status.paypal.configured });

  const orgId = isUuid(body.org_id) ? body.org_id : null;
  if (!orgId) return json({ error: 'invalid_request' }, 400);
  const app = APP_URL || new URL(req.headers.get('origin') ?? SUPABASE_URL).origin;
  const back = (q: string) => `${app}/billing?${q}`;

  try {
    if (action === 'start') {
      const provider = body.provider === 'paypal' ? 'paypal' : body.provider === 'stripe' ? 'stripe' : null;
      const interval = body.interval === 'year' ? 'year' : 'month';
      const plan = typeof body.plan === 'string' ? body.plan : '';
      const coupon = typeof body.coupon === 'string' && body.coupon.trim() ? body.coupon.trim().toUpperCase() : null;
      if (!provider || !plan) return json({ error: 'invalid_request' }, 400);
      if (provider === 'stripe' && !env.stripeKey) return json({ error: 'provider_not_configured' }, 400);
      if (provider === 'paypal' && !status.paypal.configured) return json({ error: 'provider_not_configured' }, 400);

      const { data: ctx, error } = await asCaller.rpc('fp_billing_checkout_context', {
        p_org: orgId, p_plan: plan, p_interval: interval, p_provider: provider, p_coupon: coupon,
      });
      if (error) return json({ error: error.message, detail: (error as { details?: string }).details ?? null }, error.code === '42501' ? 403 : 400);
      const c = ctx as { email: string | null; price_id: string; customer_id: string | null; coupon: Json | null };

      if (provider === 'stripe') {
        if (c.coupon) await ensureStripeCoupon(env.stripeKey!, c.coupon);
        const meta = { org_id: orgId, plan, interval, ...(c.coupon ? { coupon: String(c.coupon.code) } : {}) };
        const session = await stripe<{ url: string }>(env.stripeKey!, 'POST', '/checkout/sessions', {
          mode: 'subscription',
          line_items: [{ price: c.price_id, quantity: 1 }],
          ...(c.customer_id ? { customer: c.customer_id } : { customer_email: c.email ?? undefined }),
          client_reference_id: orgId,
          metadata: meta,
          subscription_data: { metadata: meta },
          ...(c.coupon ? { discounts: [{ coupon: String(c.coupon.code) }] } : {}),
          success_url: back('checkout=success&provider=stripe&session_id={CHECKOUT_SESSION_ID}'),
          cancel_url: back('checkout=cancelled'),
        });
        return json({ url: session.url });
      }

      const base = paypalBase(env.paypalEnv);
      const token = await paypalToken(env.paypalClientId!, env.paypalSecret!, base);
      const sub = await paypal<{ id: string; links?: { rel: string; href: string }[] }>(token, base, 'POST', '/v1/billing/subscriptions', {
        plan_id: c.price_id,
        custom_id: `${orgId}|${plan}|${interval}`,
        ...(c.email ? { subscriber: { email_address: c.email } } : {}),
        application_context: {
          brand_name: 'FacilityPro',
          user_action: 'SUBSCRIBE_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url: back('checkout=success&provider=paypal'),
          cancel_url: back('checkout=cancelled'),
        },
      });
      const approve = sub.links?.find((l) => l.rel === 'approve')?.href;
      if (!approve) return json({ error: 'provider_error' }, 502);
      return json({ url: approve });
    }

    // The remaining actions need the org's subscription and org-admin rights.
    const { data: mine, error: mineErr } = await asCaller.rpc('fp_billing_my_subscription', { p_org: orgId });
    if (mineErr) return json({ error: mineErr.message }, mineErr.code === '42501' ? 403 : 400);
    const current = (mine ?? {}) as { provider?: string; customer_id?: string; subscription_id?: string };

    if (action === 'confirm') {
      if (body.provider === 'stripe' && env.stripeKey && typeof body.session_id === 'string' && body.session_id.startsWith('cs_')) {
        const session = await stripe<Json>(env.stripeKey, 'GET', `/checkout/sessions/${encodeURIComponent(body.session_id)}`);
        if ((session.metadata as Record<string, string>)?.org_id !== orgId || !session.subscription) return json({ error: 'not_found' }, 404);
        const sub = await stripe<Json>(env.stripeKey, 'GET', `/subscriptions/${encodeURIComponent(String(session.subscription))}`);
        return json(await applyStripeSubscription(service, sub, orgId));
      }
      if (body.provider === 'paypal' && status.paypal.configured && typeof body.subscription_id === 'string' && /^I-[A-Z0-9]+$/.test(body.subscription_id)) {
        const base = paypalBase(env.paypalEnv);
        const token = await paypalToken(env.paypalClientId!, env.paypalSecret!, base);
        const sub = await paypal<Json>(token, base, 'GET', `/v1/billing/subscriptions/${body.subscription_id}`);
        if (parseCustomId(sub.custom_id).org !== orgId) return json({ error: 'not_found' }, 404);
        return json(await applyPaypalSubscription(service, sub));
      }
      return json({ error: 'invalid_request' }, 400);
    }

    if (action === 'portal') {
      if (!env.stripeKey || current.provider !== 'stripe' || !current.customer_id) return json({ error: 'no_card_subscription' }, 400);
      const portal = await stripe<{ url: string }>(env.stripeKey, 'POST', '/billing_portal/sessions', {
        customer: current.customer_id,
        return_url: back('portal=done'),
      });
      return json({ url: portal.url });
    }

    if (action === 'cancel') {
      if (!status.paypal.configured || current.provider !== 'paypal' || !current.subscription_id) return json({ error: 'no_paypal_subscription' }, 400);
      const base = paypalBase(env.paypalEnv);
      const token = await paypalToken(env.paypalClientId!, env.paypalSecret!, base);
      await paypal(token, base, 'POST', `/v1/billing/subscriptions/${current.subscription_id}/cancel`, { reason: 'Cancelled by the customer in FacilityPro' });
      const sub = await paypal<Json>(token, base, 'GET', `/v1/billing/subscriptions/${current.subscription_id}`);
      return json(await applyPaypalSubscription(service, sub));
    }

    return json({ error: 'invalid_request' }, 400);
  } catch (e) {
    if (e instanceof ProviderError) {
      console.error(`billing-checkout: ${e.provider} ${e.status} ${e.code ?? ''} ${e.message}`);
      return json({ error: 'provider_error', detail: e.message }, 502);
    }
    console.error('billing-checkout failed', e);
    return json({ error: 'failed' }, 500);
  }
});

/** Our coupon codes double as Stripe coupon IDs; create it there on first use. */
async function ensureStripeCoupon(key: string, c: Json) {
  const id = String(c.code);
  try {
    await stripe(key, 'GET', `/coupons/${encodeURIComponent(id)}`);
    return;
  } catch (e) {
    if (!(e instanceof ProviderError) || e.status !== 404) throw e;
  }
  await stripe(key, 'POST', '/coupons', {
    id,
    duration: String(c.duration ?? 'once'),
    ...(c.duration === 'repeating' ? { duration_in_months: Number(c.duration_months) } : {}),
    ...(c.percent_off != null
      ? { percent_off: Number(c.percent_off) }
      : { amount_off: toMinor(Number(c.amount_off), String(c.currency ?? 'USD')), currency: String(c.currency ?? 'USD').toLowerCase() }),
  });
}
