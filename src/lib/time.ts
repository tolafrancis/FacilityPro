import type { Organization } from './database.types';

/** Organisations without a configured time zone are in Vietnam. */
export const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function orgTimeZone(org: Organization | null | undefined): string {
  const tz = org?.settings?.timezone?.trim();
  if (!tz) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Milliseconds the zone is ahead of UTC at instant `ts`. */
function zoneOffsetMs(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ts));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** "2026-10-01" + "09:00" in `tz` → ISO instant (independent of the browser's zone). */
export function zonedTimeToIso(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - zoneOffsetMs(guess, tz);
  // Re-check once in case the guess and the answer straddle a DST change.
  const second = guess - zoneOffsetMs(utc, tz);
  if (second !== utc) utc = second;
  return new Date(utc).toISOString();
}

/** Calendar date ("YYYY-MM-DD") of an instant as seen in `tz`. */
export function dateInZone(value: string | number | Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

/** Wall-clock time ("HH:MM") of an instant as seen in `tz`. */
export function timeInZone(value: string | number | Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
