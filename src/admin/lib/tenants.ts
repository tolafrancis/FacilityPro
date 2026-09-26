import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { notify } from '../../components/Toaster';
import i18n from '../../i18n';

// Tenant management data (functions in migration 0084). Responses and form
// input are validated with Zod; the database validates again.

const num = z.coerce.number();
const nstr = z.string().nullable();

export const TENANT_STATUSES = ['active', 'trial', 'past_due', 'suspended', 'cancelled', 'deleted'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TenantRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  logo_path: nstr,
  subdomain: nstr,
  contact_email: nstr,
  created_at: z.string(),
  last_active_at: nstr,
  plan_code: nstr,
  billing_interval: nstr,
  trial_ends_at: nstr,
  status: z.enum(TENANT_STATUSES),
  users: num,
  sites: num,
  locations: num,
  mrr: num,
});
export type TenantRow = z.infer<typeof TenantRowSchema>;

export interface TenantQuery {
  search?: string;
  status?: TenantStatus | '';
  plan?: string;
  sort: string;
  desc: boolean;
  limit: number;
  offset: number;
  ids?: string[];
}

export async function fetchTenants(q: TenantQuery) {
  const { data, error } = await supabase.rpc('fp_admin_tenants', {
    p_search: q.search || null,
    p_status: q.status || null,
    p_plan: q.plan || null,
    p_sort: q.sort,
    p_desc: q.desc,
    p_limit: q.limit,
    p_offset: q.offset,
    p_ids: q.ids ?? null,
  });
  if (error) throw error;
  return z.object({ total: num, rows: z.array(TenantRowSchema) }).parse(data);
}

export function useTenants(q: TenantQuery) {
  return useQuery({
    queryKey: ['admin_tenants', q],
    placeholderData: (prev) => prev,
    queryFn: () => fetchTenants(q),
  });
}

const TenantDetailSchema = z.object({
  org: z.object({
    id: z.string(),
    name: z.string(),
    industry: nstr.optional(),
    default_lng: z.string(),
    logo_path: nstr,
    created_at: z.string(),
    suspended_at: nstr,
    suspended_reason: nstr,
    deleted_at: nstr,
    contact_name: nstr,
    contact_email: nstr,
    contact_phone: nstr,
    address: nstr,
    currency: z.string(),
    subdomain: nstr,
    brand_color: nstr,
    last_active_at: nstr,
    timezone: nstr.optional(),
    allow_public_requests: z.boolean().optional(),
  }).passthrough(),
  status: z.enum(TENANT_STATUSES),
  subscription: z.object({
    plan_code: nstr,
    status: z.string(),
    billing_interval: z.string().optional(),
    provider: nstr.optional(),
    current_period_end: nstr.optional(),
    trial_ends_at: nstr.optional(),
    requested_plan_code: nstr.optional(),
    cancel_requested_at: nstr.optional(),
  }).passthrough().nullable(),
  mrr: num,
  usage: z.object({
    members: num, active_users_30d: num, assets: num, sites: num, locations: num, devices: num,
    requests_30d: num, work_orders_30d: num, open_work_orders: num, overdue_work_orders: num, storage_bytes: num,
  }),
  limits: z.object({ members: num.nullable(), assets: num.nullable(), sites: num.nullable() }),
  health: z.object({ score: num, activity: num, adoption: num, billing: num, usage: num }),
  notes_count: num,
});
export type TenantDetail = z.infer<typeof TenantDetailSchema>;

export function useTenant(id: string | undefined) {
  return useQuery({
    queryKey: ['admin_tenant', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_tenant', { p_org: id });
      if (error) throw error;
      return TenantDetailSchema.parse(data);
    },
  });
}

export const TenantUserSchema = z.object({
  user_id: z.string(), email: z.string(), full_name: nstr, role: z.string(), joined_at: z.string(),
  last_sign_in_at: nstr, active_days_30: num, banned: z.boolean(), confirmed: z.boolean(),
});
export type TenantUser = z.infer<typeof TenantUserSchema>;

export function useTenantUsers(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['admin_tenant_users', id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_tenant_users', { p_org: id });
      if (error) throw error;
      return z.array(TenantUserSchema).parse(data ?? []);
    },
  });
}

export function useTenantInvites(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['admin_tenant_invites', id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_tenant_invites', { p_org: id });
      if (error) throw error;
      return z.array(z.object({ id: z.string(), email: z.string(), role: z.string(), created_at: z.string(), expires_at: z.string() })).parse(data ?? []);
    },
  });
}

const I18n = z.record(z.string()).nullable();
export function useTenantFacilities(id: string | undefined) {
  return useQuery({
    queryKey: ['admin_tenant_facilities', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_tenant_facilities', { p_org: id });
      if (error) throw error;
      return z.object({
        sites: z.array(z.object({ id: z.string(), name: I18n, address: nstr, locations: num, assets: num })),
        buildings: z.array(z.object({ id: z.string(), name: I18n, kind: z.string(), site_id: nstr, children: num, assets: num })),
        facilities: num,
        desks: num,
      }).parse(data);
    },
  });
}

