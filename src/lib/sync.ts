import { supabase } from './supabase';
import { addWrite, allWrites, deleteWrite, type QueuedWrite } from './offlineDb';

export const QUEUE_CHANGED = 'fp-queue-changed';

function announce() {
  window.dispatchEvent(new Event(QUEUE_CHANGED));
}

type WriteSpec = Omit<QueuedWrite, 'id' | 'createdAt'>;

/** A failed write, keeping the database error code for friendlyError(). */
export class WriteError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function runWrite(
  spec: WriteSpec
): Promise<{ error: { message: string; code?: string } | null; rows: number | null }> {
  if (spec.op === 'insert') {
    const { error } = await supabase.from(spec.table).insert(spec.values);
    return { error, rows: null };
  }
  // Ask for the changed rows back: an update that RLS doesn't allow (or whose
  // row is gone) returns no error and simply changes nothing.
  const { data, error } = await supabase
    .from(spec.table)
    .update(spec.values)
    .eq(spec.matchColumn as string, spec.matchValue as string)
    .select('id');
  return { error, rows: data?.length ?? 0 };
}

/**
 * Perform a write, or queue it if the device is offline. Returns whether the
 * write was queued (true) or applied immediately (false). Real (non-network)
 * errors while online are thrown so the caller can surface them — including
 * an update that changed nothing because it wasn't permitted.
 */
export async function writeOrQueue(spec: WriteSpec): Promise<{ queued: boolean }> {
  if (navigator.onLine) {
    const { error, rows } = await runWrite(spec);
    if (error) throw new WriteError(error.message, error.code);
    if (rows === 0) {
      throw new WriteError('Nothing was changed: not permitted, or the record no longer exists.', '42501');
    }
    return { queued: false };
  }
  await addWrite({ ...spec, createdAt: Date.now() });
  announce();
  return { queued: true };
}

/** Replay queued writes in order. Stops at the first failure to preserve order. */
export async function flushQueue(): Promise<number> {
  const items = await allWrites();
  let done = 0;
  for (const item of items) {
    try {
      const { error } = await runWrite(item);
      if (error) break;
      if (item.id != null) await deleteWrite(item.id);
      done++;
    } catch {
      break;
    }
  }
  if (done > 0) announce();
  return done;
}
