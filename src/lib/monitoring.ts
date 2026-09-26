// Error tracking (audit S7-M1). Unexpected errors always go to the admin
// panel's Monitoring → Errors (migration 0090), and to Sentry as well when
// VITE_SENTRY_DSN is set (Sentry is then loaded as its own chunk, so builds
// without it pay nothing).

type Reporter = (error: unknown, context?: Record<string, unknown>) => void;
let reporter: Reporter | null = null;

export async function initMonitoring(): Promise<void> {
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
  if (!dsn) return;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    // Errors only; no performance tracing or session replay (privacy, cost).
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  reporter = (error, context) => Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Report an error to Monitoring (and Sentry when configured); always logged to the console. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(error, context ?? '');
  reporter?.(error, context);
  void sendToDatabase(error, context);
}

// Noise that isn't ours to fix: browser extensions, benign layout warnings,
// requests cancelled by navigation, and the stale-chunk reload.
const IGNORED = /ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|AbortError|The user aborted a request|Failed to fetch dynamically imported module|Load failed$/i;
const MAX_PER_PAGE = 20;
const sent = new Map<string, number>();

export function errorPayload(error: unknown, context?: Record<string, unknown>): { message: string; stack?: string } | null {
  const e = error as { message?: unknown; stack?: unknown; code?: unknown; details?: unknown } | null | undefined;
  let message = typeof error === 'string' ? error : typeof e?.message === 'string' ? e.message : '';
  if (!message && error != null) {
    try {
      message = JSON.stringify(error).slice(0, 300);
    } catch {
      message = String(error);
    }
  }
  if (typeof e?.code === 'string' && e.code && !message.includes(e.code)) message = `[${e.code}] ${message}`;
  message = message.trim();
  if (!message || message === '{}') return null;
  const stack = typeof e?.stack === 'string' ? e.stack : typeof context?.componentStack === 'string' ? context.componentStack : undefined;
  if (IGNORED.test(message) || (stack && IGNORED.test(stack))) return null;
  return { message: message.slice(0, 500), stack: stack?.slice(0, 4000) };
}

async function sendToDatabase(error: unknown, context?: Record<string, unknown>): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const p = errorPayload(error, context);
    if (!p) return;
    // The same error at most once a minute, and a cap per page load.
    const now = Date.now();
    if ((sent.get(p.message) ?? 0) > now - 60_000) return;
    if (sent.size >= MAX_PER_PAGE) return;
    sent.set(p.message, now);
    const ctx: Record<string, string> = {};
    for (const [k, v] of Object.entries(context ?? {})) {
      if (k !== 'componentStack' && (typeof v === 'string' || typeof v === 'number')) ctx[k] = String(v).slice(0, 200);
    }
    const { supabase } = await import('./supabase');
    await supabase.rpc('fp_log_client_error', {
      p: {
        message: p.message,
        stack: p.stack,
        url: window.location.origin + window.location.pathname,
        source: window.location.pathname.startsWith('/admin') ? 'admin' : 'web',
        release: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? undefined,
        context: Object.keys(ctx).length ? ctx : undefined,
      },
    });
  } catch {
    /* reporting must never throw */
  }
}

/** Tag reports with the signed-in user's id (never their email). */
export async function setMonitoringUser(id: string | null): Promise<void> {
  if (!reporter) return;
  const Sentry = await import('@sentry/react');
  Sentry.setUser(id ? { id } : null);
}
