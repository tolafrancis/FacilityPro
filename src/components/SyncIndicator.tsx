import { useTranslation } from 'react-i18next';
import { RefreshCw, CloudOff } from 'lucide-react';
import { useSync } from '../contexts/SyncContext';

export default function SyncIndicator() {
  const { t } = useTranslation('common');
  const { online, pending, syncing, sync } = useSync();

  if (pending === 0 && online) return null;

  if (pending === 0 && !online) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-status-warn">
        <CloudOff size={14} aria-hidden />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void sync()}
      disabled={!online || syncing}
      className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-medium text-ink-muted hover:text-ink disabled:opacity-60"
      title={t('sync.pending', { count: pending })}
    >
      <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} aria-hidden />
      {syncing ? t('sync.syncing') : t('sync.pending', { count: pending })}
    </button>
  );
}
