import type { TFunction } from 'i18next';
import type { Tone } from '../components/ui';

export function formatMoney(value: number, currency = 'USD', lng = 'en', compact = false): string {
  return new Intl.NumberFormat(lng, {
    style: 'currency',
    currency,
    notation: compact && Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: compact || Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

export function formatNumber(value: number, lng = 'en', compact = false): string {
  return new Intl.NumberFormat(lng, { notation: compact && Math.abs(value) >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number, lng = 'en'): string {
  return new Intl.NumberFormat(lng, { style: 'percent', maximumFractionDigits: 1 }).format(value / 100);
}

/** "3 min ago", "yesterday", or a date for anything older than a month. */
export function timeAgo(iso: string, lng = 'en', now = Date.now()): string {
  const secs = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(secs);
  if (abs < 45) return new Intl.RelativeTimeFormat(lng, { numeric: 'auto' }).format(0, 'second');
  if (abs >= 30 * 86400) return new Date(iso).toLocaleDateString(lng, { day: 'numeric', month: 'short', year: 'numeric' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]];
  const [unit, size] = units.find(([, s]) => abs >= s) ?? ['minute', 60];
  return new Intl.RelativeTimeFormat(lng, { numeric: 'auto' }).format(Math.round(secs / size), unit);
}

/** Axis / tooltip label for a time bucket. */
export function formatBucket(iso: string, bucket: 'day' | 'week' | 'month', lng = 'en', short = false): string {
  const d = new Date(iso);
  if (bucket === 'month') return d.toLocaleDateString(lng, short ? { month: 'short' } : { month: 'long', year: 'numeric' });
  return d.toLocaleDateString(lng, short ? { day: 'numeric', month: 'short' } : { weekday: bucket === 'day' ? 'short' : undefined, day: 'numeric', month: 'short', year: 'numeric' });
}

const EVENT_TONES: Record<string, Tone> = {
  signup: 'info',
  upgrade: 'ok',
  reactivation: 'ok',
  payment_succeeded: 'ok',
  trial_started: 'brand',
  downgrade: 'warn',
  cancellation: 'crit',
  payment_failed: 'crit',
  suspended: 'crit',
  unsuspended: 'ok',
  deleted: 'neutral',
};

export function eventTone(type: string): Tone {
  return EVENT_TONES[type] ?? 'neutral';
}

export function eventLabel(type: string, t: TFunction): string {
  return t(`events.${type}`, { defaultValue: type });
}
