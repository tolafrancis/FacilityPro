// deno test supabase/functions/_shared/billing.test.ts
import {
  applyPaypalRefund, applyPaypalSale, applyPaypalSubscription, applyStripeInvoice, applyStripeRefunds, applyStripeSubscription,
  billingStatus, formEncode, fromMinor, hmacSha256Hex, parseCustomId, paypalStatus, stripeStatus, toMinor, verifyPaypalWebhook,
  verifyStripeSignature, type Db,
} from './billing.ts';

function eq(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const ORG = '11111111-2222-3333-4444-555555555555';
const INV = '99999999-2222-3333-4444-555555555555';

/** A fake database that records calls and answers lookups. */
function fakeDb(answers: Record<string, unknown> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db: Db = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve({ data: fn in answers ? answers[fn] : null, error: null });
    },
  };
  return { db, calls, call: (fn: string) => calls.find((c) => c.fn === fn)?.args };
}

// ---------------------------------------------------------------------------
Deno.test('Stripe signatures: valid, tampered, old, missing', async () => {
  const body = '{"id":"evt_1"}';
  const now = 1_700_000_000;
  const sig = await hmacSha256Hex('whsec_test', `${now}.${body}`);
  eq(await verifyStripeSignature(body, `t=${now},v1=${sig}`, 'whsec_test', now), true);
  eq(await verifyStripeSignature(body, `t=${now},v1=deadbeef,v1=${sig}`, 'whsec_test', now), true);
  eq(await verifyStripeSignature(body + ' ', `t=${now},v1=${sig}`, 'whsec_test', now), false);
  eq(await verifyStripeSignature(body, `t=${now},v1=${sig}`, 'whsec_other', now), false);
  eq(await verifyStripeSignature(body, `t=${now},v1=${sig}`, 'whsec_test', now + 301), false);
  eq(await verifyStripeSignature(body, null, 'whsec_test', now), false);
  eq(await verifyStripeSignature(body, `t=${now},v1=${sig}`, '', now), false);
});

Deno.test('Stripe form encoding handles nested objects and arrays', () => {
  eq(formEncode({ mode: 'subscription', line_items: [{ price: 'price_1', quantity: 1 }], metadata: { org_id: 'o' }, skip: undefined }),
    'mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Borg_id%5D=o');
});

Deno.test('money: cents for USD, whole units for VND and JPY', () => {
  eq(fromMinor(2900, 'usd'), 29);
  eq(toMinor(29.99, 'USD'), 2999);
  eq(fromMinor(500000, 'VND'), 500000);
  eq(toMinor(1200, 'jpy'), 1200);
});

Deno.test('provider statuses map to ours; unpaid ones are not applied', () => {
  eq([stripeStatus('active'), stripeStatus('unpaid'), stripeStatus('incomplete_expired'), stripeStatus('incomplete')], ['active', 'past_due', 'canceled', null]);
  eq([paypalStatus('ACTIVE'), paypalStatus('SUSPENDED'), paypalStatus('EXPIRED'), paypalStatus('APPROVAL_PENDING')], ['active', 'past_due', 'canceled', null]);
  eq(parseCustomId(`${ORG}|pro|year`), { org: ORG, plan: 'pro', interval: 'year' });
  eq(parseCustomId('nonsense|x'), { org: null, plan: 'x', interval: 'month' });
});

Deno.test('status never reveals keys', () => {
  const s = billingStatus({ stripeKey: 'sk_live_abc', stripeWebhookSecret: 'whsec', paypalEnv: 'sandbox' });
  eq(s, { stripe: { configured: true, webhook: true, mode: 'live' }, paypal: { configured: false, webhook: false, mode: 'sandbox' } });
  eq(JSON.stringify(s).includes('sk_live_abc'), false);
});

