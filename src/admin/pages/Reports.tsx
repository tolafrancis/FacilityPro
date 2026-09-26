import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Download, Mail, Play, Printer, Send, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DateRangePicker, { useDateRange } from '../components/DateRangePicker';
import { BarList, TimeSeriesChart } from '../components/charts';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { notify } from '../../components/Toaster';
import { formatBucket, formatMoney, formatNumber, formatPercent, timeAgo } from '../lib/format';
import { downloadCsv, toCsv } from '../lib/csv';
import { adminErrorMessage, rpc, useAdminAction } from '../lib/tenants';
import {
  REPORT_DATASETS, SERIES_METRICS, cohortPct, heatStep, runReport, useAnalytics, useReportSchedules,
  type Analytics, type ReportDefinition, type SeriesMetric,
} from '../lib/analytics';
import { ChartCard } from './Overview';
import { Field, control } from './billing/shared';

const TABS = ['overview', 'builder', 'schedules'] as const;
type Tab = (typeof TABS)[number];

export default function Reports() {
  const { t } = useTranslation('admin');
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'overview';
  const [range, setRange] = useDateRange('30d');
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={t('nav.items.reports')} description={t('reports.subtitle')}
        actions={tab !== 'schedules' ? <DateRangePicker range={range} onChange={setRange} /> : undefined} />
      <div role="tablist" aria-label={t('reports.tabsLabel')} className="mb-5 flex gap-1 overflow-x-auto border-b border-line print:hidden">
        {TABS.map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} onClick={() => { const n = new URLSearchParams(params); if (x === 'overview') n.delete('tab'); else n.set('tab', x); setParams(n, { replace: true }); }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === x ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}>
            {t(`reports.tabs.${x}`)}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab from={range.from} to={range.to} />}
      {tab === 'builder' && <Builder from={range.from} to={range.to} />}
      {tab === 'schedules' && <Schedules />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function OverviewTab({ from, to }: { from: Date; to: Date }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const q = useAnalytics(from, to);
  const d = q.data;
  const [metric, setMetric] = useState<SeriesMetric>('work_orders_created');
  if (q.isError) return <ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} />;
  const n = (v: number) => formatNumber(v, lng);
  const tiles: { key: string; value?: string; sub?: string }[] = [
    { key: 'activeTenants', value: d && n(d.totals.active_tenants), sub: d && t('reports.ofTenants', { total: n(d.totals.tenants) }) },
    { key: 'activeUsers', value: d && n(d.totals.active_users), sub: d && t('kpi.dauMau', { dau: n(d.engagement.dau), mau: n(d.engagement.mau) }) },
    { key: 'stickiness', value: d && (d.engagement.mau ? formatPercent(Math.round((100 * d.engagement.dau) / d.engagement.mau), lng) : '—'), sub: t('reports.stickinessHint') },
    { key: 'wau', value: d && n(d.engagement.wau), sub: t('reports.wauHint') },
    { key: 'workOrders', value: d && n(d.totals.work_orders_created), sub: d && t('reports.resolved', { count: d.totals.work_orders_resolved }) },
    { key: 'requests', value: d && n(d.totals.requests), sub: t('kpi.inRange') },
    { key: 'assets', value: d && n(d.totals.assets_added), sub: t('kpi.inRange') },
    { key: 'iot', value: d && t('reports.devicesOnline', { online: n(d.iot.online), total: n(d.iot.devices) }), sub: d && t('reports.iotTenants', { count: d.iot.tenants }) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((c) => (
          <div key={c.key} className="rounded-xl border border-line bg-panel p-4">
            <p className="text-xs font-medium text-ink-muted">{t(`reports.kpi.${c.key}`)}</p>
            {c.value === undefined ? <Skeleton className="mt-2 h-7 w-20" /> : <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-ink">{c.value}</p>}
            {c.sub && <p className="mt-1 truncate text-xs text-ink-muted">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard
            title={t(`reports.metric.${metric}`)}
            description={t('reports.activityHint')}
            loading={!d}
            empty={!!d && d.series.every((p) => p[metric] === 0)}
            emptyText={t('reports.noActivity')}
            render={(table) => d && (
              <>
                <label className="mb-3 flex items-center gap-2 text-sm text-ink-muted print:hidden">
                  {t('reports.show')}
                  <select value={metric} onChange={(e) => setMetric(e.target.value as SeriesMetric)} className={control}>
                    {SERIES_METRICS.map((m) => <option key={m} value={m}>{t(`reports.metric.${m}`)}</option>)}
                  </select>
                </label>
                <TimeSeriesChart
                  kind="bar"
                  points={d.series.map((p) => ({ t: p.t, v: p[metric] }))}
                  label={t(`reports.metric.${metric}`)}
                  formatValue={(v) => formatNumber(v, lng, true)}
                  formatTime={(iso, short) => formatBucket(iso, d.range.bucket, lng, short)}
                  showTable={table}
                  valueHeader={t(`reports.metric.${metric}`)}
                  timeHeader={t('overview.period')}
                />
              </>
            )}
          />
        </div>
        <ChartCard
          title={t('reports.adoption')}
          description={t('reports.adoptionHint')}
          loading={!d}
          render={(table) => d && (
            <BarList
              rows={[...d.adoption].sort((a, b) => b.tenants - a.tenants).map((a) => ({ key: a.module, label: t(`modules.${a.module}`, { defaultValue: t(`reports.modules.${a.module}`, { defaultValue: a.module }) }), value: a.tenants }))}
              formatValue={(v) => t('reports.tenantsOf', { n: n(v), total: n(d.totals.tenants) })}
              showTable={table}
              nameHeader={t('reports.module')}
              valueHeader={t('reports.tenantsUsing')}
            />
          )}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title={t('reports.channels')}
          description={t('reports.channelsHint')}
          loading={!d}
          empty={!!d && d.channels.length === 0}
          emptyText={t('reports.noActivity')}
          render={(table) => d && (
            <BarList
              rows={d.channels.map((c) => ({ key: c.channel, label: t(`reports.channel.${c.channel}`, { defaultValue: c.channel }), value: c.count }))}
              formatValue={n} showTable={table} nameHeader={t('reports.channelHeader')} valueHeader={t('reports.metric.requests')}
            />
          )}
        />
        <div className="lg:col-span-2"><Cohorts d={d} /></div>
      </div>

      <TenantUsage d={d} />
    </div>
  );
}

function Cohorts({ d }: { d: Analytics | undefined }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  // Sequential single hue (brand), light → dark; the percentage is always printed.
  const shade = ['bg-brand/10', 'bg-brand/25', 'bg-brand/45', 'bg-brand/70', 'bg-brand'];
  const month = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(lng, { month: 'short', year: 'numeric' });
  return (
    <Card title={t('reports.cohorts')} description={t('reports.cohortsHint')}>
      {!d ? <Skeleton className="h-48" /> : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-[2px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th scope="col" className="px-5 py-1.5 font-medium">{t('reports.signedUp')}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">{t('reports.tenants')}</th>
                {[0, 1, 2, 3, 4, 5].map((k) => <th key={k} scope="col" className="px-2 py-1.5 text-center font-medium">{k === 0 ? t('reports.monthZero') : t('reports.monthN', { n: k })}</th>)}
              </tr>
            </thead>
            <tbody>
              {d.cohorts.map((c) => (
                <tr key={c.month}>
                  <th scope="row" className="whitespace-nowrap px-5 py-1 text-left font-normal text-ink">{month(c.month)}</th>
                  <td className="px-2 py-1 text-right tabular-nums text-ink">{c.tenants}</td>
                  {[0, 1, 2, 3, 4, 5].map((k) => {
                    const a = c.active?.[k];
                    const pct = a == null ? null : cohortPct(a, c.tenants);
                    const step = heatStep(pct);
                    return (
                      <td key={k} className={`rounded-md px-2 py-1.5 text-center tabular-nums ${step < 0 ? 'text-ink-muted' : shade[step]} ${step >= 3 ? 'font-semibold text-white' : 'text-ink'}`}
                        title={pct == null ? undefined : t('reports.cohortCell', { active: a, tenants: c.tenants, pct })}>
                        {pct == null ? '' : `${pct}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TenantUsage({ d }: { d: Analytics | undefined }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const rows = d?.tenant_usage ?? [];
  const cols = [
    { header: t('reports.cols.tenant'), value: (r: (typeof rows)[number]) => r.name },
    { header: t('reports.cols.plan'), value: (r: (typeof rows)[number]) => r.plan ?? '' },
    { header: t('reports.cols.activeUsers'), value: (r: (typeof rows)[number]) => r.active_users },
    { header: t('reports.cols.workOrders'), value: (r: (typeof rows)[number]) => r.work_orders },
    { header: t('reports.cols.requests'), value: (r: (typeof rows)[number]) => r.requests },
    { header: t('reports.cols.assets'), value: (r: (typeof rows)[number]) => r.assets },
    { header: t('reports.cols.devices'), value: (r: (typeof rows)[number]) => r.devices },
  ];
  return (
    <Card title={t('reports.tenantUsage')} description={t('reports.tenantUsageHint')}
      actions={rows.length > 0 && (
        <Button variant="secondary" onClick={() => downloadCsv(`tenant-usage-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, cols))} className="print:hidden">
          <Download size={15} aria-hidden /> CSV
        </Button>
      )}>
      {!d ? <Skeleton className="h-48" /> : rows.length === 0 ? <EmptyState title={t('reports.noActivity')} /> : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                {cols.map((c, i) => <th key={c.header} scope="col" className={`py-2 font-medium ${i === 0 ? 'px-5' : 'px-3'} ${i > 1 ? 'text-right' : ''}`}>{c.header}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2"><Link to={`/admin/tenants/${r.id}`} className="font-medium text-ink hover:underline">{r.name}</Link></td>
                  <td className="px-3 py-2 text-ink-muted">{r.plan ? t(`plans.${r.plan}`, { defaultValue: r.plan }) : '—'}</td>
                  {[r.active_users, r.work_orders, r.requests, r.assets, r.devices].map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums text-ink">{formatNumber(v, lng)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
function Builder({ from, to }: { from: Date; to: Date }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [dataset, setDataset] = useState('work_orders');
  const [groupBy, setGroupBy] = useState('month');
  const [measure, setMeasure] = useState('count');
  const [table, setTable] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const spec = REPORT_DATASETS[dataset];
  const run = useMutation({
    meta: { errorHandled: true },
    mutationFn: (def: ReportDefinition) => runReport(def),
    onError: (e) => notify(adminErrorMessage(e), 'error'),
  });
  const r = run.data;
  const valueFmt = (v: number) => (r?.measure === 'amount' ? formatMoney(v, 'USD', lng) : formatNumber(v, lng));
  const title = r ? t('reports.builderTitle', { measure: t(`reports.measures.${r.measure}`), dataset: t(`reports.datasets.${r.dataset}`), group: t(`reports.groups.${r.group_by}`) }) : '';

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field id="rb-ds" label={t('reports.dataset')}>
            <Select id="rb-ds" value={dataset} onChange={(e) => {
              const ds = e.target.value;
              setDataset(ds);
              if (!REPORT_DATASETS[ds].groups.includes(groupBy)) setGroupBy('month');
              if (!REPORT_DATASETS[ds].measures.includes(measure)) setMeasure('count');
            }}>
              {Object.keys(REPORT_DATASETS).map((k) => <option key={k} value={k}>{t(`reports.datasets.${k}`)}</option>)}
            </Select>
          </Field>
          <Field id="rb-group" label={t('reports.groupBy')}>
            <Select id="rb-group" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              {spec.groups.map((g) => <option key={g} value={g}>{t(`reports.groups.${g}`)}</option>)}
            </Select>
          </Field>
          <Field id="rb-measure" label={t('reports.measure')}>
            <Select id="rb-measure" value={measure} onChange={(e) => setMeasure(e.target.value)}>
              {spec.measures.map((m) => <option key={m} value={m}>{t(`reports.measures.${m}`)}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button className="w-full justify-center" loading={run.isPending}
              onClick={() => run.mutate({ dataset, group_by: groupBy, measure, from: from.toISOString(), to: to.toISOString() })}>
              <Play size={15} aria-hidden /> {t('reports.run')}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-muted">{t('reports.builderHint')}</p>
      </Card>

      {r && (
        <Card
          title={title}
          description={t('reports.period', { from: new Date(r.from).toLocaleDateString(lng), to: new Date(r.to).toLocaleDateString(lng) })}
          actions={
            <div className="flex flex-wrap gap-1.5 print:hidden">
              <button type="button" onClick={() => setTable((x) => !x)} aria-pressed={table} className={`rounded-md px-2 py-1 text-xs ${table ? 'bg-ink/10 text-ink' : 'text-ink-muted hover:bg-ink/5'}`}>{t('table')}</button>
              <Button variant="secondary" onClick={() => downloadCsv(`report-${r.dataset}-${r.group_by}.csv`, toCsv(r.rows, [
                { header: t(`reports.groups.${r.group_by}`), value: (x) => x.label },
                { header: t(`reports.measures.${r.measure}`), value: (x) => x.value },
              ]))}><Download size={15} aria-hidden /> CSV</Button>
              <Button variant="secondary" onClick={() => window.print()}><Printer size={15} aria-hidden /> {t('reports.pdf')}</Button>
              <Button variant="secondary" onClick={() => setScheduling(true)}><Mail size={15} aria-hidden /> {t('reports.emailIt')}</Button>
            </div>
          }
        >
          {r.rows.length === 0 ? <EmptyState title={t('reports.noRows')} /> : (
            <BarList
              rows={r.rows.map((x) => ({ key: x.label, label: r.group_by === 'plan' ? t(`plans.${x.label}`, { defaultValue: x.label }) : x.label, value: x.value }))}
              formatValue={valueFmt} showTable={table}
              nameHeader={t(`reports.groups.${r.group_by}`)} valueHeader={t(`reports.measures.${r.measure}`)}
            />
          )}
          {r.rows.length >= 500 && <p className="mt-2 text-xs text-ink-muted">{t('reports.capped')}</p>}
        </Card>
      )}
      {scheduling && r && <ScheduleDialog def={{ dataset: r.dataset, group_by: r.group_by, measure: r.measure }} name={title} onClose={() => setScheduling(false)} />}
    </div>
  );
}

function ScheduleDialog({ def, name, onClose }: { def: ReportDefinition; name: string; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [title, setTitle] = useState(name);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [recipients, setRecipients] = useState('');
  const list = recipients.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const valid = title.trim() && list.length >= 1 && list.length <= 10 && list.every((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const save = useAdminAction(() => rpc('fp_admin_save_report_schedule', { p: { name: title.trim(), frequency, recipients: list, definition: def } }), t('reports.toast.scheduled'));
  return (
    <Modal title={t('reports.scheduleTitle')} onClose={onClose} closeLabel={t('close')}>
      <div className="space-y-3">
        <Field id="sc-name" label={t('reports.scheduleName')}><Input id="sc-name" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field id="sc-freq" label={t('reports.frequency')} hint={t(`reports.frequencyHint.${frequency}`)}>
          <Select id="sc-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly')}>
            <option value="weekly">{t('reports.frequencies.weekly')}</option>
            <option value="monthly">{t('reports.frequencies.monthly')}</option>
          </Select>
        </Field>
        <Field id="sc-to" label={t('reports.recipients')} hint={t('reports.recipientsHint')}>
          <Input id="sc-to" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="ceo@company.com, finance@company.com" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}><Mail size={15} aria-hidden /> {t('reports.schedule')}</Button>
      </div>
    </Modal>
  );
}

function Schedules() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const q = useReportSchedules();
  const toggle = useAdminAction(async (v: { id: string; active: boolean }) => {
    const { error } = await supabase.from('fp_report_schedules').update({ active: v.active }).eq('id', v.id);
    if (error) throw error;
  }, t('reports.toast.updated'));
  const remove = useAdminAction(async (id: string) => {
    const { error } = await supabase.from('fp_report_schedules').delete().eq('id', id);
    if (error) throw error;
  }, t('reports.toast.deleted'));
  const sendNow = useAdminAction((id: string) => rpc('fp_admin_send_report_now', { p_id: id }), t('reports.toast.sent'));
  if (q.isError) return <ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} />;
  if (q.isLoading) return <Skeleton className="h-48" />;
  const rows = q.data ?? [];
  if (!rows.length) return <Card><EmptyState title={t('reports.noSchedules')} body={t('reports.noSchedulesBody')} /></Card>;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">{s.name}</p>
              <p className="text-xs text-ink-muted">
                {t(`reports.frequencies.${s.frequency}`)} · {s.recipients.join(', ')}
              </p>
              <p className="text-xs text-ink-muted">
                {s.active ? t('reports.nextRun', { when: new Date(s.next_run_at).toLocaleString(lng) }) : t('reports.paused')}
                {s.last_sent_at && ` · ${t('reports.lastSent', { when: timeAgo(s.last_sent_at, lng) })}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" loading={sendNow.isPending && sendNow.variables === s.id} onClick={() => sendNow.mutate(s.id)}><Send size={15} aria-hidden /> {t('reports.sendNow')}</Button>
              <button type="button" role="switch" aria-checked={s.active} aria-label={t('reports.toggleSchedule', { name: s.name })}
                onClick={() => toggle.mutate({ id: s.id, active: !s.active })}
                className={`relative h-6 w-11 rounded-full transition ${s.active ? 'bg-brand' : 'bg-ink/20'}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${s.active ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
              <button type="button" onClick={() => remove.mutate(s.id)} aria-label={t('reports.deleteSchedule', { name: s.name })} className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-status-crit"><Trash2 size={15} aria-hidden /></button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
