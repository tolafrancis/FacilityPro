import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';

// Analytics & reports (migration 0089).

const num = z.coerce.number();

export const SERIES_METRICS = ['work_orders_created', 'work_orders_resolved', 'requests', 'active_users', 'active_tenants'] as const;
export type SeriesMetric = (typeof SERIES_METRICS)[number];

const AnalyticsSchema = z.object({
  range: z.object({ from: z.string(), to: z.string(), bucket: z.enum(['day', 'week', 'month']) }),
  totals: z.object({ work_orders_created: num, work_orders_resolved: num, requests: num, assets_added: num, active_tenants: num, active_users: num, tenants: num }),
  engagement: z.object({ dau: num, wau: num, mau: num }),
  series: z.array(z.object({ t: z.string(), work_orders_created: num, work_orders_resolved: num, requests: num, active_users: num, active_tenants: num })),
  adoption: z.array(z.object({ module: z.string(), tenants: num })),
  channels: z.array(z.object({ channel: z.string(), count: num })),
  iot: z.object({ devices: num, online: num, new: num, tenants: num }),
  cohorts: z.array(z.object({ month: z.string(), tenants: num, active: z.array(num).nullable() })),
  tenant_usage: z.array(z.object({
    id: z.string(), name: z.string(), plan: z.string().nullable(), active_users: num, work_orders: num, requests: num, assets: num, devices: num,
  })),
});
export type Analytics = z.infer<typeof AnalyticsSchema>;

export function useAnalytics(from: Date, to: Date) {
  return useQuery({
    queryKey: ['admin_analytics', from.toISOString(), to.toISOString()],
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_analytics', { p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) throw error;
      return AnalyticsSchema.parse(data);
    },
  });
}

/** What the report builder offers: dataset → breakdowns and measures (mirrors fp_report_run). */
export const REPORT_DATASETS: Record<string, { groups: string[]; measures: string[] }> = {
  tenants: { groups: ['month', 'week', 'day', 'plan', 'industry', 'status'], measures: ['count'] },
  members: { groups: ['month', 'week', 'day', 'tenant', 'plan', 'role'], measures: ['count'] },
  work_orders: { groups: ['month', 'week', 'day', 'tenant', 'plan', 'status', 'priority'], measures: ['count'] },
  requests: { groups: ['month', 'week', 'day', 'tenant', 'plan', 'status', 'priority', 'channel'], measures: ['count'] },
  invoices: { groups: ['month', 'week', 'day', 'tenant', 'plan', 'status', 'provider'], measures: ['count', 'amount'] },
  tickets: { groups: ['month', 'week', 'day', 'tenant', 'plan', 'status', 'priority', 'category'], measures: ['count'] },
  assets: { groups: ['month', 'week', 'day', 'tenant', 'plan', 'status'], measures: ['count'] },
  devices: { groups: ['month', 'week', 'day', 'tenant', 'plan'], measures: ['count'] },
};
export const TIME_GROUPS = ['month', 'week', 'day'];

export interface ReportDefinition {
  dataset: string;
  group_by: string;
  measure: string;
  from?: string;
  to?: string;
}

export const ReportResultSchema = z.object({
  dataset: z.string(), group_by: z.string(), measure: z.string(), from: z.string(), to: z.string(),
  rows: z.array(z.object({ label: z.string(), value: num })),
});
export type ReportResult = z.infer<typeof ReportResultSchema>;

export async function runReport(def: ReportDefinition) {
  const { data, error } = await supabase.rpc('fp_admin_report', { p: def });
  if (error) throw error;
  return ReportResultSchema.parse(data);
}

export const ScheduleSchema = z.object({
  id: z.string(), name: z.string(), definition: z.object({ dataset: z.string(), group_by: z.string(), measure: z.string() }),
  frequency: z.enum(['weekly', 'monthly']), recipients: z.array(z.string()), active: z.boolean(),
  next_run_at: z.string(), last_sent_at: z.string().nullable(), created_at: z.string(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export function useReportSchedules() {
  return useQuery({
    queryKey: ['admin_report_schedules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_report_schedules').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return z.array(ScheduleSchema).parse(data ?? []);
    },
  });
}

/** Share of a cohort still active in a month, 0–100 (null when there were no tenants). */
export function cohortPct(active: number, tenants: number): number | null {
  return tenants > 0 ? Math.round((100 * active) / tenants) : null;
}

/** Sequential single-hue step (0–4) for a percentage: light → dark brand. */
export function heatStep(pct: number | null): number {
  if (pct == null) return -1;
  return pct >= 80 ? 4 : pct >= 60 ? 3 : pct >= 40 ? 2 : pct >= 20 ? 1 : 0;
}
