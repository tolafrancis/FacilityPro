import type { Priority, RequestStatus, WorkOrderStatus } from './database.types';

export const PRIORITY_CLASS: Record<Priority, string> = {
  low: 'bg-surface text-ink-muted',
  medium: 'bg-status-info/10 text-status-info',
  high: 'bg-status-warn/15 text-status-warn',
  critical: 'bg-status-crit/10 text-status-crit',
};

export const REQUEST_STATUS_CLASS: Record<RequestStatus, string> = {
  new: 'bg-status-info/10 text-status-info',
  triaged: 'bg-status-info/10 text-status-info',
  assigned: 'bg-status-warn/15 text-status-warn',
  in_progress: 'bg-status-warn/15 text-status-warn',
  on_hold: 'bg-surface text-ink-muted',
  resolved: 'bg-status-ok/10 text-status-ok',
  closed: 'bg-status-ok/10 text-status-ok',
  rejected: 'bg-status-crit/10 text-status-crit',
};

export const WO_STATUS_CLASS: Record<WorkOrderStatus, string> = {
  assigned: 'bg-status-warn/15 text-status-warn',
  in_progress: 'bg-status-warn/15 text-status-warn',
  on_hold: 'bg-surface text-ink-muted',
  resolved: 'bg-status-ok/10 text-status-ok',
  closed: 'bg-status-ok/10 text-status-ok',
};

export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];

export const WO_STATUSES: WorkOrderStatus[] = [
  'assigned',
  'in_progress',
  'on_hold',
  'resolved',
  'closed',
];

export const REQUEST_STATUSES: RequestStatus[] = [
  'new',
  'triaged',
  'assigned',
  'in_progress',
  'on_hold',
  'resolved',
  'closed',
  'rejected',
];

export function formatDate(value: string | null, lng: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(lng === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatDateOnly(value: string | null, lng: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(lng === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

/** Whole days from now until the given date (negative if past). */
export function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

/**
 * Turn a raw Postgres/PostgREST error into something a non-technical user can
 * act on, instead of surfacing "new row violates row-level security policy
 * for table ..." or a bare constraint name. Falls back to the original
 * message for anything not recognized, so nothing is ever silently swallowed.
 */
export function friendlyError(error: { code?: string; message?: string } | null | undefined, t: (key: string) => string): string {
  const code = error?.code;
  const msg = error?.message ?? '';
  if (code === '42501' || /row-level security/i.test(msg)) return t('errors.permissionDenied');
  if (code === '23505' || /duplicate key/i.test(msg)) return t('errors.duplicate');
  if (code === '23503' || /foreign key/i.test(msg)) return t('errors.stillInUse');
  if (code === '23514' || /check constraint/i.test(msg)) return t('errors.invalidValue');
  if (!navigator.onLine) return t('errors.offline');
  return msg || t('errors.generic');
}
