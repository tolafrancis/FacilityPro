import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { countWrites } from '../lib/offlineDb';
import { flushQueue, QUEUE_CHANGED } from '../lib/sync';

interface SyncContextValue {
  online: boolean;
  pending: number;
  syncing: boolean;
  sync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(async () => {
    setPending(await countWrites());
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const done = await flushQueue();
    setSyncing(false);
    await refreshPending();
    if (done > 0) void queryClient.invalidateQueries();
  }, [queryClient, refreshPending]);

  useEffect(() => {
    void refreshPending();
    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    const onQueue = () => void refreshPending();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(QUEUE_CHANGED, onQueue);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(QUEUE_CHANGED, onQueue);
    };
  }, [refreshPending, sync]);

  return (
    <SyncContext.Provider value={{ online, pending, syncing, sync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
