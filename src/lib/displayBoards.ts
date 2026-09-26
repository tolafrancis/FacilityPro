import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './supabase';

// TV display boards (migration 0092): the settings list and the public screen.

export const BOARD_STATUSES = ['open', 'assigned', 'in_progress', 'on_hold', 'resolved', 'verified', 'closed'] as const;
export const BOARD_FIELDS = ['priority', 'due', 'location', 'assignee', 'asset', 'created'] as const;
export const BOARD_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];
export type BoardField = (typeof BOARD_FIELDS)[number];

export interface DisplayBoard {
  id: string;
  org_id: string;
  name: string;
  token: string;
  site_id: string | null;
  statuses: BoardStatus[];
  fields: BoardField[];
  priorities: string[] | null;
  layout: 'columns' | 'list';
  theme: 'dark' | 'light';
  lng: 'en' | 'vi';
  done_hours: number;
  active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export function displayUrl(token: string): string {
  return `${window.location.origin}/display/${token}`;
}

/** A screen that asked for the board in the last 3 minutes counts as showing it. */
export function isOnline(lastSeen: string | null, now = Date.now()): boolean {
  return !!lastSeen && now - new Date(lastSeen).getTime() < 3 * 60_000;
}

export function useDisplayBoards(orgId: string | undefined) {
  return useQuery({
    queryKey: ['display_boards', orgId],
    enabled: !!orgId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_display_boards')
        .select('id, org_id, name, token, site_id, statuses, fields, priorities, layout, theme, lng, done_hours, active, last_seen_at, created_at')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DisplayBoard[];
    },
  });
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------
const i18nName = z.record(z.string()).nullable().optional();

export const ScreenWorkOrderSchema = z.object({
  ref: z.string(),
  title: z.string().nullable(),
  status: z.enum(BOARD_STATUSES),
  priority: z.string(),
  due_at: z.string().nullable(),
  overdue: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  done_at: z.string().nullable(),
  location: i18nName,
  asset: i18nName,
  assignee: z.string().nullable().optional(),
});
export type ScreenWorkOrder = z.infer<typeof ScreenWorkOrderSchema>;

export const ScreenSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    now: z.string(),
    board: z.object({
      name: z.string(), layout: z.enum(['columns', 'list']), theme: z.enum(['dark', 'light']), lng: z.enum(['en', 'vi']),
      fields: z.array(z.enum(BOARD_FIELDS)), statuses: z.array(z.enum(BOARD_STATUSES)), done_hours: z.number(),
      site: i18nName,
    }),
    org: z.object({ name: z.string(), logo_path: z.string().nullable() }),
    work_orders: z.array(ScreenWorkOrderSchema),
  }),
  z.object({ ok: z.literal(false), reason: z.enum(['not_found', 'off']), lng: z.enum(['en', 'vi']).optional(), theme: z.enum(['dark', 'light']).optional() }),
]);
export type Screen = z.infer<typeof ScreenSchema>;

/** Polls the board every 20 seconds; keeps showing the last data while offline. */
export function useScreen(token: string | undefined) {
  return useQuery({
    queryKey: ['display_screen', token],
    enabled: !!token,
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
    retry: true,
    retryDelay: (n) => Math.min(30_000, 2_000 * 2 ** n),
    meta: { errorHandled: true },
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_display_board', { p_token: token });
      if (error) throw error;
      return ScreenSchema.parse(data);
    },
  });
}

export type ColumnKey = 'new' | 'in_progress' | 'on_hold' | 'done';
export const COLUMN_STATUSES: Record<ColumnKey, BoardStatus[]> = {
  new: ['open', 'assigned'],
  in_progress: ['in_progress'],
  on_hold: ['on_hold'],
  done: ['resolved', 'verified', 'closed'],
};

/** The status columns a board shows (only those it includes), with their work orders. */
export function boardColumns(statuses: BoardStatus[], orders: ScreenWorkOrder[]): { key: ColumnKey; orders: ScreenWorkOrder[] }[] {
  return (Object.keys(COLUMN_STATUSES) as ColumnKey[])
    .filter((k) => COLUMN_STATUSES[k].some((s) => statuses.includes(s)))
    .map((k) => ({
      key: k,
      orders: orders
        .filter((o) => COLUMN_STATUSES[k].includes(o.status))
        // Finished: most recently finished first (like an "order ready" board).
        .sort((a, b) => (k === 'done' ? (b.done_at ?? '').localeCompare(a.done_at ?? '') : 0)),
    }));
}

/** Refs whose status changed (or that are new) since the previous poll. */
export function changedRefs(prev: ScreenWorkOrder[] | undefined, next: ScreenWorkOrder[]): Set<string> {
  if (!prev) return new Set();
  const before = new Map(prev.map((o) => [o.ref, o.status]));
  return new Set(next.filter((o) => before.get(o.ref) !== o.status).map((o) => o.ref));
}

/** Split into pages of `size` (at least one page). */
export function pages<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out.length ? out : [[]];
}
