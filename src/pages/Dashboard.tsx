import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../contexts/OrgContext';
import { useDashboardKpis, useRecentRequests } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITY_CLASS, REQUEST_STATUS_CLASS } from '../lib/ui';
import { useFaultTypes } from '../lib/queries';
import Pill from '../components/ui/Pill';

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  // Counts come from the database (exact at any size); only the six most
  // recent requests are fetched.
  const kpis = useDashboardKpis().data;
  const recentQuery = useRecentRequests(6);
  const faultTypes = useFaultTypes();

  const faultName = (id: string | null) => {
    const ft = faultTypes.data?.find((x) => x.id === id);
    return ft ? resolveI18n(ft.name_i18n, lng) : '—';
  };

  const recent = recentQuery.data ?? [];
  const show = (n: number | undefined) => (n === undefined ? '—' : n);

  const cards = [
    { key: 'open', value: show(kpis?.open_requests) },
    { key: 'overdue', value: show(kpis?.overdue) },
    { key: 'inProgress', value: show(kpis?.in_progress) },
    { key: 'resolved', value: show(kpis?.resolved_30d) },
  ];

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-ink">{t('nav.dashboard')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{currentOrg?.name}</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.key} className="rounded-xl border border-line bg-white p-4">
            <p className="text-xs text-ink-muted">{t(`dashboard.${c.key}`)}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-ink">{t('dashboard.recentRequests')}</h2>
          <Link to="/requests" className="text-sm font-medium text-brand hover:text-brand-600">
            {t('actions.viewAll')}
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-6 text-sm text-ink-muted">
            {t('dashboard.hint')}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            {recent.map((r) => (
              <Link
                key={r.id}
                to={`/requests/${r.id}`}
                className="flex items-center justify-between border-b border-line px-4 py-3 text-sm last:border-0 hover:bg-surface"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{r.title ?? '—'}</p>
                  <p className="text-xs text-ink-muted">
                    {faultName(r.fault_type_id)} · {formatDate(r.created_at, lng)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill className={PRIORITY_CLASS[r.priority]}>{t(`priority.${r.priority}`)}</Pill>
                  <Pill className={REQUEST_STATUS_CLASS[r.status]}>{t(`requestStatus.${r.status}`)}</Pill>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
