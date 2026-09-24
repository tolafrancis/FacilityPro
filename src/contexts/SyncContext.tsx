import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { userWrites, type QueuedWrite } from '../lib/offlineDb';
import { discardWrite, flushQueue, QUEUE_CHANGED, retryWrite, setQueueUser } from '../lib/sync';
import { useAuth } from './AuthContext';

interface SyncContextValue {
  online: boolean;
  /** This user's changes waiting to be sent. */
  pending: number;
  /** This user's queued changes the server refused (kept until discarded). */
  failed: QueuedWrite[];
  syncing: boolean;
  sync: () => Promise<void>;
  discard: (id: number) => Promise<void>;
  retry: (item: QueuedWrite) => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  setQueueUser(userId);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<QueuedWrite[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const mine = await userWrites(userId).catch(() => ({ pending: [], failed: [] }));
    setPending(mine.pending.length);
    setFailed(mine.failed);
  }, [userId]);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const done = await flushQueue();
      if (done > 0) void queryClient.invalidateQueries();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [queryClient, refresh]);

  const discard = useCallback(async (id: number) => {
    await discardWrite(id);
  }, []);

  const retry = useCallback(
    async (item: QueuedWrite) => {
      await retryWrite(item);
      await sync();
    },
    [sync]
  );

  useEffect(() => {
    // On sign-in (or switching user) show and send that user's queue only.
    void refresh();
    if (userId && navigator.onLine) void sync();
  }, [userId, refresh, sync]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    const onQueue = () => void refresh();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(QUEUE_CHANGED, onQueue);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(QUEUE_CHANGED, onQueue);
    };
  }, [refresh, sync]);

  return (
    <SyncContext.Provider value={{ online, pending, failed, syncing, sync, discard, retry }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
