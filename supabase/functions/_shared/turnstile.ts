// Cloudflare Turnstile server-side validation (Siteverify), shared by Edge
// Functions. Tokens are single-use, valid for 5 minutes, at most 2048 chars.

export type CaptchaResult = 'ok' | 'failed' | 'unavailable';

export interface VerifyOptions {
  secret: string;
  ip?: string | null;
  /** The widget's `action`; tokens issued for another action are refused. */
  action?: string;
  /** When set, only tokens issued on these hostnames are accepted. */
  hostnames?: string[];
  fetchImpl?: typeof fetch;
}

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * 'failed': the visitor didn't pass (bad, expired, reused or foreign token).
 * 'unavailable': Cloudflare unreachable or our secret is wrong: not the
 * visitor's fault, so callers answer "try again" rather than "failed".
 */
export async function verifyTurnstile(token: string, opts: VerifyOptions): Promise<CaptchaResult> {
  if (!token || token.length > 2048) return 'failed';
  const form = new FormData();
  form.append('secret', opts.secret);
  form.append('response', token);
  if (opts.ip) form.append('remoteip', opts.ip);
  let data: { success?: boolean; action?: string; hostname?: string; 'error-codes'?: string[] };
  try {
    const res = await (opts.fetchImpl ?? fetch)(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.error('turnstile: siteverify HTTP', res.status);
      return 'unavailable';
    }
    data = await res.json();
  } catch (e) {
    console.error('turnstile: siteverify unreachable', e instanceof Error ? e.message : e);
    return 'unavailable';
  }
  if (data.success !== true) {
    const codes = data['error-codes'] ?? [];
    if (codes.some((c) => c === 'invalid-input-secret' || c === 'missing-input-secret')) {
      console.error('turnstile: TURNSTILE_SECRET_KEY is missing or invalid', codes);
      return 'unavailable';
    }
    return 'failed';
  }
  // A token from another form (sign-in, sign-up) or another site must not
  // unlock this one. (Cloudflare's testing keys return an empty action.)
  if (opts.action && data.action && data.action !== opts.action) return 'failed';
  if (opts.hostnames?.length && !opts.hostnames.includes((data.hostname ?? '').toLowerCase())) return 'failed';
  return 'ok';
}
