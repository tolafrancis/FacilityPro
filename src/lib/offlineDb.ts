// Dependency-free IndexedDB queue for writes made while offline.

export interface QueuedWrite {
  id?: number;
  op: 'insert' | 'update' | 'upload';
  table: string;
  values: Record<string, unknown>;
  matchColumn?: string;
  matchValue?: string;
  /** Update only if the row still has this version (work orders, 0072). */
  expectVersion?: number;
  /** op 'upload': the photo/video, kept until it can be sent. */
  file?: Blob;
  fileName?: string;
  label?: string;
  createdAt: number;
  /** Who queued it: only that user's session replays it. */
  userId?: string;
  /** A replay the server refused; kept for the user to see and discard. */
  failed?: boolean;
  error?: string;
}

// Kept from the product's former name: renaming the IndexedDB database would
// strand offline edits that devices haven't synced yet.
const DB_NAME = 'facilityspace';
const STORE = 'outbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export function addWrite(w: QueuedWrite): Promise<number> {
  return tx<IDBValidKey>('readwrite', (s) => s.add(w)).then((k) => Number(k));
}

export function putWrite(w: QueuedWrite): Promise<void> {
  return tx<IDBValidKey>('readwrite', (s) => s.put(w)).then(() => undefined);
}

export function allWrites(): Promise<QueuedWrite[]> {
  return tx<QueuedWrite[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedWrite[]>).then((rows) =>
    rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  );
}

export function deleteWrite(id: number): Promise<void> {
  return tx<undefined>('readwrite', (s) => s.delete(id) as IDBRequest<undefined>).then(() => undefined);
}

/** This user's queued writes: waiting to send, and refused by the server. */
export async function userWrites(userId: string | null): Promise<{ pending: QueuedWrite[]; failed: QueuedWrite[] }> {
  const rows = userId ? (await allWrites()).filter((w) => w.userId === userId) : [];
  return { pending: rows.filter((w) => !w.failed), failed: rows.filter((w) => w.failed) };
}
