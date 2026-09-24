/**
 * The app's public address, for links that leave the browser (printed QR
 * codes, shared links). Set VITE_PUBLIC_APP_URL in production; otherwise the
 * current address is used, which is wrong for codes printed from a laptop on
 * localhost or a staging domain.
 */
export function publicAppUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim().replace(/\/+$/, '');
  return configured || window.location.origin;
}

export function publicAppUrlConfigured(): boolean {
  return !!(import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
}