export function useTenantActivity(id: string | undefined) {
  return useQuery({
    queryKey: ['admin_tenant_activity', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_tenant_activity', { p_org: id, p_limit: 200 });
      if (error) throw error;
      return z.array(z.object({ kind: z.enum(['event', 'admin']), action: z.string(), actor_email: nstr, detail: z.record(z.unknown()).nullable(), at: z.string() })).parse(data ?? []);
    },
  });
}

export function useTenantFlags(id: string | undefined) {
  return useQuery({
    queryKey: ['admin_tenant_flags', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_tenant_flags', { p_org: id });
      if (error) throw error;
      return z.array(z.object({
        key: z.string(), kind: z.enum(['feature', 'module']), description: nstr, global_enabled: z.boolean(),
        rollout_pct: num, override: z.boolean().nullable(), effective: z.boolean(),
      })).parse(data ?? []);
    },
  });
}

export function useTenantNotes(id: string | undefined) {
  return useQuery({
    queryKey: ['admin_tenant_notes', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_admin_notes')
        .select('id, body, created_at, author_id')
        .eq('org_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return z.array(z.object({ id: z.string(), body: z.string(), created_at: z.string(), author_id: nstr })).parse(data ?? []);
    },
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ['admin_plans'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_plans').select('code, name_i18n, price, price_year, currency, active').order('sort');
      if (error) throw error;
      return z.array(z.object({ code: z.string(), name_i18n: z.record(z.string()), price: num, price_year: num.nullable(), currency: z.string(), active: z.boolean() })).parse(data ?? []);
    },
  });
}

/**
 * Runs an admin function, shows a toast, and refreshes every tenant view.
 * Errors show the database's reason (e.g. "Type the tenant's exact name").
 */
export function useAdminAction<V>(fn: (v: V) => Promise<unknown>, success: string | ((v: V) => string)) {
  const qc = useQueryClient();
  return useMutation({
    meta: { errorHandled: true },
    mutationFn: async (v: V) => fn(v),
    onSuccess: (_d, v) => {
      notify(typeof success === 'function' ? success(v) : success, 'success');
      for (const k of ['admin_tenants', 'admin_tenant', 'admin_tenant_users', 'admin_tenant_invites', 'admin_tenant_activity',
        'admin_tenant_flags', 'admin_tenant_notes', 'admin_overview', 'admin_events', 'admin_users', 'admin_user',
        'admin_invoices', 'admin_invoice', 'admin_billing_overview', 'admin_subscriptions', 'admin_plans_full', 'admin_plans',
        'admin_coupons', 'admin_billing_events', 'admin_tickets', 'admin_ticket', 'admin_ticket_stats', 'admin_ticket_macros',
        'admin_flags', 'admin_announcements', 'admin_platform_settings', 'admin_templates', 'app_status',
        'admin_monitoring', 'admin_outbox', 'admin_outbox_stats', 'admin_app_errors', 'admin_app_error', 'admin_jobs', 'admin_job_runs', 'admin_team', 'admin_security']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (e) => notify(adminErrorMessage(e), 'error'),
  });
}

export function adminErrorMessage(e: unknown): string {
  const err = e as { message?: string; details?: string; hint?: string; code?: string };
  const t = (k: string) => i18n.t(`admin:errors2.${k}`);
  if (err?.code === '42501') return t('permission');
  if (err?.message?.includes('fp_organizations_subdomain_uk')) return t('subdomainTaken');
  if (err?.message?.includes('plan_limit_reached')) return t('planFull');
  if (err?.message?.includes('last') && err?.message?.includes('admin')) return t('lastAdmin');
  if (err?.details) return err.details;
  // Error codes from the billing functions ("provider_not_configured", …).
  if (err?.message && /^[a-z_]+$/.test(err.message) && i18n.exists(`admin:errors2.${err.message}`)) return t(err.message);
  return err?.message || t('generic');
}

/** Calls a database function and throws its error. */
export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

// ---------------------------------------------------------------------------
// Tenant form (create / edit)
// ---------------------------------------------------------------------------
export const CURRENCIES = ['VND', 'USD', 'EUR', 'SGD', 'THB', 'MYR', 'IDR', 'PHP', 'JPY', 'KRW', 'CNY', 'AUD', 'GBP'] as const;
export const INDUSTRIES = [
  'manufacturing', 'oil_gas', 'health_care', 'property_management', 'facility_management',
  'hospitality', 'religious', 'government', 'fleet_management', 'other',
] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const TenantFormSchema = z.object({
  name: z.string().trim().min(1, 'required').max(120),
  industry: z.enum(INDUSTRIES).or(z.literal('')).optional(),
  default_lng: z.enum(['en', 'vi']),
  contact_name: optionalText(120),
  contact_email: z.string().trim().email('email').optional().or(z.literal('')),
  contact_phone: z.string().trim().regex(/^\+?[\d\s().-]{7,20}$/, 'phone').optional().or(z.literal('')),
  address: optionalText(500),
  timezone: z.string().optional().or(z.literal('')),
  currency: z.enum(CURRENCIES),
  subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/, 'subdomain').optional().or(z.literal('')),
  brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'color').optional().or(z.literal('')),
  // Create only
  plan_code: z.string().optional(),
  billing_interval: z.enum(['month', 'year']).optional(),
  trial_days: z.coerce.number().int().min(0).max(90).optional(),
  owner_email: z.string().trim().email('email').optional().or(z.literal('')),
});
export type TenantForm = z.infer<typeof TenantFormSchema>;
