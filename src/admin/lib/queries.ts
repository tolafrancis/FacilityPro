import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';

// Data for the admin panel. Responses are validated with Zod: a change on
// the database side shows up as a clear error instead of a broken screen.

const num = z.coerce.number();

const OverviewSchema = z.object({
  range: z.object({ from: z.string(), to: z.string(), bucket: z.enum(['day', 'week', 'month']) }),
  kpis: z.object({
    total_tenants: num,
    active_tenants: num,
    trial_tenants: num,
    new_tenants: num,
    total_users: num,
    mrr: num,
    churned: num,
    churn_rate: num,
    open_tickets: num,
    dau: num,
    mau: num,
  }),
  revenue: z.array(z.object({ t: z.string(), paid: num })),
  tenant_growth: z.array(z.object({ t: z.string(), new: num, total: num })),
  active_users: z.array(z.object({ t: z.string(), users: num })),
  by_plan: z.array(z.object({ plan: z.string(), count: num })),
  top_tenants: z.array(
    z.object({ id: z.string(), name: z.string(), plan: z.string().nullable(), work_orders: num, requests: num, active_users: num, score: num }),
  ),
  activity: z.array(
    z.object({ id: num, type: z.string(), org_id: z.string().nullable(), org_name: z.string().nullable(), detail: z.record(z.unknown()), at: z.string() }),
  ),
  health: z.object({
    jobs_total: num,
    jobs_healthy: num,
    job_failures_24h: num,
    outbox_pending: num,
    outbox_failed: num,
    checked_at: z.string(),
  }),
});
export type Overview = z.infer<typeof OverviewSchema>;

/** The main dashboard (fp_admin_overview, 0083) for a date range. */
export function useOverview(from: Date, to: Date) {
  return useQuery({
    queryKey: ['admin_overview', from.toISOString(), to.toISOString()],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_overview', { p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) throw error;
      return OverviewSchema.parse(data);
    },
  });
}

export const PlatformEventSchema = z.object({
  id: num,
  type: z.string(),
  org_id: z.string().nullable(),
  detail: z.record(z.unknown()),
  at: z.string(),
  fp_organizations: z.object({ name: z.string() }).nullable(),
});
export type PlatformEvent = z.infer<typeof PlatformEventSchema>;

/** Latest platform events, for the notifications menu. */
export function useRecentEvents(limit = 12) {
  return useQuery({
    queryKey: ['admin_events', limit],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_platform_events')
        .select('id, type, org_id, detail, at, fp_organizations(name)')
        .order('at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return z.array(PlatformEventSchema).parse(data ?? []);
    },
  });
}

/** Tenants by name, for the top bar search (staff with tenants.view). */
export function useTenantSearch(term: string, enabled: boolean) {
  const q = term.trim();
  return useQuery({
    queryKey: ['admin_tenant_search', q],
    enabled: enabled && q.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const { data, error } = await supabase
        .from('fp_organizations')
        .select('id, name, deleted_at, suspended_at')
        .ilike('name', pattern)
        .order('name')
        .limit(6);
      if (error) throw error;
      return z.array(z.object({ id: z.string(), name: z.string(), deleted_at: z.string().nullable(), suspended_at: z.string().nullable() })).parse(data ?? []);
    },
  });
}
