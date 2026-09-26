import type { ReactNode } from 'react';
import type { Tone } from '../../components/ui';

export function invoiceStatusTone(s: string): Tone {
  return s === 'paid' ? 'ok' : s === 'failed' ? 'crit' : s === 'open' ? 'info' : s === 'refunded' ? 'warn' : 'neutral';
}
export function subStatusTone(s: string): Tone {
  return s === 'active' ? 'ok' : s === 'trialing' ? 'info' : s === 'past_due' ? 'warn' : s === 'canceled' ? 'neutral' : 'neutral';
}

export const control =
  'h-9 rounded-md border border-line bg-panel px-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

/** Label + control + error, for the billing dialogs. */
export function Field({ id, label, hint, error, children, className = '' }: { id: string; label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-status-crit">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
