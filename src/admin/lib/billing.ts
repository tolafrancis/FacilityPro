import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';

// Plans & billing (migration 0086; functions admin-billing, billing-webhook).
// Responses are validated with Zod; the database checks every permission.

const num = z.coerce.number();
const nstr = z.string().nullable();

export const INVOICE_STATUSES = ['open', 'paid', 'failed', 'refunded', 'void', 'draft'] as const;
export const PROVIDERS = ['stripe', 'paypal', 'manual'] as const;
export const SUB_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'pending'] as const;

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
const OverviewSchema = z.object({
  kpis: z.object({
    mrr: num, arr: num, paying_tenants: num, arpu: num, trials: num, past_due: num, cancel_scheduled: num,
    collected: num, refunded: num, outstanding: num, outstanding_count: num, failed: num, failed_count: num,
  }),
  monthly: z.array(z.object({ t: z.string(), net: num, stripe: num, paypal: num, manual: num })),
  by_provider: z.array(z.object({ provider: z.string(), amount: num, invoices: num })),
  by_plan: z.array(z.object({ plan: z.string(), tenants: num, mrr: num })),
  attention: z.array(z.object({
    id: z.string(), number: z.string(), org_id: z.string(), org_name: z.string(), amount: num, currency: z.string(),
    status: z.string(), provider: z.string(), at: z.string(),
  })),
});
export type BillingOverview = z.infer<typeof OverviewSchema>;

export function useBillingOverview(from: string, to: string) {
  return useQuery({
    queryKey: ['admin_billing_overview', from, to],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_billing_overview', { p_from: from, p_to: to });
      if (error) throw error;
      return OverviewSchema.parse(data);
    },
  });
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
export const InvoiceRowSchema = z.object({
  id: z.string(), number: z.string(), org_id: z.string(), org_name: z.string(), plan_code: nstr,
  amount: num, currency: z.string(), status: z.enum(INVOICE_STATUSES), provider: z.enum(PROVIDERS),
  provider_ref: nstr, issued_at: z.string(), due_at: nstr, paid_at: nstr, failed_at: nstr, attempts: num,
  refunded_amount: num, period_start: nstr, period_end: nstr, description: nstr, hosted_url: nstr, coupon_code: nstr,
});
export type InvoiceRow = z.infer<typeof InvoiceRowSchema>;

export interface InvoiceQuery {
  search?: string;
  status?: string;
  provider?: string;
  org?: string;
  sort: string;
  desc: boolean;
  limit: number;
  offset: number;
  ids?: string[];
}

export async function fetchInvoices(q: InvoiceQuery) {
  const { data, error } = await supabase.rpc('fp_admin_invoices', {
    p_search: q.search || null,
    p_status: q.status || null,
    p_provider: q.provider || null,
    p_org: q.org || null,
    p_sort: q.sort,
    p_desc: q.desc,
    p_limit: q.limit,
    p_offset: q.offset,
    p_ids: q.ids ?? null,
  });
  if (error) throw error;
  return z.object({ total: num, sum: num, rows: z.array(InvoiceRowSchema) }).parse(data);
}

export function useInvoices(q: InvoiceQuery) {
  return useQuery({ queryKey: ['admin_invoices', q], placeholderData: (prev) => prev, queryFn: () => fetchInvoices(q) });
}

export function useInvoice(id: string | null) {
  return useQuery({
    queryKey: ['admin_invoice', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_invoice', { p_id: id });
      if (error) throw error;
      return InvoiceRowSchema.extend({
        provider_payment_ref: nstr, void_reason: nstr, pdf_url: nstr,
        refunds: z.array(z.object({ id: z.string(), amount: num, reason: nstr, at: z.string(), provider_refund_id: nstr, by: nstr })),
      }).parse(data);
    },
  });
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------
export const SubscriptionRowSchema = z.object({
  org_id: z.string(), org_name: z.string(), plan_code: nstr, billing_interval: z.string(), status: z.string(),
  provider: z.string(), provider_subscription_id: nstr, current_period_end: nstr, trial_ends_at: nstr,
  cancel_at_period_end: z.boolean(), requested_plan_code: nstr, cancel_requested_at: nstr, mrr: num,
});
export type SubscriptionRow = z.infer<typeof SubscriptionRowSchema>;

export function useSubscriptions(q: { search?: string; status?: string; provider?: string; sort: string; desc: boolean; limit: number; offset: number }) {
  return useQuery({
    queryKey: ['admin_subscriptions', q],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_subscriptions', {
        p_search: q.search || null, p_status: q.status || null, p_provider: q.provider || null,
        p_sort: q.sort, p_desc: q.desc, p_limit: q.limit, p_offset: q.offset,
      });
      if (error) throw error;
      return z.object({ total: num, rows: z.array(SubscriptionRowSchema) }).parse(data);
    },
  });
}

// ---------------------------------------------------------------------------
// Plans and coupons
// ---------------------------------------------------------------------------
export const PlanSchema = z.object({
  code: z.string(), name_i18n: z.record(z.string()), price: num, price_year: num.nullable(), currency: z.string(),
  limits: z.object({ assets: num.optional(), members: num.optional(), sites: num.optional() }).passthrough(),
  features: z.array(z.string()).catch([]), sort: num, active: z.boolean(),
  stripe_price_month: nstr, stripe_price_year: nstr, paypal_plan_month: nstr, paypal_plan_year: nstr,
});
export type AdminPlan = z.infer<typeof PlanSchema>;

