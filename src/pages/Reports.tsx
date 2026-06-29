import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import {
  useAuditLog,
  useContracts,
  useParts,
  usePmSchedules,
  useRequests,
  useWorkOrders,
} from '../lib/queries';
import { daysUntil, formatDate } from '../lib/ui';
import { downloadCsv } from '../lib/csv';
import Button from '../components/ui/Button';

export default function Reports() {
  const { t, i18n } = useTranslation('reports');
  const lng = i18n.resolvedLanguage ?? 'en';

  const requests = useRequests().data ?? [];
  const workOrders = useWorkOrders().data ?? [];
  const schedules = usePmSchedules().data ?? [];
  const parts = useParts().data ?? [];
  const contracts = useContracts().data ?? [];
  const audit = useAuditLog().data ?? [];

  const now = Date.now();
  const openRequests = requests.filter(
    (r) => !['resolved', 'closed', 'rejected'].includes(r.status)
  ).length;
  const openWork = workOrders.filter((w) => !['resolved', 'closed'].includes(w.status)).length;
  const overdue = workOrders.filter(
    (w) => w.due_at && new Date(w.due_at).getTime() < now && !['resolved', 'closed'].includes(w.status)
  ).length;

  const closed = workOrders.filter((w) => w.closed_at);
  const avgResolution =
    closed.length === 0
      ? null
      : Math.round(
          closed.reduce(
            (sum, w) =>
              sum + (new Date(w.closed_at as string).getTime() - new Date(w.created_at).getTime()),
            0
          ) /
            closed.length /
            3600000
        );

  const pmDue = schedules.filter(
    (s) => s.active && s.trigger_type === 'calendar' && s.next_due_at && new Date(s.next_due_at).getTime() <= now
  ).length;
  const lowStock = parts.filter((p) => p.stock_balance <= p.reorder_level).length;
  const expiringContracts = contracts.filter((c) => {
    const d = daysUntil(c.expiry_date);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  const kpis: { key: string; value: string | number }[] = [
    { key: 'openRequests', value: openRequests },
    { key: 'openWork', value: openWork },
    { key: 'overdue', value: overdue },
    { key: 'avgResolution', value: avgResolution ?? '—' },
    { key: 'pmDue', value: pmDue },
    { key: 'lowStock', value: lowStock },
    { key: 'expiringContracts', value: expiringContracts },
  ];

  const exportRequests = () =>
    downloadCsv(
      'requests.csv',
      [
        { key: 'id', label: 'id' },
        { key: 'title', label: 'title' },
        { key: 'status', label: 'status' },
        { key: 'priority', label: 'priority' },
        { key: 'source_lng', label: 'language' },
        { key: 'created_at', label: 'created_at' },
      ],
      requests
    );

  const exportWorkOrders = () =>
    downloadCsv(
      'work-orders.csv',
      [
        { key: 'id', label: 'id' },
        { key: 'title', label: 'title' },
        { key: 'status', label: 'status' },
        { key: 'priority', label: 'priority' },
        { key: 'due_at', label: 'due_at' },
        { key: 'closed_at', label: 'closed_at' },
      ],
      workOrders
    );

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.key} className="rounded-xl border border-line bg-white p-4">
            <p className="text-xs text-ink-muted">{t(`kpis.${k.key}`)}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{k.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold text-ink">{t('exports')}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportRequests}>
            <Download size={15} /> {t('exportRequests')}
          </Button>
          <Button variant="secondary" onClick={exportWorkOrders}>
            <Download size={15} /> {t('exportWorkOrders')}
          </Button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold text-ink">{t('auditLog')}</h2>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">{t('auditEmpty')}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="py-2 font-medium">{t('columns.when')}</th>
                <th className="py-2 font-medium">{t('columns.entity')}</th>
                <th className="py-2 font-medium">{t('columns.action')}</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="py-2 text-ink-muted">{formatDate(row.at, lng)}</td>
                  <td className="py-2 text-ink">{row.entity_type.replace('fp_', '')}</td>
                  <td className="py-2 text-ink-muted">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