// ---------------------------------------------------------------------------
Deno.test('a Stripe subscription: the price decides the plan, the org comes from metadata', async () => {
  const f = fakeDb({ fp_billing_plan_for_price: [{ plan_code: 'business', billing_interval: 'year' }], fp_billing_sync_subscription: 'applied' });
  const out = await applyStripeSubscription(f.db, {
    id: 'sub_1', status: 'active', customer: 'cus_1', cancel_at_period_end: true,
    metadata: { org_id: ORG, plan: 'pro', interval: 'month' },
    current_period_start: 1_700_000_000, current_period_end: 1_731_536_000,
    items: { data: [{ price: { id: 'price_BizY' } }] },
  });
  eq(out.status, 'processed');
  const a = f.call('fp_billing_sync_subscription')!;
  eq([a.p_org, a.p_plan, a.p_interval, a.p_status, a.p_subscription, a.p_customer, a.p_cancel_at_period_end],
    [ORG, 'business', 'year', 'active', 'sub_1', 'cus_1', true]);
  eq(a.p_period_end, new Date(1_731_536_000 * 1000).toISOString());
});

Deno.test('a Stripe subscription with an unknown org or an unpaid status is ignored', async () => {
  const f = fakeDb();
  eq((await applyStripeSubscription(f.db, { id: 'sub_x', status: 'active', customer: 'cus_x', metadata: { org_id: 'not-a-uuid' } })).status, 'ignored');
  const g = fakeDb({ fp_billing_find_org: ORG });
  eq((await applyStripeSubscription(g.db, { id: 'sub_x', status: 'incomplete', customer: 'cus_x' })).note, 'status incomplete');
  eq(g.call('fp_billing_sync_subscription'), undefined);
});

Deno.test('a paid Stripe invoice is recorded with amount, links and payment reference', async () => {
  const f = fakeDb({ fp_billing_find_org: ORG, fp_billing_plan_for_price: [{ plan_code: 'pro', billing_interval: 'month' }] });
  await applyStripeInvoice(f.db, {
    id: 'in_1', status: 'paid', amount_paid: 2900, amount_due: 2900, currency: 'usd', subscription: 'sub_1', customer: 'cus_1',
    payment_intent: 'pi_1', hosted_invoice_url: 'https://invoice.stripe.com/i/1', invoice_pdf: 'https://pay.stripe.com/pdf',
    attempt_count: 1, status_transitions: { paid_at: 1_700_000_100 },
    lines: { data: [{ price: { id: 'price_ProM' }, period: { start: 1_700_000_000, end: 1_702_592_000 }, description: '1 × Pro' }] },
  }, 'invoice.paid');
  const a = f.call('fp_billing_upsert_invoice')!;
  eq([a.p_ref, a.p_org, a.p_plan, a.p_amount, a.p_currency, a.p_status, a.p_payment_ref], ['in_1', ORG, 'pro', 29, 'USD', 'paid', 'pi_1']);
});

Deno.test('a failed Stripe payment is recorded as failed; trial invoices of 0 are skipped', async () => {
  const f = fakeDb({ fp_billing_find_org: ORG });
  await applyStripeInvoice(f.db, { id: 'in_2', status: 'open', amount_due: 9900, currency: 'usd', subscription: 'sub_1', attempt_count: 2 }, 'invoice.payment_failed');
  eq(f.call('fp_billing_upsert_invoice')!.p_status, 'failed');
  const g = fakeDb({ fp_billing_find_org: ORG });
  eq((await applyStripeInvoice(g.db, { id: 'in_3', status: 'paid', amount_paid: 0, currency: 'usd' }, 'invoice.paid')).status, 'ignored');
});

Deno.test('Stripe refunds are recorded per refund against the paid invoice', async () => {
  const f = fakeDb({ fp_billing_find_invoice: INV });
  await applyStripeRefunds(f.db, { id: 'ch_1', payment_intent: 'pi_1', currency: 'usd' }, [
    { id: 're_1', amount: 1000, status: 'succeeded' }, { id: 're_2', amount: 500, status: 'failed' },
  ]);
  const refunds = f.calls.filter((c) => c.fn === 'fp_billing_record_refund');
  eq(refunds.length, 1);
  eq([refunds[0].args.p_invoice, refunds[0].args.p_refund_id, refunds[0].args.p_amount], [INV, 're_1', 10]);
});

