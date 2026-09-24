import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMoney } from '../lib/useMoney';
import { useOrg } from '../contexts/OrgContext';
import { useAuditLog, useLocations, useOrgMembers, useReportKpis, useVendors } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITIES } from '../lib/ui';
import type { Priority } from '../lib/database.types';
import { downloadCsv } from '../lib/csv';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';


// Exports page through every matching row (PostgREST returns at most 1,000
// per request), so a CSV is never silently cut short.
async function fetchAll<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export default function Reports() {
  const currency = useMoney({ whole: true });
  const { t, i18n } = useTranslation('reports');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const audit = useAuditLog().data ?? [];
  const locations = useLocations().data ?? [];
  const members = useOrgMembers().data ?? [];
  const vendors = useVendors().data ?? [];

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [locationId, setLocationId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [priority, setPriority] = useState<Priority | 'all'>('all');
  const [exporting, setExporting] = useState<string | null>(null);

  const filtersActive = !!(dateFrom || dateTo || locationId || technicianId || priority !== 'all');

  // Every figure is computed in the database (fp_report_kpis), so it stays
  // exact however much history the organisation has.
  const report = useReportKpis({
    from: dateFrom,
    to: dateTo,
    locationId,
    technicianId,
    priority: priority === 'all' ? undefined : priority,
  });
  const r = report.data;
  const dash = (v: number | null | undefined, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);

  const totalCost = r?.total_cost ?? 0;
  const budgetUsedPct = !r || r.total_budget === 0 ? null : Math.round((r.total_cost / r.total_budget) * 100);
  const plannedShare = r?.planned_share ?? null;
  const mtbfDays = r?.mtbf_days ?? null;

  const vendorSpend = useMemo(
    () => (r?.vendor_spend ?? []).map((v) => ({ name: vendors.find((x) => x.id === v.vendor_id)?.name ?? v.vendor_id, amount: v.amount })),
    [r, vendors]
  );
  const costByMonth = useMemo(
    () =>
      (r?.cost_by_month ?? []).map((m) => {
        const [y, mo] = m.month.split('-').map(Number);
        return {
          key: m.month,
          label: new Intl.DateTimeFormat(lng === 'vi' ? 'vi-VN' : 'en-US', { month: 'short' }).format(new Date(y, mo - 1, 1)),
          amount: Number(m.amount),
        };
      }),
    [r, lng]
  );
  const maxMonthCost = Math.max(1, ...costByMonth.map((m) => m.amount));
  const maxVendorSpend = Math.max(1, ...vendorSpend.map((v) => v.amount));

  const kpis: { key: string; value: string | number }[] = [
    { key: 'openRequests', value: dash(r?.open_requests) },
    { key: 'openWork', value: dash(r?.open_work) },
    { key: 'overdue', value: dash(r?.overdue) },
    { key: 'avgResolution', value: dash(r?.avg_resolution_hours) },
    { key: 'pmDue', value: dash(r?.pm_due) },
    { key: 'pmCompliance', value: dash(r?.pm_compliance, '%') },
    { key: 'lowStock', value: dash(r?.low_stock) },
    { key: 'expiringContracts', value: dash(r?.expiring_contracts) },
  ];

  // Same filters as the figures; date bounds are whole local days.
  const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString();
  const dayEnd = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

  const exportRequests = async () => {
    setExporting('requests');
    try {
      const rows = await fetchAll(() => {
        let q = supabase
          .from('fp_requests')
          .select('id, title, status, priority, source_lng, created_at')
          .eq('org_id', orgId!)
          .order('created_at', { ascending: false });
        if (dateFrom) q = q.gte('created_at', dayStart(dateFrom));
        if (dateTo) q = q.lte('created_at', dayEnd(dateTo));
        if (locationId) q = q.eq('location_id', locationId);
        if (priority !== 'all') q = q.eq('priority', priority);
        return q;
      });
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
        rows as Record<string, unknown>[]
      );
    } finally {
      setExporting(null);
    }
  };

  const exportWorkOrders = async () => {
    setExporting('work_orders');
    try {
      const rows = await fetchAll(() => {
        let q = supabase
          .from('fp_work_orders')
          .select('id, title, status, priority, due_at, started_at, resolved_at, verified_at, closed_at, cost')
          .eq('org_id', orgId!)
          .order('created_at', { ascending: false });
        if (dateFrom) q = q.gte('created_at', dayStart(dateFrom));
        if (dateTo) q = q.lte('created_at', dayEnd(dateTo));
        if (locationId) q = q.eq('location_id', locationId);
        if (technicianId) q = q.eq('assigned_to', technicianId);
        if (priority !== 'all') q = q.eq('priority', priority);
        return q;
      });
      downloadCsv(
        'work-orders.csv',
        [
          { key: 'id', label: 'id' },
          { key: 'title', label: 'title' },
          { key: 'status', label: 'status' },
          { key: 'priority', label: 'priority' },
          { key: 'due_at', label: 'due_at' },
          { key: 'started_at', label: 'started_at' },
          { key: 'resolved_at', label: 'resolved_at' },
          { key: 'verified_at', label: 'verified_at' },
          { key: 'closed_at', label: 'closed_at' },
          { key: 'cost', label: 'cost' },
        ],
        rows as Record<string, unknown>[]
      );
    } finally {
      setExporting(null);
    }
  };

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
          <Button variant="secondary" onClick={() => void exportRequests()} loading={exporting === 'requests'}>
            <Download size={15} /> {t('exportRequests')}
          </Button>
          <Button variant="secondary" onClick={() => void exportWorkOrders()} loading={exporting === 'work_orders'}>
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
