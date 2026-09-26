// Stripe and PayPal for FacilityPro billing (migration 0086).
//
// Plain REST calls (no SDKs), shared by billing-checkout, billing-webhook and
// admin-billing. Everything that decides what a provider event means lives
// here so it can be tested with recorded payloads (billing.test.ts).
//
// Secrets (Supabase → Edge Functions → Secrets; never in the app):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID,
//   PAYPAL_ENV = sandbox | live   (default sandbox)

export type Fetch = typeof fetch;
export type Json = Record<string, unknown>;
/** The subset of a Supabase client the billing code uses. */
export interface Db {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

// Stripe API version the code is written against. Webhook payloads are only
// used for the object ID; objects are re-read with this version.
export const STRIPE_VERSION = '2024-06-20';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
// Currencies Stripe counts in whole units (no cents).
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
export function fromMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? amount : Math.round(amount) / 100;
}
export function toMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------
/** Stripe's form encoding: {a: {b: [{c: 1}]}} → a[b][0][c]=1 */
export function formEncode(params: Json, prefix = ''): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') parts.push(formEncode(item as Json, `${key}[${i}]`));
        else parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === 'object') {
      parts.push(formEncode(v as Json, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

export class ProviderError extends Error {
  constructor(public provider: string, public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function stripe<T = Json>(key: string, method: 'GET' | 'POST' | 'DELETE', path: string, params?: Json, fetchImpl: Fetch = fetch): Promise<T> {
  const qs = params && method !== 'POST' ? `?${formEncode(params)}` : '';
  const res = await fetchImpl(`https://api.stripe.com/v1${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Stripe-Version': STRIPE_VERSION,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' && params ? formEncode(params) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (body as { error?: { message?: string; code?: string } }).error;
    throw new ProviderError('stripe', res.status, e?.message ?? `Stripe error ${res.status}`, e?.code);
  }
  return body as T;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

/**
 * Checks a Stripe-Signature header ("t=…,v1=…") against the raw body:
 * HMAC-SHA256 of "t.body" with the endpoint secret, within 5 minutes.
 */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!Number.isFinite(t) || sigs.length === 0 || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => safeEqual(s, expected));
}

export function stripeStatus(s: string): 'active' | 'trialing' | 'past_due' | 'canceled' | null {
  switch (s) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due':
    case 'unpaid': return 'past_due';
    case 'canceled':
    case 'incomplete_expired': return 'canceled';
    default: return null; // incomplete, paused: nothing to apply yet
  }
}

const iso = (sec: unknown) => (typeof sec === 'number' ? new Date(sec * 1000).toISOString() : null);

async function planFor(db: Db, provider: 'stripe' | 'paypal', price: string | undefined) {
  if (!price) return null;
  const { data } = await db.rpc('fp_billing_plan_for_price', { p_provider: provider, p_price: price });
  const row = Array.isArray(data) ? data[0] : data;
  return row ? (row as { plan_code: string; billing_interval: string }) : null;
}

async function findOrg(db: Db, provider: string, subscription?: string | null, customer?: string | null): Promise<string | null> {
  const { data } = await db.rpc('fp_billing_find_org', { p_provider: provider, p_subscription: subscription ?? null, p_customer: customer ?? null });
  return isUuid(data) ? data : null;
}

async function must(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export interface Outcome {
  status: 'processed' | 'ignored';
  org?: string | null;
  note?: string;
}

/** Applies a Stripe subscription object (re-read from the API). */
export async function applyStripeSubscription(db: Db, sub: Json, hintOrg?: string | null): Promise<Outcome> {
  const item = ((sub.items as Json)?.data as Json[] | undefined)?.[0];
  const price = ((item?.price as Json)?.id as string) ?? undefined;
  const meta = (sub.metadata ?? {}) as Record<string, string>;
  const mapped = await planFor(db, 'stripe', price);
  const status = stripeStatus(String(sub.status));
  const customer = typeof sub.customer === 'string' ? sub.customer : ((sub.customer as Json)?.id as string);
  const org = [meta.org_id, hintOrg].find(isUuid) ?? (await findOrg(db, 'stripe', sub.id as string, customer));
  if (!org) return { status: 'ignored', note: 'unknown organisation' };
  if (!status) return { status: 'ignored', org, note: `status ${String(sub.status)}` };
  const result = await must(db.rpc('fp_billing_sync_subscription', {
    p_org: org,
    p_plan: mapped?.plan_code ?? meta.plan ?? null,
    p_interval: mapped?.billing_interval ?? (meta.interval === 'year' ? 'year' : 'month'),
    p_status: status,
    p_provider: 'stripe',
    p_customer: customer ?? null,
    p_subscription: sub.id,
    p_period_start: iso(sub.current_period_start ?? item?.current_period_start),
    p_period_end: iso(sub.current_period_end ?? item?.current_period_end),
    p_cancel_at_period_end: sub.cancel_at_period_end === true,
    p_trial_end: iso(sub.trial_end),
  }));
  return { status: result === 'ignored' ? 'ignored' : 'processed', org, note: result === 'ignored' ? 'older subscription' : undefined };
}

/** Records a Stripe invoice (re-read from the API). Free trial invoices are skipped. */
export async function applyStripeInvoice(db: Db, inv: Json, eventType: string): Promise<Outcome> {
  const currency = String(inv.currency ?? 'usd').toUpperCase();
  const paid = inv.status === 'paid';
  const minor = Number(paid ? inv.amount_paid : inv.amount_due) || 0;
  if (minor <= 0) return { status: 'ignored', note: 'zero amount' };
  const subId = typeof inv.subscription === 'string' ? inv.subscription : ((inv.subscription as Json)?.id as string | undefined);
  const customer = typeof inv.customer === 'string' ? inv.customer : ((inv.customer as Json)?.id as string | undefined);
  const metaOrg = ((inv.subscription_details as Json)?.metadata as Record<string, string> | undefined)?.org_id;
  const org = (isUuid(metaOrg) ? metaOrg : null) ?? (await findOrg(db, 'stripe', subId, customer));
  if (!org) return { status: 'ignored', note: 'unknown organisation' };
  const line = ((inv.lines as Json)?.data as Json[] | undefined)?.[0];
  const mapped = await planFor(db, 'stripe', ((line?.price as Json)?.id as string) ?? undefined);
  const status =
    paid ? 'paid'
    : inv.status === 'void' ? 'void'
    : inv.status === 'uncollectible' || eventType === 'invoice.payment_failed' ? 'failed'
    : 'open';
  const period = (line?.period ?? {}) as Json;
  const pi = typeof inv.payment_intent === 'string' ? inv.payment_intent : ((inv.payment_intent as Json)?.id as string | undefined);
  await must(db.rpc('fp_billing_upsert_invoice', {
    p_provider: 'stripe',
    p_ref: inv.id,
    p_org: org,
    p_plan: mapped?.plan_code ?? null,
    p_amount: fromMinor(minor, currency),
    p_currency: currency,
    p_status: status,
    p_period_start: iso(period.start),
    p_period_end: iso(period.end),
    p_paid_at: iso((inv.status_transitions as Json)?.paid_at),
    p_attempts: Number(inv.attempt_count) || null,
    p_hosted_url: (inv.hosted_invoice_url as string) ?? null,
    p_pdf_url: (inv.invoice_pdf as string) ?? null,
    p_payment_ref: pi ?? null,
    p_description: (line?.description as string) ?? null,
  }));
  return { status: 'processed', org };
}

/** Records Stripe refunds for a charge (each refund once). */
export async function applyStripeRefunds(db: Db, charge: Json, refunds: Json[], admin?: string | null): Promise<Outcome> {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : ((charge.payment_intent as Json)?.id as string | undefined);
  const invId = pi ? await must(db.rpc('fp_billing_find_invoice', { p_provider: 'stripe', p_ref: pi })) : null;
  if (!isUuid(invId)) return { status: 'ignored', note: 'invoice not found' };
  for (const r of refunds) {
    if (r.status === 'failed' || r.status === 'canceled') continue;
    await must(db.rpc('fp_billing_record_refund', {
      p_invoice: invId,
      p_refund_id: r.id,
      p_amount: fromMinor(Number(r.amount), String(r.currency ?? charge.currency ?? 'usd')),
      p_reason: (r.reason as string) ?? null,
      p_admin: admin ?? null,
    }));
  }
  return { status: 'processed' };
}

// ---------------------------------------------------------------------------
// PayPal
// ---------------------------------------------------------------------------
export function paypalBase(env: string | undefined): string {
  return env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export async function paypalToken(clientId: string, secret: string, base: string, fetchImpl: Fetch = fetch): Promise<string> {
  const res = await fetchImpl(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !(body as Json).access_token) throw new ProviderError('paypal', res.status, 'PayPal sign-in failed. Check PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV.');
  return (body as Json).access_token as string;
}

export async function paypal<T = Json>(token: string, base: string, method: 'GET' | 'POST', path: string, body?: unknown, fetchImpl: Fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ProviderError('paypal', res.status, (json as { message?: string }).message ?? `PayPal error ${res.status}`, (json as { name?: string }).name);
  }
  return json as T;
}

/** Asks PayPal whether a webhook delivery is genuine (their recommended check). */
export async function verifyPaypalWebhook(token: string, base: string, headers: Headers, event: unknown, webhookId: string, fetchImpl: Fetch = fetch): Promise<boolean> {
  const need = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
  if (!webhookId || need.some((h) => !headers.get(h))) return false;
  const certUrl = headers.get('paypal-cert-url')!;
  if (!/^https:\/\/api(-m)?(\.sandbox)?\.paypal\.com\//.test(certUrl)) return false;
  try {
    const r = await paypal<{ verification_status?: string }>(token, base, 'POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: certUrl,
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event,
    }, fetchImpl);
    return r.verification_status === 'SUCCESS';
  } catch {
    return false;
  }
}

export function paypalStatus(s: string): 'active' | 'past_due' | 'canceled' | null {
  switch (s) {
    case 'ACTIVE': return 'active';
    case 'SUSPENDED': return 'past_due';
    case 'CANCELLED':
    case 'EXPIRED': return 'canceled';
    default: return null; // APPROVAL_PENDING, APPROVED: not paid yet
  }
}

/** custom_id we send with a PayPal subscription: "<org>|<plan>|<interval>". */
export function parseCustomId(v: unknown): { org: string | null; plan: string | null; interval: 'month' | 'year' } {
  const [org, plan, interval] = typeof v === 'string' ? v.split('|') : [];
  return { org: isUuid(org) ? org : null, plan: plan || null, interval: interval === 'year' ? 'year' : 'month' };
}

/** Applies a PayPal subscription object (re-read from the API). */
export async function applyPaypalSubscription(db: Db, sub: Json): Promise<Outcome> {
  const custom = parseCustomId(sub.custom_id);
  const org = custom.org ?? (await findOrg(db, 'paypal', sub.id as string, null));
  if (!org) return { status: 'ignored', note: 'unknown organisation' };
  const status = paypalStatus(String(sub.status));
  if (!status) return { status: 'ignored', org, note: `status ${String(sub.status)}` };
  const mapped = await planFor(db, 'paypal', sub.plan_id as string);
  const billing = (sub.billing_info ?? {}) as Json;
  const result = await must(db.rpc('fp_billing_sync_subscription', {
    p_org: org,
    p_plan: mapped?.plan_code ?? custom.plan,
    p_interval: mapped?.billing_interval ?? custom.interval,
    p_status: status,
    p_provider: 'paypal',
    p_customer: ((sub.subscriber as Json)?.payer_id as string) ?? null,
    p_subscription: sub.id,
    p_period_start: ((billing.last_payment as Json)?.time as string) ?? (sub.start_time as string) ?? null,
    p_period_end: (billing.next_billing_time as string) ?? null,
    p_cancel_at_period_end: false,
    p_trial_end: null,
  }));
  return { status: result === 'ignored' ? 'ignored' : 'processed', org };
}

/** Records a completed PayPal payment (sale) against its subscription. */
export async function applyPaypalSale(db: Db, sale: Json, sub: Json | null): Promise<Outcome> {
  const subId = (sale.billing_agreement_id as string) ?? (sub?.id as string);
  const custom = parseCustomId(sub?.custom_id);
  const org = custom.org ?? (await findOrg(db, 'paypal', subId, null));
  if (!org) return { status: 'ignored', note: 'unknown organisation' };
  const amount = (sale.amount ?? {}) as Json;
  const mapped = sub ? await planFor(db, 'paypal', sub.plan_id as string) : null;
  await must(db.rpc('fp_billing_upsert_invoice', {
    p_provider: 'paypal',
    p_ref: sale.id,
    p_org: org,
    p_plan: mapped?.plan_code ?? custom.plan,
    p_amount: Number(amount.total ?? amount.value) || 0,
    p_currency: String(amount.currency ?? amount.currency_code ?? 'USD'),
    p_status: sale.state === 'completed' || sale.state === 'COMPLETED' || !sale.state ? 'paid' : 'open',
    p_period_start: (sale.create_time as string) ?? null,
    p_period_end: ((sub?.billing_info as Json)?.next_billing_time as string) ?? null,
    p_paid_at: (sale.create_time as string) ?? null,
    p_attempts: 1,
    p_hosted_url: null,
    p_pdf_url: null,
    p_payment_ref: sale.id,
    p_description: null,
  }));
  return { status: 'processed', org };
}

/** Records a PayPal refund of a sale. */
export async function applyPaypalRefund(db: Db, refund: Json, admin?: string | null, reason?: string | null): Promise<Outcome> {
  const saleId = (refund.sale_id as string) ?? (refund.parent_payment as string);
  const invId = saleId ? await must(db.rpc('fp_billing_find_invoice', { p_provider: 'paypal', p_ref: saleId })) : null;
  if (!isUuid(invId)) return { status: 'ignored', note: 'invoice not found' };
  const amount = (refund.amount ?? {}) as Json;
  await must(db.rpc('fp_billing_record_refund', {
    p_invoice: invId,
    p_refund_id: refund.id,
    p_amount: Math.abs(Number(amount.total ?? amount.value) || 0),
    p_reason: reason ?? null,
    p_admin: admin ?? null,
  }));
  return { status: 'processed' };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
export interface BillingEnv {
  stripeKey?: string;
  stripeWebhookSecret?: string;
  paypalClientId?: string;
  paypalSecret?: string;
  paypalWebhookId?: string;
  paypalEnv: 'sandbox' | 'live';
}
export function billingEnv(get: (k: string) => string | undefined = (k) => Deno.env.get(k)): BillingEnv {
  return {
    stripeKey: get('STRIPE_SECRET_KEY') || undefined,
    stripeWebhookSecret: get('STRIPE_WEBHOOK_SECRET') || undefined,
    paypalClientId: get('PAYPAL_CLIENT_ID') || undefined,
    paypalSecret: get('PAYPAL_CLIENT_SECRET') || undefined,
    paypalWebhookId: get('PAYPAL_WEBHOOK_ID') || undefined,
    paypalEnv: get('PAYPAL_ENV') === 'live' ? 'live' : 'sandbox',
  };
}
/** What is set up — never the values themselves. */
export function billingStatus(env: BillingEnv) {
  return {
    stripe: {
      configured: !!env.stripeKey,
      webhook: !!env.stripeWebhookSecret,
      mode: env.stripeKey ? (env.stripeKey.startsWith('sk_live_') || env.stripeKey.startsWith('rk_live_') ? 'live' : 'test') : null,
    },
    paypal: { configured: !!(env.paypalClientId && env.paypalSecret), webhook: !!env.paypalWebhookId, mode: env.paypalEnv },
  };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
