// supabase/functions/billing-webhook/index.ts
//
// Receives Stripe and PayPal webhooks (migration 0086). Point both providers
// at:  https://<project>.supabase.co/functions/v1/billing-webhook
//
//   * Stripe deliveries are checked with the endpoint's signing secret
//     (STRIPE_WEBHOOK_SECRET); PayPal deliveries are verified by PayPal's own
//     API against PAYPAL_WEBHOOK_ID. Anything unverified gets 400.
//   * Each event is recorded once in fp_billing_events; a repeat is
//     acknowledged without doing anything. A failure answers 500 so the
//     provider retries, and the retry is processed again.
//   * Only the object ID is taken from the payload: the subscription,
//     invoice or refund is re-read from the provider's API.
//
// Stripe events: checkout.session.completed, customer.subscription.*,
//   invoice.paid / payment_succeeded / payment_failed / finalized / voided /
//   marked_uncollectible, charge.refunded.
// PayPal events: BILLING.SUBSCRIPTION.*, PAYMENT.SALE.COMPLETED,
//   PAYMENT.SALE.REFUNDED / REVERSED.
//
// Deploy WITHOUT JWT verification (providers don't sign in):
//   supabase functions deploy billing-webhook --no-verify-jwt --project-ref <ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ProviderError, applyPaypalRefund, applyPaypalSale, applyPaypalSubscription, applyStripeInvoice, applyStripeRefunds,
  applyStripeSubscription, billingEnv, paypal, paypalBase, paypalToken, stripe, verifyPaypalWebhook, verifyStripeSignature,
  type Json, type Outcome,
} from '../_shared/billing.ts';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const text = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return text('ok'); // provider URL checks
  const raw = await req.text();
  if (raw.length > 1_000_000) return text('too large', 413);
  const env = billingEnv();

  // ---- Stripe
  if (req.headers.get('stripe-signature')) {
    if (!env.stripeKey || !env.stripeWebhookSecret) return text('stripe not configured', 503);
    if (!(await verifyStripeSignature(raw, req.headers.get('stripe-signature'), env.stripeWebhookSecret))) return text('bad signature', 400);
    const event = JSON.parse(raw) as { id: string; type: string; data: { object: Json } };
    return handle('stripe', event.id, event.type, String(event.data?.object?.id ?? ''), () => stripeEvent(env.stripeKey!, event));
  }

  // ---- PayPal
  if (req.headers.get('paypal-transmission-id')) {
    if (!env.paypalClientId || !env.paypalSecret || !env.paypalWebhookId) return text('paypal not configured', 503);
    let event: { id: string; event_type: string; resource: Json };
    try {
      event = JSON.parse(raw);
    } catch {
      return text('bad request', 400);
    }
    const base = paypalBase(env.paypalEnv);
    const token = await paypalToken(env.paypalClientId, env.paypalSecret, base).catch(() => null);
    if (!token) return text('paypal unavailable', 503);
    if (!(await verifyPaypalWebhook(token, base, req.headers, event, env.paypalWebhookId))) return text('bad signature', 400);
    return handle('paypal', event.id, event.event_type, String(event.resource?.id ?? ''), () => paypalEvent(token, base, event));
  }

  return text('unknown sender', 400);
});

async function handle(provider: 'stripe' | 'paypal', id: string, type: string, objectId: string, run: () => Promise<Outcome>) {
  const { data: fresh, error } = await service.rpc('fp_billing_log_event', { p_provider: provider, p_event_id: id, p_type: type, p_object: objectId });
  if (error) return text('log failed', 500);
  if (fresh !== true) return text('duplicate');
  try {
    const out = await run();
    await service.rpc('fp_billing_finish_event', { p_provider: provider, p_event_id: id, p_status: out.status, p_error: out.note ?? null, p_org: out.org ?? null });
    return text(out.status);
  } catch (e) {
    const msg = e instanceof ProviderError ? `${e.provider} ${e.status}: ${e.message}` : String((e as Error)?.message ?? e);
    console.error(`billing-webhook ${provider} ${type} ${id}: ${msg}`);
    await service.rpc('fp_billing_finish_event', { p_provider: provider, p_event_id: id, p_status: 'failed', p_error: msg, p_org: null });
    return text('failed', 500);
  }
}

