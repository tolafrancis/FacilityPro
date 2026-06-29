// Dependency-free IndexedDB queue for writes made while offline.

export interface QueuedWrite {
  id?: number;
  op: 'insert' | 'update';
  table: string;
  values: Record<string, unknown>;
  matchColumn?: string;
  matchValue?: string;
  label?: string;
  createdAt: number;
}

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

export function allWrites(): Promise<QueuedWrite[]> {
  return tx<QueuedWrite[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedWrite[]>).then((rows) =>
    rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  );
}

export function deleteWrite(id: number): Promise<void> {
  return tx<undefined>('readwrite', (s) => s.delete(id) as IDBRequest<undefined>).then(() => undefined);
}

export async function countWrites(): Promise<number> {
  const rows = await allWrites();
  return rows.length;
}
