// Zalo Official Account helpers shared by channel-webhook and channel-send
// (migration 0076).
//
// Secrets (one Zalo app, which each organisation's OA authorises):
//   ZALO_APP_ID          the app's id
//   ZALO_APP_SECRET      the app's secret key (renews OA access tokens)
//   ZALO_OA_SECRET_KEY   the "OA Secret Key" from the app's Webhook page
//                        (signs every webhook delivery)
//
// Per-OA tokens live in fp_channel_tokens (service role only). Seed a new
// OA's refresh token there once; the access token is renewed on demand and
// the rotated refresh token is saved back each time.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_ID = Deno.env.get('ZALO_APP_ID') ?? '';
const APP_SECRET = Deno.env.get('ZALO_APP_SECRET') ?? '';
const OA_SECRET_KEY = Deno.env.get('ZALO_OA_SECRET_KEY') ?? '';

// Renew a little before the token actually expires.
const EXPIRY_MARGIN_MS = 10 * 60 * 1000;
const LEASE_MS = 30 * 1000;

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function zaloWebhookConfigured(): boolean {
  return !!(APP_ID && OA_SECRET_KEY);
}

// X-ZEvent-Signature: mac=sha256(appId + rawBody + timestamp + oaSecretKey).
export async function validZaloSignature(raw: string, timestamp: string, header: string | null): Promise<boolean> {
  if (!header || !zaloWebhookConfigured()) return false;
  const given = header.replace(/^mac=/i, '').trim().toLowerCase();
  const expected = hex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(APP_ID + raw + timestamp + OA_SECRET_KEY))
  );
  return sameString(given, expected);
}

type TokenRow = {
  access_token: string | null;
  refresh_token: string;
  expires_at: string | null;
  refreshing_until: string | null;
};

async function readToken(service: SupabaseClient, accountId: string): Promise<TokenRow | null> {
  const { data } = await service
    .from('fp_channel_tokens')
    .select('access_token, refresh_token, expires_at, refreshing_until')
    .eq('channel_account_id', accountId)
    .maybeSingle();
  return (data as TokenRow | null) ?? null;
}

function fresh(row: TokenRow): boolean {
  return !!row.access_token && !!row.expires_at && new Date(row.expires_at).getTime() - EXPIRY_MARGIN_MS > Date.now();
}

async function renew(service: SupabaseClient, accountId: string, row: TokenRow): Promise<string> {
  if (!APP_ID || !APP_SECRET) throw new Error('Zalo secrets not set');

  // Claim the lease; if another invocation holds it, wait for its result.
  const now = new Date();
  const { data: claimed } = await service
    .from('fp_channel_tokens')
    .update({ refreshing_until: new Date(now.getTime() + LEASE_MS).toISOString() })
    .eq('channel_account_id', accountId)
    .eq('refresh_token', row.refresh_token)
    .or(`refreshing_until.is.null,refreshing_until.lt.${now.toISOString()}`)
    .select('channel_account_id');
  if (!claimed?.length) {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const again = await readToken(service, accountId);
      if (again && fresh(again)) return again.access_token!;
    }
    throw new Error('Zalo token renewal in progress');
  }

  const res = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: APP_SECRET },
    body: new URLSearchParams({ refresh_token: row.refresh_token, app_id: APP_ID, grant_type: 'refresh_token' }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: string | number;
    error?: number;
    error_name?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token || !data.refresh_token) {
    const reason = `Zalo token renewal failed: ${data.error_description ?? data.error_name ?? res.status}`;
    await service
      .from('fp_channel_tokens')
      .update({ refreshing_until: null, last_error: reason.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('channel_account_id', accountId);
    throw new Error(reason);
  }

  const expiresIn = Number(data.expires_in) || 90000;
  await service
    .from('fp_channel_tokens')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      refreshing_until: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('channel_account_id', accountId);
  return data.access_token;
}

// A valid access token for the OA, renewing it when (nearly) expired or when
// `force` says Zalo rejected the current one.
export async function zaloAccessToken(service: SupabaseClient, accountId: string, force = false): Promise<string> {
  const row = await readToken(service, accountId);
  if (!row) throw new Error('Zalo OA has no token; seed fp_channel_tokens');
  if (!force && fresh(row)) return row.access_token!;
  return renew(service, accountId, row);
}

// Zalo error codes meaning the access token itself is bad.
const TOKEN_ERRORS = new Set([-216, -124]);

async function withToken<T>(
  service: SupabaseClient,
  accountId: string,
  call: (token: string) => Promise<{ error?: number; message?: string } & T>
): Promise<T> {
  let result = await call(await zaloAccessToken(service, accountId));
  if (result.error && TOKEN_ERRORS.has(result.error)) {
    result = await call(await zaloAccessToken(service, accountId, true));
  }
  if (result.error) throw new Error(`Zalo ${result.error}: ${result.message ?? 'error'}`);
  return result;
}

// Customer-service text reply to a follower. Returns Zalo's message id.
export async function sendZalo(service: SupabaseClient, accountId: string, userId: string, text: string): Promise<string | null> {
  const result = await withToken<{ data?: { message_id?: string } }>(service, accountId, async (token) => {
    const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: { access_token: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { user_id: userId }, message: { text } }),
    });
    if (!res.ok) return { error: res.status, message: await res.text() };
    return await res.json();
  });
  return result.data?.message_id ?? null;
}

// Best-effort display name for a follower; null if it can't be fetched.
export async function zaloDisplayName(service: SupabaseClient, accountId: string, userId: string): Promise<string | null> {
  try {
    const result = await withToken<{ data?: { display_name?: string } }>(service, accountId, async (token) => {
      const url = `https://openapi.zalo.me/v3.0/oa/user/detail?data=${encodeURIComponent(JSON.stringify({ user_id: userId }))}`;
      const res = await fetch(url, { headers: { access_token: token } });
      if (!res.ok) return { error: res.status };
      return await res.json();
    });
    return result.data?.display_name ?? null;
  } catch {
    return null;
  }
}
