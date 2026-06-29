import { supabase } from './supabase';
import { addWrite, allWrites, deleteWrite, type QueuedWrite } from './offlineDb';

export const QUEUE_CHANGED = 'fp-queue-changed';

function announce() {
  window.dispatchEvent(new Event(QUEUE_CHANGED));
}

type WriteSpec = Omit<QueuedWrite, 'id' | 'createdAt'>;

async function runWrite(spec: WriteSpec): Promise<{ error: { message: string } | null }> {
  if (spec.op === 'insert') {
    return supabase.from(spec.table).insert(spec.values);
  }
  return supabase
    .from(spec.table)
    .update(spec.values)
    .eq(spec.matchColumn as string, spec.matchValue as string);
}

/**
 * Perform a write, or queue it if the device is offline. Returns whether the
 * write was queued (true) or applied immediately (false). Real (non-network)
 * errors while online are thrown so the caller can surface them.
 */
export async function writeOrQueue(spec: WriteSpec): Promise<{ queued: boolean }> {
  if (navigator.onLine) {
    const { error } = await runWrite(spec);
    if (!error) return { queued: false };
    throw new Error(error.message);
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
