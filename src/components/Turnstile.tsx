import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Cloudflare Turnstile CAPTCHA. Off unless VITE_TURNSTILE_SITE_KEY is set, so
 * development and existing deployments keep working unchanged. When set, the
 * public report form sends its token to the `public-report` Edge Function,
 * and sign-in / sign-up pass it to Supabase Auth (enable CAPTCHA protection
 * with the same provider under Auth settings).
 */
const SITE_KEY = (import.meta.env as Record<string, string | undefined>).VITE_TURNSTILE_SITE_KEY;
export const captchaEnabled = !!SITE_KEY;

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
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
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('CAPTCHA failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Renders the widget and reports a fresh token (or null when it expires or
 * fails). Tokens are single-use: remount (change `key`) after each submit.
 */
export default function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const { i18n } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const lng = i18n.resolvedLanguage === 'vi' ? 'vi' : 'en';

  useEffect(() => {
    if (!SITE_KEY) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          language: lng,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [lng]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="min-h-[65px]" />;
}
