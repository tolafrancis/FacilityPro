import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMyWorkOrders, useAssets } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITY_CLASS, WO_STATUS_CLASS } from '../lib/ui';
import Pill from '../components/ui/Pill';

export default function MyWork() {
  const { t, i18n } = useTranslation('workorders');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { user } = useAuth();
  const workOrders = useMyWorkOrders(user?.id);
  const assets = useAssets();

  const assetName = (id: string | null) => {
    const a = assets.data?.find((x) => x.id === id);
    return a ? resolveI18n(a.name_i18n, lng) : null;
  };

  // Resolved work stays visible (it can come back for rework) until a manager
  // verifies or closes it.
  const open = (workOrders.data ?? []).filter((w) => w.status !== 'verified' && w.status !== 'closed');

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">{t('myWork.title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('myWork.subtitle')}</p>

      {open.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto text-status-ok" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('myWork.empty')}</p>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {open.map((w) => (
            <Link
              key={w.id}
              to={`/work-orders/${w.id}`}
              className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 hover:bg-surface"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-ink">
                  <Pill className={PRIORITY_CLASS[w.priority]}>{tc(`priority.${w.priority}`)}</Pill>
                  <span className="truncate">{w.title}</span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {assetName(w.asset_id) ? `${assetName(w.asset_id)} · ` : ''}
                  {t('myWork.open')} · {formatDate(w.due_at, lng)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill className={WO_STATUS_CLASS[w.status]}>{tc(`woStatus.${w.status}`)}</Pill>
                <ChevronRight size={16} className="text-ink-muted" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
