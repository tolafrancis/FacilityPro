import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, AlertTriangle, CheckCircle2, Table2, TrendingDown, TrendingUp } from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { useOverview, type Overview as OverviewData } from '../lib/queries';
import { eventLabel, eventTone, formatBucket, formatMoney, formatNumber, formatPercent, timeAgo } from '../lib/format';
import DateRangePicker, { useDateRange } from '../components/DateRangePicker';
import { BarList, TimeSeriesChart } from '../components/charts';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';

// Plans are priced in USD (fp_plans.currency).
const CURRENCY = 'USD';

export default function Overview() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [range, setRange] = useDateRange('30d');
  const q = useOverview(range.from, range.to);
  const d = q.data;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={t('overview.title')} description={t('overview.subtitle')} actions={<DateRangePicker range={range} onChange={setRange} />} />

      {q.isError ? (
        <ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} />
      ) : (
        <>
          <Kpis data={d} lng={lng} />

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title={t('overview.revenue')}
              description={t('overview.revenueHint')}
              loading={!d}
              empty={!!d && d.revenue.every((p) => p.paid === 0)}
              emptyText={t('overview.noRevenue')}
              render={(table) =>
                d && (
                  <TimeSeriesChart
                    kind="bar"
                    points={d.revenue.map((p) => ({ t: p.t, v: p.paid }))}
                    label={t('overview.revenue')}
                    formatValue={(v) => formatMoney(v, CURRENCY, lng, true)}
                    formatTime={(iso, short) => formatBucket(iso, d.range.bucket, lng, short)}
                    showTable={table}
                    valueHeader={t('overview.paid')}
                    timeHeader={t('overview.period')}
                  />
                )
              }
            />
            <ChartCard
              title={t('overview.byPlan')}
              loading={!d}
              empty={!!d && d.by_plan.length === 0}
              emptyText={t('overview.noTenants')}
              render={(table) =>
                d && (
                  <BarList
                    rows={d.by_plan.map((p) => ({ key: p.plan, label: t(`plans.${p.plan}`, { defaultValue: p.plan }), value: p.count }))}
                    formatValue={(v) => formatNumber(v, lng)}
                    showTable={table}
                    nameHeader={t('overview.plan')}
                    valueHeader={t('overview.tenants')}
                  />
                )
              }
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ChartCard
              title={t('overview.tenantGrowth')}
              description={t('overview.tenantGrowthHint')}
              loading={!d}
              render={(table) =>
                d && (
                  <TimeSeriesChart
                    points={d.tenant_growth.map((p) => ({ t: p.t, v: p.total }))}
                    label={t('overview.tenantGrowth')}
                    formatValue={(v) => formatNumber(v, lng, true)}
                    formatTime={(iso, short) => formatBucket(iso, d.range.bucket, lng, short)}
                    showTable={table}
                    valueHeader={t('overview.tenants')}
                    timeHeader={t('overview.period')}
                  />
                )
              }
            />
            <ChartCard
              title={t('overview.activeUsers')}
              description={t('overview.activeUsersHint', { bucket: t(`buckets.${d?.range.bucket ?? 'day'}`) })}
              loading={!d}
              empty={!!d && d.active_users.every((p) => p.users === 0)}
              emptyText={t('overview.noActivity')}
              render={(table) =>
                d && (
                  <TimeSeriesChart
                    points={d.active_users.map((p) => ({ t: p.t, v: p.users }))}
                    label={t('overview.activeUsers')}
                    formatValue={(v) => formatNumber(v, lng, true)}
                    formatTime={(iso, short) => formatBucket(iso, d.range.bucket, lng, short)}
                    showTable={table}
                    valueHeader={t('overview.users')}
                    timeHeader={t('overview.period')}
                  />
                )
              }
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <ChartCard
              title={t('overview.topTenants')}
              description={t('overview.topTenantsHint')}
              loading={!d}
              empty={!!d && d.top_tenants.length === 0}
              emptyText={t('overview.noUsage')}
              render={(table) =>
                d && (
                  <BarList
                    rows={d.top_tenants.map((x) => ({
                      key: x.id,
                      label: x.name,
                      value: x.score,
                      hint: t('overview.usageHint', { wo: x.work_orders, req: x.requests, users: x.active_users }),
                    }))}
                    formatValue={(v) => formatNumber(v, lng)}
                    showTable={table}
                    nameHeader={t('overview.tenant')}
                    valueHeader={t('overview.items')}
                  />
                )
              }
            />
            <ActivityFeed data={d} lng={lng} />
            <Health data={d} lng={lng} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpis({ data, lng }: { data: OverviewData | undefined; lng: string }) {
  const { t } = useTranslation('admin');
  const { can } = useAdmin();
  const k = data?.kpis;
  const cards: { key: string; value: string | undefined; sub?: string; to?: string; trend?: 'up' | 'down' }[] = [
    { key: 'totalTenants', value: k && formatNumber(k.total_tenants, lng), to: can('tenants.view') ? '/admin/tenants' : undefined },
    { key: 'activeTenants', value: k && formatNumber(k.active_tenants, lng), sub: k && t('kpi.onTrial', { count: k.trial_tenants }) },
    { key: 'newTenants', value: k && formatNumber(k.new_tenants, lng), sub: t('kpi.inRange'), trend: k && k.new_tenants > 0 ? 'up' : undefined },
    { key: 'totalUsers', value: k && formatNumber(k.total_users, lng), sub: k && t('kpi.dauMau', { dau: formatNumber(k.dau, lng), mau: formatNumber(k.mau, lng) }) },
    { key: 'mrr', value: k && formatMoney(k.mrr, CURRENCY, lng), sub: t('kpi.mrrHint') },
    { key: 'arr', value: k && formatMoney(k.mrr * 12, CURRENCY, lng), sub: t('kpi.arrHint') },
    { key: 'churn', value: k && formatPercent(k.churn_rate, lng), sub: k && t('kpi.churned', { count: k.churned }), trend: k && k.churned > 0 ? 'down' : undefined },
    { key: 'openTickets', value: k && formatNumber(k.open_tickets, lng), to: can('tickets.view') ? '/admin/tickets' : undefined },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => {
        const body = (
          <>
            <p className="text-xs font-medium text-ink-muted">{t(`kpi.${c.key}`)}</p>
            {c.value === undefined ? (
              <Skeleton className="mt-2 h-7 w-20" />
            ) : (
              <p className="mt-1.5 flex items-center gap-1.5 text-2xl font-semibold tracking-tight tabular-nums text-ink">
                {c.value}
                {c.trend === 'up' && <TrendingUp size={16} className="text-status-ok" aria-hidden />}
                {c.trend === 'down' && <TrendingDown size={16} className="text-status-crit" aria-hidden />}
              </p>
            )}
            {c.sub && <p className="mt-1 truncate text-xs text-ink-muted">{c.sub}</p>}
          </>
        );
        const cls = 'block rounded-xl border border-line bg-panel p-4 transition';
        return c.to ? (
          <Link key={c.key} to={c.to} className={`${cls} hover:border-ink/20`}>{body}</Link>
        ) : (
          <div key={c.key} className={cls}>{body}</div>
        );
      })}
    </div>
  );
}

