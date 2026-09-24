// Error tracking (audit S7-M1). Off unless VITE_SENTRY_DSN is set; Sentry is
// then loaded as its own chunk, so builds without it pay nothing.

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

/** Report an error to Sentry when configured; always logged to the console. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(error, context ?? '');
  reporter?.(error, context);
}

/** Tag reports with the signed-in user's id (never their email). */
export async function setMonitoringUser(id: string | null): Promise<void> {
  if (!reporter) return;
  const Sentry = await import('@sentry/react');
  Sentry.setUser(id ? { id } : null);
}
