import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../contexts/OrgContext';
import { useRequests, useWorkOrders } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITY_CLASS, REQUEST_STATUS_CLASS } from '../lib/ui';
import { useFaultTypes } from '../lib/queries';
import Pill from '../components/ui/Pill';

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const requests = useRequests();
  const workOrders = useWorkOrders();
  const faultTypes = useFaultTypes();

  const reqs = requests.data ?? [];
  const wos = workOrders.data ?? [];
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const openCount = reqs.filter((r) => !['resolved', 'closed', 'rejected'].includes(r.status)).length;
  const overdueCount = wos.filter(
    (w) => w.due_at && new Date(w.due_at).getTime() < now && w.status !== 'closed' && w.status !== 'resolved'
  ).length;
  const inProgressCount = wos.filter((w) => w.status === 'in_progress').length;
  const resolvedCount = wos.filter(
    (w) => w.closed_at && new Date(w.closed_at).getTime() > thirtyDaysAgo
  ).length;

  const faultName = (id: string | null) => {
    const ft = faultTypes.data?.find((x) => x.id === id);
    return ft ? resolveI18n(ft.name_i18n, lng) : '—';
  };

  const recent = reqs.slice(0, 6);

  const cards = [
    { key: 'open', value: openCount },
    { key: 'overdue', value: overdueCount },
    { key: 'inProgress', value: inProgressCount },
    { key: 'resolved', value: resolvedCount },
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