function ChartCard({ title, description, loading, empty, emptyText, render, className = '' }: {
  title: string;
  description?: string;
  loading: boolean;
  empty?: boolean;
  emptyText?: string;
  render: (table: boolean) => ReactNode;
  className?: string;
}) {
  const { t } = useTranslation('admin');
  const [table, setTable] = useState(false);
  return (
    <Card
      className={className}
      title={title}
      description={description}
      actions={
        !loading && !empty ? (
          <button
            type="button"
            onClick={() => setTable((x) => !x)}
            aria-pressed={table}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${table ? 'bg-ink/10 text-ink' : 'text-ink-muted hover:bg-ink/5 hover:text-ink'}`}
          >
            <Table2 size={13} aria-hidden /> {t('table')}
          </button>
        ) : undefined
      }
    >
      {loading ? <Skeleton className="h-[220px] w-full" /> : empty ? <EmptyState title={emptyText ?? t('empty')} /> : render(table)}
    </Card>
  );
}

function ActivityFeed({ data, lng }: { data: OverviewData | undefined; lng: string }) {
  const { t } = useTranslation('admin');
  return (
    <Card title={t('overview.activity')} description={t('overview.activityHint')}>
      {!data ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : data.activity.length === 0 ? (
        <EmptyState title={t('overview.noEvents')} icon={Activity} />
      ) : (
        <ul className="-my-2 divide-y divide-line">
          {data.activity.slice(0, 8).map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2">
              <Badge tone={eventTone(e.type)}>{eventLabel(e.type, t)}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{e.org_name ?? '—'}</p>
                <p className="text-xs text-ink-muted">{timeAgo(e.at, lng)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Health({ data, lng }: { data: OverviewData | undefined; lng: string }) {
  const { t } = useTranslation('admin');
  const h = data?.health;
  const rows = h
    ? [
        { key: 'jobs', ok: h.jobs_healthy === h.jobs_total, value: t('health.jobsValue', { ok: h.jobs_healthy, total: h.jobs_total }) },
        { key: 'jobFailures', ok: h.job_failures_24h === 0, value: formatNumber(h.job_failures_24h, lng) },
        { key: 'outboxPending', ok: h.outbox_pending < 50, value: formatNumber(h.outbox_pending, lng) },
        { key: 'outboxFailed', ok: h.outbox_failed === 0, value: formatNumber(h.outbox_failed, lng) },
      ]
    : [];
  const allOk = rows.every((r) => r.ok);
  return (
    <Card
      title={t('health.title')}
      description={h ? t('health.checked', { when: timeAgo(h.checked_at, lng) }) : undefined}
      actions={h ? <Badge tone={allOk ? 'ok' : 'warn'}>{allOk ? t('health.allGood') : t('health.attention')}</Badge> : undefined}
    >
      {!h ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2 text-sm">
              {r.ok ? <CheckCircle2 size={16} className="shrink-0 text-status-ok" aria-label={t('health.ok')} /> : <AlertTriangle size={16} className="shrink-0 text-status-warn" aria-label={t('health.warn')} />}
              <span className="flex-1 text-ink">{t(`health.${r.key}`)}</span>
              <span className="tabular-nums text-ink-muted">{r.value}</span>
            </li>
          ))}
          <li className="pt-1 text-xs text-ink-muted">{t('health.apiNote')}</li>
        </ul>
      )}
    </Card>
  );
}
