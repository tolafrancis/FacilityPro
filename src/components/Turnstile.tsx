import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Cloudflare Turnstile CAPTCHA. Off unless VITE_TURNSTILE_SITE_KEY is set, so
 * development and existing deployments keep working unchanged. When set, the
 * public report form sends its token to the `public-report` Edge Function
 * (verified there with Siteverify), and sign-in / sign-up pass it to Supabase
 * Auth (Authentication → Attack Protection → CAPTCHA, provider Turnstile, with
 * the widget's secret key).
 */
const SITE_KEY = (import.meta.env as Record<string, string | undefined>).VITE_TURNSTILE_SITE_KEY?.trim();
export const captchaEnabled = !!SITE_KEY;

/** Actions the server can check a token was issued for. */
export type CaptchaAction = 'public_report' | 'login' | 'signup';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        s.remove();
        reject(new Error('CAPTCHA failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Renders the widget and reports a fresh token (or null when it expires or
 * fails). Tokens are single-use and valid for 5 minutes: remount (change
 * `key`) after each submit. Expired tokens are refreshed automatically.
 */
export default function Turnstile({ onToken, action }: { onToken: (token: string | null) => void; action: CaptchaAction }) {
  const { t, i18n } = useTranslation('common');
  const ref = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const lng = i18n.resolvedLanguage === 'vi' ? 'vi' : 'en';
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!SITE_KEY) return;
    let widgetId: string | null = null;
    let cancelled = false;
    setFailed(false);
    const fail = () => {
      onTokenRef.current(null);
      setFailed(true);
    };
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          action,
          language: lng,
          theme: 'auto',
          size: 'flexible',
          'refresh-expired': 'auto',
          retry: 'auto',
          callback: (token: string) => {
            setFailed(false);
            onTokenRef.current(token);
          },
          'expired-callback': () => onTokenRef.current(null),
          'timeout-callback': () => onTokenRef.current(null),
          // Returning nothing lets Turnstile show its own message and retry.
          'error-callback': () => {
            onTokenRef.current(null);
          },
          'unsupported-callback': fail,
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [lng, action, attempt]);

  if (!SITE_KEY) return null;
  return (
    <div>
      <div ref={ref} className="min-h-[65px]" />
      {failed && (
        <p className="mt-1 text-xs text-status-crit" role="alert">
          {t('captcha.unavailable')}{' '}
          <button type="button" className="font-medium underline" onClick={() => setAttempt((n) => n + 1)}>
            {t('captcha.retry')}
          </button>
        </p>
      )}
    </div>
  );
}
