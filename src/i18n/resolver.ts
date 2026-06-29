export type I18nText = Record<string, string> | null | undefined;

/**
 * Resolve a JSONB i18n value (e.g. {"en":"Lobby","vi":"Sảnh"}) to a string for
 * the active language, falling back to the fallback language, then to any
 * available value. Never returns undefined.
 */
export function resolveI18n(value: I18nText, lng: string, fallback = 'en'): string {
  if (!value) return '';
  return value[lng] ?? value[fallback] ?? Object.values(value)[0] ?? '';
}
