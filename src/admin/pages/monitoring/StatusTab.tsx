import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw } from 'lucide-react';
import { BarList, TimeSeriesChart } from '../../components/charts';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { formatNumber, timeAgo } from '../../lib/format';
import { formatBytes, useMonitoringStatus, type MonitoringStatus } from '../../lib/monitoring';
import { control } from '../billing/shared';
import type { MonitoringTab } from '../Monitoring';

const HOURLY = ['sent', 'failed', 'job_failures', 'errors'] as const;
type Hourly = (typeof HOURLY)[number];

const CHECK_TAB: Record<string, MonitoringTab> = {
  outbox_failed: 'email', outbox_backlog: 'email', workflow_failures: 'errors', webhook_failures: 'webhooks',
};

export default function StatusTab({ onOpen }: { onOpen: (tab: MonitoringTab) => void }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const q = useMonitoringStatus();
  const [metric, setMetric] = useState<Hourly>('sent');
  if (q.isError) return <ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} />;
  const d = q.data;
  const problems = d ? d.jobs.total - d.jobs.healthy + d.checks.filter((c) => !c.ok).length : 0;

  const tiles: { key: string; value?: string; bad?: boolean; tab: MonitoringTab }[] = [
    { key: 'jobs', value: d && t('health.jobsValue', { ok: d.jobs.healthy, total: d.jobs.total }), bad: !!d && d.jobs.healthy < d.jobs.total, tab: 'jobs' },
    { key: 'sent', value: d && formatNumber(d.outbox.sent_24h, lng), tab: 'email' },
    { key: 'failed', value: d && formatNumber(d.outbox.failed_24h, lng), bad: !!d && d.outbox.failed_24h > 0, tab: 'email' },
    { key: 'pending', value: d && formatNumber(d.outbox.pending, lng), tab: 'email' },
    { key: 'errors', value: d && formatNumber(d.errors.open, lng), bad: !!d && d.errors.new_24h > 0, tab: 'errors' },
    { key: 'webhooks', value: d && formatNumber(d.webhooks.failed_24h, lng), bad: !!d && d.webhooks.failed_24h > 0, tab: 'webhooks' },
  ];

  return (
    <div className="space-y-4">
      {!d ? <Skeleton className="h-16" /> : (
        <div role="status" className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${problems ? 'border-status-warn/40 bg-status-warn/10' : 'border-status-ok/30 bg-status-ok/10'}`}>
          {problems ? <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" aria-hidden /> : <CheckCircle2 size={20} className="text-status-ok" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{problems ? t('monitoring.status.problems', { count: problems }) : t('monitoring.status.allGood')}</p>
            <p className="text-xs text-ink-muted">{t('health.checked', { when: timeAgo(d.checked_at, lng) })} · {t('monitoring.status.autoRefresh')}</p>
          </div>
          <button type="button" onClick={() => void q.refetch()} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink">
            <RefreshCw size={14} className={q.isFetching ? 'animate-spin' : ''} aria-hidden /> {t('monitoring.refresh')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((c) => (
          <button key={c.key} type="button" onClick={() => onOpen(c.tab)} className="rounded-xl border border-line bg-panel p-4 text-left transition hover:border-ink/20">
            <p className="text-xs text-ink-muted">{t(`monitoring.tiles.${c.key}`)}</p>
            {c.value === undefined ? <Skeleton className="mt-2 h-7 w-16" /> : (
              <p className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${c.bad ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`}>{c.value}</p>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={t(`monitoring.hourly.${metric}`)} description={t('monitoring.hourlyHint')}
          actions={
            <select aria-label={t('reports.show')} value={metric} onChange={(e) => setMetric(e.target.value as Hourly)} className={control}>
              {HOURLY.map((m) => <option key={m} value={m}>{t(`monitoring.hourly.${m}`)}</option>)}
            </select>
          }>
          {!d ? <Skeleton className="h-[220px]" /> : d.hourly.every((h) => h[metric] === 0) ? (
            <EmptyState title={t('monitoring.hourlyEmpty')} />
          ) : (
            <TimeSeriesChart
              kind="bar"
              points={d.hourly.map((h) => ({ t: h.hour, v: h[metric] }))}
              label={t(`monitoring.hourly.${metric}`)}
              formatValue={(v) => formatNumber(v, lng)}
              formatTime={(iso, short) => new Date(iso).toLocaleTimeString(lng, short ? { hour: 'numeric' } : { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              valueHeader={t(`monitoring.hourly.${metric}`)}
              timeHeader={t('monitoring.hour')}
            />
          )}
        </Card>

        <Card title={t('monitoring.checks.title')}>
          {!d ? <div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6" />)}</div> : (
            <ul className="space-y-3">
              <CheckRow ok={d.jobs.healthy === d.jobs.total} label={t('monitoring.checks.jobs')}
                detail={d.jobs.late.length ? t('monitoring.checks.late', { jobs: d.jobs.late.join(', ') }) : undefined} onOpen={() => onOpen('jobs')} />
              {d.checks.map((c) => (
                <CheckRow key={c.name} ok={c.ok} label={t(`monitoring.checks.${c.name}`, { defaultValue: c.name })}
                  detail={c.ok ? undefined : c.detail} onOpen={CHECK_TAB[c.name] ? () => onOpen(CHECK_TAB[c.name]) : undefined} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Setup d={d} />
        <Database d={d} />
      </div>
    </div>
  );
}

function CheckRow({ ok, label, detail, onOpen }: { ok: boolean; label: string; detail?: string; onOpen?: () => void }) {
  const { t } = useTranslation('admin');
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-status-ok" aria-label={t('health.ok')} />
        : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-status-warn" aria-label={t('health.warn')} />}
      <div className="min-w-0 flex-1">
        {onOpen && !ok ? <button type="button" onClick={onOpen} className="text-left text-ink hover:underline">{label}</button> : <span className="text-ink">{label}</span>}
        {detail && <p className="mt-0.5 break-words text-xs text-ink-muted">{detail}</p>}
      </div>
    </li>
  );
}

function Setup({ d }: { d: MonitoringStatus | undefined }) {
  const { t } = useTranslation('admin');
  const rows = d ? [
    { key: 'cron', ok: d.setup.cron },
    { key: 'net', ok: d.setup.net },
    { key: 'vault', ok: d.setup.vault },
  ] : [];
  return (
    <Card title={t('monitoring.setup.title')} description={t('monitoring.setup.hint')}>
      {!d ? <Skeleton className="h-28" /> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start gap-2 text-sm">
              {r.ok === true ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-status-ok" aria-label={t('health.ok')} />
                : r.ok === false ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-status-warn" aria-label={t('health.warn')} />
                : <HelpCircle size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-label={t('monitoring.setup.unknown')} />}
              <div>
                <p className="text-ink">{t(`monitoring.setup.${r.key}`)}</p>
                {r.ok !== true && <p className="text-xs text-ink-muted">{t(r.ok === false ? `monitoring.setup.${r.key}Fix` : 'monitoring.setup.unknownHint')}</p>}
              </div>
            </li>
          ))}
          <li className="border-t border-line pt-3 text-xs text-ink-muted">{t('monitoring.setup.uptime')}</li>
        </ul>
      )}
    </Card>
  );
}

function Database({ d }: { d: MonitoringStatus | undefined }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  return (
    <Card title={t('monitoring.db.title')}
      actions={d ? <Badge>{t('monitoring.db.connections', { count: d.database.connections })}</Badge> : undefined}>
      {!d ? <Skeleton className="h-40" /> : (
        <>
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-ink">{formatBytes(d.database.size_bytes, lng)}</p>
          <p className="mb-4 text-xs text-ink-muted">{t('monitoring.db.size')}</p>
          <BarList
            rows={(d.database.tables ?? []).map((x) => ({ key: x.name, label: x.name, value: x.bytes, hint: t('monitoring.db.rows', { count: x.rows }) }))}
            formatValue={(v) => formatBytes(v, lng)}
            nameHeader={t('monitoring.db.table')}
            valueHeader={t('monitoring.db.size')}
          />
        </>
      )}
    </Card>
  );
}