async function stripeEvent(key: string, event: { type: string; data: { object: Json } }): Promise<Outcome> {
  const obj = event.data.object;
  const t = event.type;
  if (t === 'checkout.session.completed') {
    if (obj.mode !== 'subscription' || !obj.subscription) return { status: 'ignored', note: 'not a subscription' };
    const sub = await stripe<Json>(key, 'GET', `/subscriptions/${encodeURIComponent(String(obj.subscription))}`);
    const meta = (obj.metadata ?? {}) as Record<string, string>;
    const out = await applyStripeSubscription(service, sub, meta.org_id ?? (obj.client_reference_id as string));
    if (meta.coupon && out.status === 'processed') await service.rpc('fp_billing_redeem_coupon', { p_code: meta.coupon });
    return out;
  }
  if (t.startsWith('customer.subscription.')) {
    const sub = await stripe<Json>(key, 'GET', `/subscriptions/${encodeURIComponent(String(obj.id))}`);
    return applyStripeSubscription(service, sub);
  }
  if (['invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed', 'invoice.finalized', 'invoice.voided', 'invoice.marked_uncollectible'].includes(t)) {
    const inv = await stripe<Json>(key, 'GET', `/invoices/${encodeURIComponent(String(obj.id))}`);
    return applyStripeInvoice(service, inv, t);
  }
  if (t === 'charge.refunded') {
    const charge = await stripe<Json>(key, 'GET', `/charges/${encodeURIComponent(String(obj.id))}`);
    const refunds = await stripe<{ data: Json[] }>(key, 'GET', '/refunds', { charge: String(obj.id), limit: 100 });
    return applyStripeRefunds(service, charge, refunds.data ?? []);
  }
  return { status: 'ignored', note: 'event not used' };
}

async function paypalEvent(token: string, base: string, event: { event_type: string; resource: Json }): Promise<Outcome> {
  const r = event.resource ?? {};
  const t = event.event_type;
  if (t.startsWith('BILLING.SUBSCRIPTION.')) {
    const sub = await paypal<Json>(token, base, 'GET', `/v1/billing/subscriptions/${encodeURIComponent(String(r.id))}`);
    const out = await applyPaypalSubscription(service, sub);
    if (t === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' && out.org) {
      const failed = ((sub.billing_info as Json)?.last_failed_payment ?? {}) as Json;
      const amount = (failed.amount ?? {}) as Json;
      if (Number(amount.value) > 0) {
        await service.rpc('fp_billing_upsert_invoice', {
          p_provider: 'paypal', p_ref: `${sub.id}:failed:${String(failed.time ?? '')}`, p_org: out.org, p_plan: null,
          p_amount: Number(amount.value), p_currency: String(amount.currency_code ?? 'USD'), p_status: 'failed',
        });
      }
    }
    return out;
  }
  if (t === 'PAYMENT.SALE.COMPLETED') {
    const sale = await paypal<Json>(token, base, 'GET', `/v1/payments/sale/${encodeURIComponent(String(r.id))}`);
    const subId = sale.billing_agreement_id as string | undefined;
    if (!subId) return { status: 'ignored', note: 'not a subscription payment' };
    const sub = await paypal<Json>(token, base, 'GET', `/v1/billing/subscriptions/${encodeURIComponent(subId)}`);
    return applyPaypalSale(service, sale, sub);
  }
  if (t === 'PAYMENT.SALE.REFUNDED') return applyPaypalRefund(service, r);
  if (t === 'PAYMENT.SALE.REVERSED') {
    // A chargeback: the resource is the sale itself.
    return applyPaypalRefund(service, { id: `reversal:${String(r.id)}`, sale_id: r.id, amount: r.amount }, null, 'Payment reversed (PayPal)');
  }
  return { status: 'ignored', note: 'event not used' };
}