// ---------------------------------------------------------------------------
Deno.test('a PayPal subscription is applied from its custom_id and plan', async () => {
  const f = fakeDb({ fp_billing_plan_for_price: [{ plan_code: 'pro', billing_interval: 'year' }], fp_billing_sync_subscription: 'applied' });
  const out = await applyPaypalSubscription(f.db, {
    id: 'I-ABC', status: 'ACTIVE', plan_id: 'P-PROYEAR', custom_id: `${ORG}|pro|year`, subscriber: { payer_id: 'PAYER1' },
    billing_info: { next_billing_time: '2027-09-26T00:00:00Z', last_payment: { time: '2026-09-26T00:00:00Z' } },
  });
  eq(out.status, 'processed');
  const a = f.call('fp_billing_sync_subscription')!;
  eq([a.p_org, a.p_plan, a.p_interval, a.p_status, a.p_provider, a.p_customer, a.p_period_end],
    [ORG, 'pro', 'year', 'active', 'paypal', 'PAYER1', '2027-09-26T00:00:00Z']);
});

Deno.test('PayPal payments and refunds become invoices and refunds', async () => {
  const f = fakeDb({ fp_billing_find_invoice: INV });
  await applyPaypalSale(f.db, { id: 'SALE1', state: 'completed', amount: { total: '290.00', currency: 'USD' }, billing_agreement_id: 'I-ABC', create_time: '2026-09-26T00:00:00Z' },
    { id: 'I-ABC', custom_id: `${ORG}|pro|year`, plan_id: 'P-PROYEAR' });
  const inv = f.call('fp_billing_upsert_invoice')!;
  eq([inv.p_provider, inv.p_ref, inv.p_org, inv.p_amount, inv.p_status, inv.p_payment_ref], ['paypal', 'SALE1', ORG, 290, 'paid', 'SALE1']);
  await applyPaypalRefund(f.db, { id: 'REF1', sale_id: 'SALE1', amount: { total: '-50.00', currency: 'USD' } });
  const r = f.call('fp_billing_record_refund')!;
  eq([r.p_invoice, r.p_refund_id, r.p_amount], [INV, 'REF1', 50]);
});

Deno.test('PayPal webhooks: verified by PayPal; missing headers or a foreign cert URL fail without asking', async () => {
  let asked = 0;
  const ok = (async () => { asked++; return new Response(JSON.stringify({ verification_status: 'SUCCESS' })); }) as unknown as typeof fetch;
  const bad = (async () => new Response(JSON.stringify({ verification_status: 'FAILURE' }))) as unknown as typeof fetch;
  const h = (cert = 'https://api.paypal.com/v1/notifications/certs/CERT-1') => new Headers({
    'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': cert, 'paypal-transmission-id': 't1',
    'paypal-transmission-sig': 'sig', 'paypal-transmission-time': '2026-09-26T00:00:00Z',
  });
  eq(await verifyPaypalWebhook('tok', 'https://api-m.paypal.com', h(), { id: 'WH-1' }, 'WEBHOOK', ok), true);
  eq(await verifyPaypalWebhook('tok', 'https://api-m.paypal.com', h(), { id: 'WH-1' }, 'WEBHOOK', bad), false);
  eq(await verifyPaypalWebhook('tok', 'https://api-m.paypal.com', h('https://evil.example/cert'), { id: 'WH-1' }, 'WEBHOOK', ok), false);
  eq(await verifyPaypalWebhook('tok', 'https://api-m.paypal.com', new Headers(), { id: 'WH-1' }, 'WEBHOOK', ok), false);
  eq(asked, 1);
});
