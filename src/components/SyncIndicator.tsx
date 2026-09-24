import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, CloudOff, AlertTriangle } from 'lucide-react';
import { useSync } from '../contexts/SyncContext';

export default function SyncIndicator() {
  const { t } = useTranslation('common');
  const { online, pending, failed, syncing, sync, discard, retry } = useSync();
  const [open, setOpen] = useState(false);

  if (pending === 0 && failed.length === 0 && online) return null;

  return (
    <span className="relative inline-flex items-center gap-1">
      {!online && pending === 0 && (
        <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-status-warn" title={t('sync.offline')}>
          <CloudOff size={14} aria-hidden />
        </span>
      )}
      {pending > 0 && (
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
      )}
      {failed.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-lg border border-status-crit/40 px-2 py-1 text-xs font-medium text-status-crit"
        >
          <AlertTriangle size={14} aria-hidden />
          {t('sync.failed', { count: failed.length })}
        </button>
      )}
      {open && failed.length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[90vw] rounded-xl border border-line bg-white p-3 text-left shadow-lg">
          <p className="text-sm font-medium text-ink">{t('sync.failedTitle')}</p>
          <p className="mt-1 text-xs text-ink-muted">{t('sync.failedHint')}</p>
          <ul className="mt-2 max-h-72 space-y-2 overflow-auto">
            {failed.map((w) => (
              <li key={w.id} className="rounded-lg border border-line p-2 text-xs">
                <p className="font-medium text-ink">
                  {t(`sync.op.${w.op}`)} · {w.label ?? w.table.replace('fp_', '')}
                </p>
                <p className="mt-0.5 break-words text-status-crit">{w.error}</p>
                <div className="mt-1 flex gap-3">
                  <button type="button" onClick={() => void retry(w)} className="font-medium text-brand hover:text-brand-600">
                    {t('sync.retry')}
                  </button>
                  <button type="button" onClick={() => w.id != null && void discard(w.id)} className="text-ink-muted hover:text-status-crit">
                    {t('sync.discard')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
