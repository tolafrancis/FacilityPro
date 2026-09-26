import { supabase } from './supabase';

// The in-app product tour: whether it has been finished or switched off is
// remembered per user — in the account's metadata (so it follows them to
// other devices) and in this browser (so it holds even offline or before
// the metadata round-trip completes).

export const TOUR_VERSION = 1;

export interface TourState {
  version: number;
  /** Went through to the last step. */
  done?: boolean;
  /** Ticked "Don't show again". */
  dismissed?: boolean;
  at?: string;
}

const key = (userId: string) => `fp.tour.${userId}`;

function valid(v: unknown): TourState | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as TourState;
  return typeof s.version === 'number' ? s : null;
}

/** The saved state: account metadata or this browser, whichever says more. */
export function readTourState(userId: string, metadata: Record<string, unknown> | null | undefined): TourState | null {
  const fromAccount = valid(metadata?.fp_tour);
  let fromBrowser: TourState | null = null;
  try {
    fromBrowser = valid(JSON.parse(localStorage.getItem(key(userId)) ?? 'null'));
  } catch {
    /* no storage */
  }
  if (!fromAccount) return fromBrowser;
  if (!fromBrowser) return fromAccount;
  return { ...fromBrowser, ...fromAccount, done: !!(fromAccount.done || fromBrowser.done), dismissed: !!(fromAccount.dismissed || fromBrowser.dismissed) };
}

/** Start the tour by itself only for people who haven't finished or dismissed this version. */
export function shouldAutoStart(state: TourState | null): boolean {
  if (!state || state.version < TOUR_VERSION) return true;
  return !state.done && !state.dismissed;
}

export async function saveTourState(userId: string, patch: Omit<TourState, 'version' | 'at'>): Promise<TourState> {
  const state: TourState = { version: TOUR_VERSION, ...patch, at: new Date().toISOString() };
  try {
    localStorage.setItem(key(userId), JSON.stringify(state));
  } catch {
    /* no storage: the account copy still applies */
  }
  // Best effort: the browser copy already covers this device.
  await supabase.auth.updateUser({ data: { fp_tour: state } }).catch(() => undefined);
  return state;
}

/** Ask the tour to start (from the Help Center or the "? Help" panel). */
export const TOUR_START_EVENT = 'fp:tour-start';
export function startTour() {
  window.dispatchEvent(new Event(TOUR_START_EVENT));
}
