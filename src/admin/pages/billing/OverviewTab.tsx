import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DateRangePicker, { useDateRange } from '../../components/DateRangePicker';
import { BarList, TimeSeriesChart } from '../../components/charts';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { ChartCard } from '../Overview';
import { formatBucket, formatMoney, formatNumber, timeAgo } from '../../lib/format';
import { useBillingOverview } from '../../lib/billing';
import { invoiceStatusTone } from './shared';

// Plans are priced in USD (fp_plans.currency); reports add amounts as USD.
const CURRENCY = 'USD';

export default function BillingOverviewTab({ onOpenInvoices }: { onOpenInvoices: (status?: string) => void }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [range, setRange] = useDateRange('12m');
  const q = useBillingOverview(range.from.toISOString(), range.to.toISOString());
  const d = q.data;
  const k = d?.kpis;
  const money = (v: number, compact = false) => formatMoney(v, CURRENCY, lng, compact);

  if (q.isError) return <ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} />;

  const tiles: { key: string; value?: string; sub?: string; onClick?: () => void; tone?: 'crit' | 'warn' }[] = [
    { key: 'mrr', value: k && money(k.mrr), sub: k && t('billing.kpi.paying', { count: k.paying_tenants }) },
    { key: 'arr', value: k && money(k.arr), sub: k && t('billing.kpi.arpu', { value: money(k.arpu) }) },
    { key: 'collected', value: k && money(k.collected), sub: t('kpi.inRange') },
    { key: 'refunded', value: k && money(k.refunded), sub: t('kpi.inRange') },
    { key: 'outstanding', value: k && money(k.outstanding), sub: k && t('billing.kpi.invoices', { count: k.outstanding_count }), onClick: () => onOpenInvoices('open') },
    { key: 'failed', value: k && money(k.failed), sub: k && t('billing.kpi.invoices', { count: k.failed_count }), onClick: () => onOpenInvoices('failed'), tone: k && k.failed_count > 0 ? 'crit' : undefined },
    { key: 'pastDue', value: k && formatNumber(k.past_due, lng), sub: t('billing.kpi.pastDueHint'), tone: k && k.past_due > 0 ? 'warn' : undefined },
    { key: 'trials', value: k && formatNumber(k.trials, lng), sub: k && t('billing.kpi.cancelScheduled', { count: k.cancel_scheduled }) },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-end"><DateRangePicker range={range} onChange={setRange} /></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((c) => {
          const body = (
            <>
              <p className="text-xs font-medium text-ink-muted">{t(`billing.kpi.${c.key}`)}</p>
              {c.value === undefined ? (
                <Skeleton className="mt-2 h-7 w-20" />
              ) : (
                <p className={`mt-1.5 text-2xl font-semibold tracking-tight tabular-nums ${c.tone === 'crit' ? 'text-status-crit' : c.tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`}>{c.value}</p>
              )}
              {c.sub && <p className="mt-1 truncate text-xs text-ink-muted">{c.sub}</p>}
            </>
          );
          const cls = 'block rounded-xl border border-line bg-panel p-4 text-left transition';
          return c.onClick ? (
            <button key={c.key} type="button" onClick={c.onClick} className={`${cls} hover:border-ink/20`}>{body}</button>
          ) : (
            <div key={c.key} className={cls}>{body}</div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title={t('billing.monthly')}
          description={t('billing.monthlyHint')}
          loading={!d}
          empty={!!d && d.monthly.every((p) => p.net === 0)}
          emptyText={t('overview.noRevenue')}
          render={(table) =>
            d && (
              <TimeSeriesChart
                kind="bar"
                points={d.monthly.map((p) => ({ t: p.t, v: p.net }))}
                label={t('billing.monthly')}
                formatValue={(v) => money(v, true)}
                formatTime={(iso, short) => formatBucket(iso, 'month', lng, short)}
                showTable={table}
                valueHeader={t('billing.net')}
                timeHeader={t('overview.period')}
              />
            )
          }
        />
        <ChartCard
          title={t('billing.byProvider')}
          description={t('kpi.inRange')}
          loading={!d}
          empty={!!d && d.by_provider.length === 0}
          emptyText={t('overview.noRevenue')}
          render={(table) =>
            d && (
              <BarList
                rows={d.by_provider.map((p) => ({ key: p.provider, label: t(`providers.${p.provider}`, { defaultValue: p.provider }), value: p.amount }))}
                formatValue={(v) => money(v)}
                showTable={table}
                nameHeader={t('billing.provider')}
                valueHeader={t('billing.net')}
              />
            )
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('billing.mrrByPlan')}
          loading={!d}
          empty={!!d && d.by_plan.length === 0}
          emptyText={t('billing.noPaying')}
          render={(table) =>
            d && (
              <BarList
                rows={d.by_plan.map((p) => ({ key: p.plan, label: `${t(`plans.${p.plan}`, { defaultValue: p.plan })} · ${t('billing.kpi.paying', { count: p.tenants })}`, value: p.mrr }))}
                formatValue={(v) => money(v)}
                showTable={table}
                nameHeader={t('overview.plan')}
                valueHeader={t('billing.kpi.mrr')}
              />
            )
          }
        />
        <Card title={t('billing.attention')} description={t('billing.attentionHint')}>
          {!d ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
          ) : d.attention.length === 0 ? (
            <EmptyState title={t('billing.allPaid')} />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {d.attention.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <Link to={`/admin/tenants/${a.org_id}?tab=billing`} className="font-medium text-ink hover:underline">{a.org_name}</Link>
                    <span className="block text-xs text-ink-muted">{a.number} · {t(`providers.${a.provider}`, { defaultValue: a.provider })} · {timeAgo(a.at, lng)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-ink">{formatMoney(a.amount, a.currency, lng)}</span>
                    <Badge tone={invoiceStatusTone(a.status)}>{t(`invoiceStatus.${a.status}`, { defaultValue: a.status })}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
