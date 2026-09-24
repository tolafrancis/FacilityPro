import { supabase } from './supabase';
import { addWrite, allWrites, deleteWrite, putWrite, type QueuedWrite } from './offlineDb';
import { uploadMedia } from './media';

export const QUEUE_CHANGED = 'fp-queue-changed';

function announce() {
  window.dispatchEvent(new Event(QUEUE_CHANGED));
}

type WriteSpec = Omit<QueuedWrite, 'id' | 'createdAt' | 'userId' | 'failed' | 'error'>;

/** A failed write, keeping the database error code for friendlyError(). */
export class WriteError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** Someone else saved a newer version of the record first. */
export const CONFLICT = 'conflict';

type Outcome =
  | { kind: 'ok' }
  | { kind: 'network' }
  | { kind: 'refused'; message: string; code?: string };

// supabase-js reports a dropped connection as an error without a Postgres
// code ("TypeError: Failed to fetch"), and navigator.onLine can be true on a
// captive or flaky network, so both count as "offline" (queue and retry).
function isNetworkError(e: { message?: string; code?: string } | null | undefined): boolean {
  if (!e) return false;
  return !e.code && /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(e.message ?? '');
}

// The signed-in user, set by SyncProvider from AuthContext. (Asking
// supabase.auth for the session can wait on a token refresh, which never
// completes while offline: exactly when the queue is needed.)
let queueUserId: string | null = null;
export function setQueueUser(id: string | null) {
  queueUserId = id;
}
function currentUserId(): string | null {
  return queueUserId;
}

async function runWrite(spec: WriteSpec): Promise<Outcome> {
  try {
    if (spec.op === 'upload') {
      const v = spec.values as { orgId: string; workOrderId?: string; requestId?: string; phase?: 'before' | 'after' };
      const file = new File([spec.file!], spec.fileName ?? 'upload', { type: spec.file!.type });
      const { error } = await uploadMedia({ ...v, file });
      if (!error) return { kind: 'ok' };
      return isNetworkError({ message: error }) ? { kind: 'network' } : { kind: 'refused', message: error };
    }
    if (spec.op === 'insert') {
      const { error } = await supabase.from(spec.table).insert(spec.values);
      if (!error) return { kind: 'ok' };
      return isNetworkError(error) ? { kind: 'network' } : { kind: 'refused', message: error.message, code: error.code };
    }
    // Ask for the changed rows back: an update that RLS doesn't allow (or whose
    // row is gone) returns no error and simply changes nothing.
    let q = supabase
      .from(spec.table)
      .update(spec.values)
      .eq(spec.matchColumn as string, spec.matchValue as string);
    if (spec.expectVersion != null) q = q.eq('version', spec.expectVersion);
    const { data, error } = await q.select('id');
    if (error) {
      return isNetworkError(error) ? { kind: 'network' } : { kind: 'refused', message: error.message, code: error.code };
    }
    if (data && data.length > 0) return { kind: 'ok' };
    if (spec.expectVersion != null) {
      // Changed nothing: still visible (so someone saved first) or gone?
      const { data: row } = await supabase
        .from(spec.table)
        .select('version')
        .eq(spec.matchColumn as string, spec.matchValue as string)
        .maybeSingle();
      if (row && (row as { version: number }).version !== spec.expectVersion) {
        return { kind: 'refused', message: 'Someone else changed this in the meantime. Reload to see their changes.', code: CONFLICT };
      }
    }
    return { kind: 'refused', message: 'Nothing was changed: not permitted, or the record no longer exists.', code: '42501' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return isNetworkError({ message }) ? { kind: 'network' } : { kind: 'refused', message };
  }
}

async function enqueue(spec: WriteSpec): Promise<{ queued: true }> {
  await addWrite({ ...spec, createdAt: Date.now(), userId: currentUserId() ?? undefined });
  announce();
  return { queued: true };
}

/**
 * Perform a write, or queue it if the device is offline (or the connection
 * drops mid-request). Returns whether it was queued. Errors from the server
 * (permission, validation, an edit conflict) are thrown for the caller to
 * show.
 */
export async function writeOrQueue(spec: WriteSpec): Promise<{ queued: boolean }> {
  if (!navigator.onLine) return enqueue(spec);
  const outcome = await runWrite(spec);
  if (outcome.kind === 'ok') return { queued: false };
  if (outcome.kind === 'network') return enqueue(spec);
  throw new WriteError(outcome.message, outcome.code);
}

/**
 * Replay the signed-in user's queued writes in order. Another user's writes
 * on a shared device are never replayed under this session. A write the
 * server refuses is moved to the failed list (shown to the user) instead of
 * blocking everything behind it; a network error stops the run to retry
 * later. Returns how many were applied.
 */
// One replay at a time: the 'online' event, sign-in and the manual button can
// all start one, and two concurrent runs would send the same item twice.
let flushing: Promise<number> | null = null;

export function flushQueue(): Promise<number> {
  if (!flushing) {
    flushing = doFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function doFlush(): Promise<number> {
  const userId = currentUserId();
  if (!userId) return 0;
  const items = (await allWrites()).filter((w) => w.userId === userId && !w.failed);
  let done = 0;
  for (const item of items) {
    const outcome = await runWrite(item);
    if (outcome.kind === 'network') break;
    if (outcome.kind === 'ok') {
      if (item.id != null) await deleteWrite(item.id);
      done++;
    } else {
      await putWrite({ ...item, failed: true, error: outcome.message });
    }
  }
  announce();
  return done;
}

/** Drop a failed (or pending) queued write. */
export async function discardWrite(id: number): Promise<void> {
  await deleteWrite(id);
  announce();
}

/** Put a failed write back in the queue to try again. */
export async function retryWrite(item: QueuedWrite): Promise<void> {
  await putWrite({ ...item, failed: false, error: undefined });
  announce();
}
