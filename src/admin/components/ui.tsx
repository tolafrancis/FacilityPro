import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RotateCcw } from 'lucide-react';

// Small building blocks shared by the admin pages. Colours come from the
// theme tokens (index.css), so light and dark both work.

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className = '' }: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-panel p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink/10 ${className}`} aria-hidden />;
}

export function EmptyState({ title, body, icon: Icon = Inbox, action }: { title: string; body?: string; icon?: typeof Inbox; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <Icon size={22} className="text-ink-muted" aria-hidden />
      <p className="mt-2 text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-xs text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-lg border border-status-crit/30 bg-status-crit/5 px-6 py-8 text-center">
      <AlertTriangle size={22} className="text-status-crit" aria-hidden />
      <p className="mt-2 max-w-md text-sm text-ink">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface">
          <RotateCcw size={14} aria-hidden /> {retryLabel ?? 'Retry'}
        </button>
      )}
    </div>
  );
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'crit' | 'info' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink/5 text-ink-muted ring-ink/10',
  ok: 'bg-status-ok/10 text-status-ok ring-status-ok/20',
  warn: 'bg-status-warn/10 text-amber-600 ring-status-warn/25 dark:text-amber-400',
  crit: 'bg-status-crit/10 text-status-crit ring-status-crit/20 dark:text-red-400',
  info: 'bg-status-info/10 text-status-info ring-status-info/20 dark:text-blue-400',
  brand: 'bg-brand/10 text-brand-600 ring-brand/20 dark:text-brand',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}
