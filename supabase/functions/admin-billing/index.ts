// supabase/functions/admin-billing/index.ts
//
// Billing actions for platform staff that must happen at Stripe or PayPal
// (migration 0086). The permission is checked in the database with the
// caller's own token; every action is written to the admin audit trail.
//
// POST { action: 'status' }                         billing.view
//   → which providers are set up (never the keys), and the webhook URL
// POST { action: 'refund', invoice_id, amount, reason }     billing.manage
//   → refunds a Stripe or PayPal payment at the provider, then records it
// POST { action: 'cancel', org_id, at_period_end, reason }  billing.manage
//   → cancels a tenant's Stripe or PayPal subscription
//
// Manual invoices and plans are handled by database functions directly.
// Deploy with JWT verification on:
//   supabase functions deploy admin-billing --project-ref <ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ProviderError, applyPaypalRefund, applyPaypalSubscription, applyStripeRefunds, applyStripeSubscription, billingEnv,
  billingStatus, corsHeaders, isUuid, json, paypal, paypalBase, paypalToken, stripe, toMinor, type Json,
} from '../_shared/billing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
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
  const can = async (p: string) => (await asCaller.rpc('fp_admin_can', { p_permission: p })).data === true;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  const env = billingEnv();
  const action = String(body.action ?? '');
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const audit = (a: string, targetType: string, targetId: string, org: string | null, before: unknown, after: unknown) =>
    service.from('fp_admin_audit').insert({ admin_id: auth.user.id, action: a, target_type: targetType, target_id: targetId, org_id: org, ip, before, after });

  try {
    if (action === 'status') {
      if (!(await can('billing.view'))) return json({ error: 'not_authorized' }, 403);
      return json({ ...billingStatus(env), webhook_url: `${SUPABASE_URL}/functions/v1/billing-webhook` });
    }
    if (!(await can('billing.manage'))) return json({ error: 'not_authorized' }, 403);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 500) return json({ error: 'reason_required' }, 400);

    if (action === 'refund') {
      if (!isUuid(body.invoice_id)) return json({ error: 'invalid_request' }, 400);
      const { data: inv } = await service.from('fp_platform_invoices').select('*').eq('id', body.invoice_id).maybeSingle();
      if (!inv) return json({ error: 'not_found' }, 404);
      const left = Number(inv.amount) - Number(inv.refunded_amount);
      const amount = Number(body.amount);
      if (!(amount > 0) || amount > left + 1e-9) return json({ error: 'invalid_amount' }, 400);
      if (!['paid', 'refunded'].includes(inv.status)) return json({ error: 'invalid_status' }, 400);
      if (!inv.provider_payment_ref) return json({ error: 'no_payment_reference' }, 400);

      if (inv.provider === 'stripe') {
        if (!env.stripeKey) return json({ error: 'provider_not_configured' }, 400);
        const refund = await stripe<Json>(env.stripeKey, 'POST', '/refunds', {
          payment_intent: inv.provider_payment_ref,
          amount: toMinor(amount, inv.currency),
          metadata: { invoice: inv.number, by: auth.user.email ?? auth.user.id },
        });
        const charge = await stripe<Json>(env.stripeKey, 'GET', `/charges/${encodeURIComponent(String(refund.charge))}`);
        await applyStripeRefunds(service, charge, [{ ...refund, reason }], auth.user.id);
      } else if (inv.provider === 'paypal') {
        if (!env.paypalClientId || !env.paypalSecret) return json({ error: 'provider_not_configured' }, 400);
        const base = paypalBase(env.paypalEnv);
        const token = await paypalToken(env.paypalClientId, env.paypalSecret, base);
        const refund = await paypal<Json>(token, base, 'POST', `/v1/payments/sale/${encodeURIComponent(inv.provider_payment_ref)}/refund`, {
          amount: { total: amount.toFixed(2), currency: inv.currency },
        });
        await applyPaypalRefund(service, { ...refund, sale_id: inv.provider_payment_ref }, auth.user.id, reason);
      } else {
        return json({ error: 'manual_invoice' }, 400);
      }
      await audit('invoice.refund', 'fp_platform_invoices', inv.id, inv.org_id, { status: inv.status, refunded_amount: inv.refunded_amount },
        { amount, reason, provider: inv.provider });
      return json({ ok: true });
    }

    if (action === 'cancel') {
      if (!isUuid(body.org_id)) return json({ error: 'invalid_request' }, 400);
      const { data: sub } = await service.from('fp_subscriptions').select('*').eq('org_id', body.org_id).maybeSingle();
      if (!sub?.provider_subscription_id || !['stripe', 'paypal'].includes(sub.provider)) return json({ error: 'no_provider_subscription' }, 400);
      const atPeriodEnd = body.at_period_end !== false;

      if (sub.provider === 'stripe') {
        if (!env.stripeKey) return json({ error: 'provider_not_configured' }, 400);
        const path = `/subscriptions/${encodeURIComponent(sub.provider_subscription_id)}`;
        const updated = atPeriodEnd
          ? await stripe<Json>(env.stripeKey, 'POST', path, { cancel_at_period_end: true, metadata: { cancel_reason: reason.slice(0, 450) } })
          : await stripe<Json>(env.stripeKey, 'DELETE', path);
        await applyStripeSubscription(service, updated, sub.org_id);
      } else {
        if (!env.paypalClientId || !env.paypalSecret) return json({ error: 'provider_not_configured' }, 400);
        // PayPal cancels straight away (no "at period end").
        const base = paypalBase(env.paypalEnv);
        const token = await paypalToken(env.paypalClientId, env.paypalSecret, base);
        await paypal(token, base, 'POST', `/v1/billing/subscriptions/${sub.provider_subscription_id}/cancel`, { reason: reason.slice(0, 127) });
        const updated = await paypal<Json>(token, base, 'GET', `/v1/billing/subscriptions/${sub.provider_subscription_id}`);
        await applyPaypalSubscription(service, updated);
      }
      await audit('subscription.cancel', 'fp_subscriptions', sub.org_id, sub.org_id, { status: sub.status, provider: sub.provider },
        { reason, at_period_end: sub.provider === 'stripe' ? atPeriodEnd : false });
      return json({ ok: true });
    }

    return json({ error: 'invalid_request' }, 400);
  } catch (e) {
    if (e instanceof ProviderError) {
      console.error(`admin-billing: ${e.provider} ${e.status} ${e.code ?? ''} ${e.message}`);
      return json({ error: 'provider_error', detail: e.message }, 502);
    }
    console.error('admin-billing failed', e);
    return json({ error: 'failed' }, 500);
  }
});