export function useAdminPlans() {
  return useQuery({
    queryKey: ['admin_plans_full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_plans')
        .select('code, name_i18n, price, price_year, currency, limits, features, sort, active, stripe_price_month, stripe_price_year, paypal_plan_month, paypal_plan_year')
        .order('sort');
      if (error) throw error;
      return z.array(PlanSchema).parse(data ?? []);
    },
  });
}

export const CouponSchema = z.object({
  code: z.string(), description: nstr, percent_off: num.nullable(), amount_off: num.nullable(), currency: nstr,
  duration: z.enum(['once', 'repeating', 'forever']), duration_months: num.nullable(), max_redemptions: num.nullable(),
  redemptions: num, expires_at: nstr, active: z.boolean(), created_at: z.string(),
});
export type Coupon = z.infer<typeof CouponSchema>;

export function useCoupons() {
  return useQuery({
    queryKey: ['admin_coupons'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_coupons').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return z.array(CouponSchema).parse(data ?? []);
    },
  });
}

/** Plan editor input (validated again by fp_admin_save_plan). */
const limit = z.string().trim().regex(/^\d{0,7}$/, 'limit');
export const PlanFormSchema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,32}$/, 'code'),
  name_en: z.string().trim().min(1, 'required').max(60),
  name_vi: z.string().trim().max(60),
  price: z.coerce.number().min(0, 'price'),
  price_year: z.union([z.literal(''), z.coerce.number().min(0, 'price')]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  assets: limit, members: limit, sites: limit,
  features: z.string().max(2000),
  stripe_price_month: z.string().trim().regex(/^(price_[A-Za-z0-9]+)?$/, 'stripe'),
  stripe_price_year: z.string().trim().regex(/^(price_[A-Za-z0-9]+)?$/, 'stripe'),
  paypal_plan_month: z.string().trim().regex(/^(P-[A-Z0-9]+)?$/, 'paypal'),
  paypal_plan_year: z.string().trim().regex(/^(P-[A-Z0-9]+)?$/, 'paypal'),
  active: z.boolean(),
});
export type PlanForm = z.infer<typeof PlanFormSchema>;

export function planFormToPayload(f: PlanForm) {
  return {
    code: f.code,
    name_i18n: { en: f.name_en, vi: f.name_vi || f.name_en },
    price: f.price,
    price_year: f.price_year === '' ? null : f.price_year,
    currency: f.currency,
    limits: { assets: f.assets, members: f.members, sites: f.sites },
    features: f.features.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20),
    stripe_price_month: f.stripe_price_month, stripe_price_year: f.stripe_price_year,
    paypal_plan_month: f.paypal_plan_month, paypal_plan_year: f.paypal_plan_year,
    active: f.active,
  };
}

export const CouponFormSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, 'code'),
  description: z.string().trim().max(200),
  kind: z.enum(['percent', 'amount']),
  value: z.coerce.number().positive('value'),
  currency: z.string().regex(/^[A-Z]{3}$/),
  duration: z.enum(['once', 'repeating', 'forever']),
  duration_months: z.union([z.literal(''), z.coerce.number().int().min(1).max(36)]),
  max_redemptions: z.union([z.literal(''), z.coerce.number().int().min(1)]),
  expires_at: z.string(),
  active: z.boolean(),
}).refine((f) => f.kind !== 'percent' || f.value <= 100, { path: ['value'], message: 'percent' })
  .refine((f) => f.duration !== 'repeating' || f.duration_months !== '', { path: ['duration_months'], message: 'months' });
export type CouponForm = z.infer<typeof CouponFormSchema>;

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------
export const ProviderStatusSchema = z.object({
  stripe: z.object({ configured: z.boolean(), webhook: z.boolean(), mode: nstr }),
  paypal: z.object({ configured: z.boolean(), webhook: z.boolean(), mode: nstr }),
  webhook_url: z.string(),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export function useProviderStatus() {
  return useQuery({
    queryKey: ['admin_billing_status'],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-billing', { body: { action: 'status' } });
      if (error) throw error;
      return ProviderStatusSchema.parse(data);
    },
  });
}

export function useBillingEvents() {
  return useQuery({
    queryKey: ['admin_billing_events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_billing_events')
        .select('id, provider, event_id, type, object_id, org_id, status, error, received_at, fp_organizations(name)')
        .order('received_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return z.array(z.object({
        id: num, provider: z.string(), event_id: z.string(), type: z.string(), object_id: nstr, org_id: nstr,
        status: z.string(), error: nstr, received_at: z.string(), fp_organizations: z.object({ name: z.string() }).nullable(),
      })).parse(data ?? []);
    },
  });
}

/** Calls the admin-billing function and turns its error code into an Error. */
export async function adminBilling(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-billing', { body });
  const code = (data as { error?: string } | null)?.error;
  if (code || error) {
    let detail = (data as { detail?: string } | null)?.detail;
    let c = code;
    // functions.invoke hides the body of non-2xx replies in error.context.
    const ctx = (error as { context?: Response } | null)?.context;
    if (!c && ctx && typeof ctx.json === 'function') {
      const b = await ctx.json().catch(() => null);
      c = b?.error;
      detail = b?.detail;
    }
    throw Object.assign(new Error(c ?? 'failed'), { code: c ?? 'failed', details: detail });
  }
  return data;
}
