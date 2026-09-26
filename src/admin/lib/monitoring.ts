import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';

// Monitoring (migration 0090): status, background jobs, email queue, app
// errors, webhooks.

const num = z.coerce.number();
const nnum = z.coerce.number().nullable();
const nstr = z.string().nullable();

async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return schema.parse(data);
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
export const StatusSchema = z.object({
  checked_at: z.string(),
  jobs: z.object({ total: num, healthy: num, late: z.array(z.string()) }),
  checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string() })),
  errors: z.object({ open: num, new_24h: num, events_24h: num }),
  outbox: z.object({ pending: num, sent_24h: num, failed_24h: num }),
  webhooks: z.object({ received_24h: num, failed_24h: num, last_at: nstr }),
  setup: z.object({ cron: z.boolean(), net: z.boolean(), vault: z.boolean().nullable() }),
  database: z.object({
    size_bytes: num, connections: num,
    tables: z.array(z.object({ name: z.string(), bytes: num, rows: num })).nullable(),
  }),
  hourly: z.array(z.object({ hour: z.string(), sent: num, failed: num, job_failures: num, errors: num })),
});
export type MonitoringStatus = z.infer<typeof StatusSchema>;

export function useMonitoringStatus() {
  return useQuery({
    queryKey: ['admin_monitoring'],
    refetchInterval: 60_000,
    queryFn: () => call('fp_admin_monitoring_status', {}, StatusSchema),
  });
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
export const JobSchema = z.object({
  job: z.string(), description: z.string(), max_silence_minutes: num,
  schedule: nstr, scheduled: z.boolean().nullable(), runnable: z.boolean(),
  runs_in: z.enum(['database', 'edge', 'external']),
  last_run_at: nstr, last_ok: z.boolean().nullable(), last_error: nstr, last_processed: nnum,
  last_ok_at: nstr, last_alerted_at: nstr, healthy: z.boolean(), running: z.boolean(),
  runs_24h: num, failures_24h: num, avg_ms: nnum,
});
export type Job = z.infer<typeof JobSchema>;

export function useJobs() {
  return useQuery({ queryKey: ['admin_jobs'], refetchInterval: 60_000, queryFn: () => call('fp_admin_jobs', {}, z.array(JobSchema)) });
}

export const JobRunSchema = z.object({
  id: num, started_at: z.string(), finished_at: nstr, ok: z.boolean().nullable(), processed: nnum, error: nstr, ms: nnum,
});
export type JobRun = z.infer<typeof JobRunSchema>;

export function useJobRuns(job: string | null, page: number, pageSize = 20) {
  return useQuery({
    queryKey: ['admin_job_runs', job, page],
    enabled: !!job,
    placeholderData: (prev) => prev,
    queryFn: () => call('fp_admin_job_runs', { p_job: job, p_limit: pageSize, p_offset: (page - 1) * pageSize },
      z.object({ total: num, rows: z.array(JobRunSchema) })),
  });
}

export const RunResultSchema = z.object({ started: z.boolean(), ok: z.boolean().nullable(), processed: nnum, error: nstr });

export function runJob(job: string) {
  return call('fp_admin_run_job', { p_job: job }, RunResultSchema);
}

// ---------------------------------------------------------------------------
// Email queue
// ---------------------------------------------------------------------------
export const OutboxRowSchema = z.object({
  id: z.string(), channel: z.string(), to_address: z.string(), subject: z.string(), status: z.string(),
  error: nstr, attempts: num, created_at: z.string(), sent_at: nstr, claimed_at: nstr, org_id: nstr, org_name: nstr,
});
export type OutboxRow = z.infer<typeof OutboxRowSchema>;

export interface OutboxQuery { status?: string; channel?: string; search?: string; limit: number; offset: number }

export function useOutbox(q: OutboxQuery) {
  return useQuery({
    queryKey: ['admin_outbox', q],
    placeholderData: (prev) => prev,
    queryFn: () => call('fp_admin_outbox', {
      p_status: q.status || null, p_channel: q.channel || null, p_search: q.search || null, p_limit: q.limit, p_offset: q.offset,
    }, z.object({ total: num, rows: z.array(OutboxRowSchema) })),
  });
}

export function useOutboxStats() {
  return useQuery({
    queryKey: ['admin_outbox_stats'],
    queryFn: () => call('fp_admin_outbox_stats', {}, z.object({
      by_status: z.record(num), channels: z.array(z.string()), oldest_pending: nstr,
      top_errors: z.array(z.object({ error: nstr, count: num, last_at: z.string() })),
    })),
  });
}

// ---------------------------------------------------------------------------
// App errors
// ---------------------------------------------------------------------------
export const ErrorRowSchema = z.object({
  id: num, source: z.string(), message: z.string(), location: nstr, occurrences: num,
  first_seen: z.string(), last_seen: z.string(), status: z.enum(['open', 'resolved', 'ignored']), reopened: num,
});
export type AppErrorRow = z.infer<typeof ErrorRowSchema>;

export const ErrorDetailSchema = ErrorRowSchema.extend({
  sample: z.object({
    stack: z.string().optional(), url: z.string().optional(), release: z.string().optional(),
    context: z.record(z.unknown()).optional(),
  }).passthrough(),
  last_user_id: nstr, last_org_id: nstr, last_user_email: nstr, last_org_name: nstr,
  resolved_at: nstr, resolved_by_email: nstr,
});
export type AppErrorDetail = z.infer<typeof ErrorDetailSchema>;

export interface ErrorQuery { status?: string; source?: string; search?: string; limit: number; offset: number }

export function useAppErrors(q: ErrorQuery) {
  return useQuery({
    queryKey: ['admin_app_errors', q],
    placeholderData: (prev) => prev,
    queryFn: () => call('fp_admin_app_errors', {
      p_status: q.status || null, p_source: q.source || null, p_search: q.search || null, p_limit: q.limit, p_offset: q.offset,
    }, z.object({ total: num, rows: z.array(ErrorRowSchema) })),
  });
}

export function useAppError(id: number | null) {
  return useQuery({
    queryKey: ['admin_app_error', id],
    enabled: id != null,
    queryFn: () => call('fp_admin_app_error', { p_id: id }, ErrorDetailSchema),
  });
}

export function useWorkflowFailures() {
  return useQuery({
    queryKey: ['admin_workflow_failures'],
    queryFn: () => call('fp_admin_workflow_failures', { p_limit: 50 }, z.array(z.object({
      id: z.string(), at: z.string(), error: nstr, workflow: z.string(), org_id: nstr, org_name: nstr,
    }))),
  });
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export const WebhookRowSchema = z.object({
  id: num, provider: z.string(), event_id: z.string(), type: z.string(), object_id: nstr, org_id: nstr, org_name: nstr,
  status: z.string(), error: nstr, received_at: z.string(), processed_at: nstr,
});
export type WebhookRow = z.infer<typeof WebhookRowSchema>;

export function useWebhooks(q: { provider?: string; status?: string; limit: number; offset: number }) {
  return useQuery({
    queryKey: ['admin_webhooks', q],
    placeholderData: (prev) => prev,
    queryFn: () => call('fp_admin_webhooks', {
      p_provider: q.provider || null, p_status: q.status || null, p_limit: q.limit, p_offset: q.offset,
    }, z.object({ total: num, stats: z.record(num), rows: z.array(WebhookRowSchema) })),
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** A cron expression as a translation key + values ("every 5 minutes"). Times are UTC. */
export function describeCron(expr: string | null): { key: string; values: Record<string, string | number> } {
  if (!expr) return { key: 'notScheduled', values: {} };
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { key: 'raw', values: { expr } };
  const [m, h, dom, mon, dow] = parts;
  const rest = dom === '*' && mon === '*' && dow === '*';
  const pad = (n: string) => n.padStart(2, '0');
  if (rest && h === '*' && /^\*\/\d+$/.test(m)) return { key: 'everyMinutes', values: { count: Number(m.slice(2)) } };
  if (rest && h === '*' && m === '*') return { key: 'everyMinutes', values: { count: 1 } };
  if (rest && h === '*' && /^\d+$/.test(m)) return { key: 'hourly', values: { minute: pad(m) } };
  if (rest && /^\*\/\d+$/.test(h) && /^\d+$/.test(m)) return { key: 'everyHours', values: { count: Number(h.slice(2)), minute: pad(m) } };
  if (rest && /^\d+$/.test(h) && /^\d+$/.test(m)) return { key: 'daily', values: { time: `${pad(h)}:${pad(m)}` } };
  return { key: 'raw', values: { expr } };
}

export function formatBytes(bytes: number, lng = 'en'): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${new Intl.NumberFormat(lng, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 }).format(v)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined, lng = 'en'): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${new Intl.NumberFormat(lng, { maximumFractionDigits: 1 }).format(s)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

/** A whole number of minutes as "30 min" / "2 h" / "1 h 30 min". */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Job state for its badge: failing beats late beats running beats ok. */
export function jobState(j: Pick<Job, 'healthy' | 'last_ok' | 'last_run_at' | 'running'>): 'failing' | 'late' | 'never' | 'running' | 'ok' {
  if (j.running) return 'running';
  if (!j.last_run_at) return 'never';
  if (j.last_ok === false) return 'failing';
  if (!j.healthy) return 'late';
  return 'ok';
}
