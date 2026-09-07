import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import {
  useAuditLog,
  useBudgets,
  useContracts,
  useExpenditures,
  useLocations,
  useOrgMembers,
  useParts,
  usePmSchedules,
  useProcurementOrders,
  useRequests,
  useVendors,
  useWorkOrders,
} from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { daysUntil, formatDate, PRIORITIES } from '../lib/ui';
import type { Priority } from '../lib/database.types';
import { downloadCsv } from '../lib/csv';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';

function currency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function inRange(iso: string, from: string, to: string) {
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to + 'T23:59:59').getTime()) return false;
  return true;
}

export default function Reports() {
  const { t, i18n } = useTranslation('reports');
  const lng = i18n.resolvedLanguage ?? 'en';

  const requests = useRequests().data ?? [];
  const workOrders = useWorkOrders().data ?? [];
  const schedules = usePmSchedules().data ?? [];
  const parts = useParts().data ?? [];
  const contracts = useContracts().data ?? [];
  const audit = useAuditLog().data ?? [];
  const locations = useLocations().data ?? [];
  const members = useOrgMembers().data ?? [];
  const expenditures = useExpenditures().data ?? [];
  const budgets = useBudgets().data ?? [];
  const procurementOrders = useProcurementOrders().data ?? [];
  const vendors = useVendors().data ?? [];

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [locationId, setLocationId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [priority, setPriority] = useState<Priority | 'all'>('all');

  const filtersActive = !!(dateFrom || dateTo || locationId || technicianId || priority !== 'all');

  const filteredWorkOrders = useMemo(
    () =>
      workOrders.filter((w) => {
        if (dateFrom || dateTo) {
          if (!inRange(w.created_at, dateFrom, dateTo)) return false;
        }
        if (locationId && w.location_id !== locationId) return false;
        if (technicianId && w.assigned_to !== technicianId) return false;
        if (priority !== 'all' && w.priority !== priority) return false;
        return true;
      }),
    [workOrders, dateFrom, dateTo, locationId, technicianId, priority]
  );

  const filteredRequests = useMemo(
    () =>
      requests.filter((r) => {
        if (dateFrom || dateTo) {
          if (!inRange(r.created_at, dateFrom, dateTo)) return false;
        }
        if (locationId && r.location_id !== locationId) return false;
        if (priority !== 'all' && r.priority !== priority) return false;
        return true;
      }),
    [requests, dateFrom, dateTo, locationId, priority]
  );

  const filteredExpenditures = useMemo(
    () => expenditures.filter((e) => !(dateFrom || dateTo) || inRange(e.created_at, dateFrom, dateTo)),
    [expenditures, dateFrom, dateTo]
  );

  const filteredProcurement = useMemo(
    () => procurementOrders.filter((p) => !(dateFrom || dateTo) || inRange(p.created_at, dateFrom, dateTo)),
    [procurementOrders, dateFrom, dateTo]
  );

  const now = Date.now();
  const openRequests = filteredRequests.filter(
    (r) => !['resolved', 'closed', 'rejected'].includes(r.status)
  ).length;
  const openWork = filteredWorkOrders.filter((w) => !['resolved', 'closed'].includes(w.status)).length;
  const overdue = filteredWorkOrders.filter(
    (w) => w.due_at && new Date(w.due_at).getTime() < now && !['resolved', 'closed'].includes(w.status)
  ).length;

  const closed = filteredWorkOrders.filter((w) => w.closed_at);
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

  // PM compliance: of PM-generated work orders that have been closed, what
  // share closed at or before their due date. Undefined (—) until at least
  // one PM work order has been closed, rather than showing a misleading 0%.
  const pmClosed = filteredWorkOrders.filter((w) => w.pm_schedule_id && w.closed_at);
  const pmOnTime = pmClosed.filter(
    (w) => w.due_at && new Date(w.closed_at as string).getTime() <= new Date(w.due_at).getTime()
  );
  const pmCompliance = pmClosed.length === 0 ? null : Math.round((pmOnTime.length / pmClosed.length) * 100);

  // Planned vs. reactive: what share of work in scope came from a PM
  // schedule rather than a one-off request/reactive job.
  const plannedShare =
    filteredWorkOrders.length === 0
      ? null
      : Math.round((filteredWorkOrders.filter((w) => w.pm_schedule_id).length / filteredWorkOrders.length) * 100);

  const lowStock = parts.filter((p) => p.stock_balance <= p.reorder_level).length;
  const expiringContracts = contracts.filter((c) => {
    const d = daysUntil(c.expiry_date);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  // Cost: real work-order cost (labor + parts, live-rolled-up) plus manually
  // recorded expenditures. Both are already-computed figures, not guesses.
  const totalCost =
    filteredWorkOrders.reduce((sum, w) => sum + w.cost, 0) + filteredExpenditures.reduce((sum, e) => sum + e.amount, 0);
  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const budgetUsedPct = totalBudget === 0 ? null : Math.round((totalCost / totalBudget) * 100);

  // Vendor spend: expenditures + procurement, grouped by vendor, top 5.
  const vendorSpend = useMemo(() => {
    const byVendor = new Map<string, number>();
    for (const e of filteredExpenditures) {
      if (!e.vendor_id) continue;
      byVendor.set(e.vendor_id, (byVendor.get(e.vendor_id) ?? 0) + e.amount);
    }
    for (const p of filteredProcurement) {
      if (!p.vendor_id) continue;
      byVendor.set(p.vendor_id, (byVendor.get(p.vendor_id) ?? 0) + p.amount);
    }
    return Array.from(byVendor.entries())
      .map(([vendorId, amount]) => ({ name: vendors.find((v) => v.id === vendorId)?.name ?? vendorId, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [filteredExpenditures, filteredProcurement, vendors]);

  // Cost by month, trailing 6 months, independent of the filter bar above so
  // the trend line doesn't collapse to one bar when a narrow range is picked.
  const costByMonth = useMemo(() => {
    const months: { key: string; label: string; amount: number }[] = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: new Intl.DateTimeFormat(lng === 'vi' ? 'vi-VN' : 'en-US', { month: 'short' }).format(d),
        amount: 0,
      });
    }
    const bucket = (iso: string, amount: number) => {
      const d = new Date(iso);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const m = months.find((x) => x.key === key);
      if (m) m.amount += amount;
    };
    for (const w of workOrders) if (w.closed_at) bucket(w.closed_at, w.cost);
    for (const e of expenditures) bucket(e.created_at, e.amount);
    return months;
  }, [workOrders, expenditures, lng]);
  const maxMonthCost = Math.max(1, ...costByMonth.map((m) => m.amount));
  const maxVendorSpend = Math.max(1, ...vendorSpend.map((v) => v.amount));

  // MTBF (approximate): mean days between consecutive closures of reactive
  // (non-PM) work orders on the same asset, averaged across assets with at
  // least two such closures.
  const mtbfDays = useMemo(() => {
    const byAsset = new Map<string, number[]>();
    for (const w of workOrders) {
      if (!w.asset_id || w.pm_schedule_id || !w.closed_at) continue;
      const arr = byAsset.get(w.asset_id) ?? [];
      arr.push(new Date(w.closed_at).getTime());
      byAsset.set(w.asset_id, arr);
    }
    const gaps: number[] = [];
    for (const times of byAsset.values()) {
      if (times.length < 2) continue;
      times.sort((a, b) => a - b);
      for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 86400000);
    }
    return gaps.length === 0 ? null : Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }, [workOrders]);

  const kpis: { key: string; value: string | number }[] = [
    { key: 'openRequests', value: openRequests },
    { key: 'openWork', value: openWork },
    { key: 'overdue', value: overdue },
    { key: 'avgResolution', value: avgResolution ?? '—' },
    { key: 'pmDue', value: pmDue },
    { key: 'pmCompliance', value: pmCompliance !== null ? `${pmCompliance}%` : '—' },
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
      filteredRequests
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
        { key: 'cost', label: 'cost' },
      ],
      filteredWorkOrders
    );

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>

      <section className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">{t('filters.from')}</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">{t('filters.to')}</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-ink-muted">{t('filters.location')}</label>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">{t('filters.allLocations')}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{resolveI18n(l.name_i18n, lng)}</option>
            ))}
          </Select>
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-ink-muted">{t('filters.technician')}</label>
          <Select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
            <option value="">{t('filters.allTechnicians')}</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.email}</option>
            ))}
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs text-ink-muted">{t('filters.priority')}</label>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority | 'all')}>
            <option value="all">{t('filters.allPriorities')}</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setLocationId('');
              setTechnicianId('');
              setPriority('all');
            }}
            className="text-sm font-medium text-brand hover:text-brand-600"
          >
            {t('filters.clear')}
          </button>
        )}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.key} className="rounded-xl border border-line bg-white p-4">
            <p className="text-xs text-ink-muted">{t(`kpis.${k.key}`)}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{k.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="font-semibold text-ink">{t('cost.title')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-white p-4">
            <p className="text-xs text-ink-muted">{t('cost.total')}</p>
            <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{currency(totalCost)}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-4">
            <p className="text-xs text-ink-muted">{t('cost.budgetUsed')}</p>
            <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{budgetUsedPct !== null ? `${budgetUsedPct}%` : '—'}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-4">
            <p className="text-xs text-ink-muted">{t('cost.plannedShare')}</p>
            <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{plannedShare !== null ? `${plannedShare}%` : '—'}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-4">
            <p className="text-xs text-ink-muted">{t('cost.mtbf')}</p>
            <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{mtbfDays !== null ? t('cost.days', { count: mtbfDays }) : '—'}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-white p-4">
            <p className="text-sm font-medium text-ink">{t('cost.byMonth')}</p>
            <div className="mt-3 space-y-2">
              {costByMonth.map((m) => (
                <div key={m.key} className="flex items-center gap-2 text-xs">
                  <span className="w-8 shrink-0 text-ink-muted">{m.label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-surface">
                    <div className="h-full rounded bg-brand" style={{ width: `${(m.amount / maxMonthCost) * 100}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums text-ink-muted">{currency(m.amount)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-white p-4">
            <p className="text-sm font-medium text-ink">{t('cost.byVendor')}</p>
            {vendorSpend.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">{t('cost.noVendorSpend')}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {vendorSpend.map((v) => (
                  <div key={v.name} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 truncate text-ink-muted">{v.name}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-surface">
                      <div className="h-full rounded bg-brand" style={{ width: `${(v.amount / maxVendorSpend) * 100}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-right tabular-nums text-ink-muted">{currency(v.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

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
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[420px] text-sm">
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
          </div>
        )}
      </section>
    </div>
  );
}
