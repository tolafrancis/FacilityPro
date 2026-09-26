import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DataTable, { type Column } from '../../components/DataTable';
import { Badge, Card, Skeleton, type Tone } from '../../components/ui';
import { formatNumber, timeAgo } from '../../lib/format';
import { useWebhooks, type WebhookRow } from '../../lib/monitoring';
import { control } from '../billing/shared';

const PAGE_SIZE = 50;
const PROVIDERS = ['stripe', 'paypal'] as const;
const STATUSES = ['processed', 'ignored', 'failed', 'received'] as const;

function tone(s: string): Tone {
  return s === 'processed' ? 'ok' : s === 'failed' ? 'crit' : s === 'received' ? 'info' : 'neutral';
}

export default function WebhooksTab() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [params, setParams] = useSearchParams();
  const provider = params.get('provider') ?? '';
  const status = params.get('status') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };
  const list = useWebhooks({ provider, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const stats = list.data?.stats;

  const columns: Column<WebhookRow>[] = [
    { key: 'at', header: t('monitoring.webhooks.cols.received'), fixed: true, cell: (r) => <span className="whitespace-nowrap" title={new Date(r.received_at).toLocaleString(lng)}>{timeAgo(r.received_at, lng)}</span> },
    { key: 'provider', header: t('monitoring.webhooks.cols.provider'), cell: (r) => t(`providers.${r.provider}`, { defaultValue: r.provider }) },
    { key: 'type', header: t('monitoring.webhooks.cols.type'), cell: (r) => <code className="text-xs">{r.type}</code> },
    { key: 'tenant', header: t('audit.cols.tenant'), cell: (r) => (r.org_id ? <Link to={`/admin/tenants/${r.org_id}`} className="hover:underline">{r.org_name ?? r.org_id.slice(0, 8)}</Link> : <span className="text-ink-muted">—</span>) },
    {
      key: 'status', header: t('monitoring.webhooks.cols.status'), cell: (r) => (
        <div>
          <Badge tone={tone(r.status)}>{t(`monitoring.webhooks.status.${r.status}`, { defaultValue: r.status })}</Badge>
          {r.error && <p className="mt-1 max-w-xs break-words text-xs text-ink-muted">{r.error.slice(0, 200)}</p>}
        </div>
      ),
    },
    { key: 'event', header: t('monitoring.webhooks.cols.event'), cell: (r) => <code className="break-all text-xs text-ink-muted">{r.event_id}</code>, hiddenByDefault: true },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((p) => {
          const n = (s: string) => stats?.[`${p}:${s}`] ?? 0;
          const total = STATUSES.reduce((a, s) => a + n(s), 0);
          return (
            <Card key={p} title={t(`providers.${p}`)} description={t('monitoring.webhooks.last7')}>
              {!stats ? <Skeleton className="h-12" /> : total === 0 ? <p className="text-sm text-ink-muted">{t('monitoring.webhooks.none')}</p> : (
                <dl className="grid grid-cols-4 gap-2">
                  {STATUSES.map((s) => (
                    <button key={s} type="button" onClick={() => update({ provider: p, status: s })} className="rounded-lg border border-line px-2 py-1.5 text-left hover:border-ink/20">
                      <dt className="truncate text-xs text-ink-muted">{t(`monitoring.webhooks.status.${s}`)}</dt>
                      <dd className={`text-lg font-semibold tabular-nums ${s === 'failed' && n(s) > 0 ? 'text-status-crit dark:text-red-400' : 'text-ink'}`}>{formatNumber(n(s), lng)}</dd>
                    </button>
                  ))}
                </dl>
              )}
            </Card>
          );
        })}
      </div>

      <DataTable
        id="webhooks"
        columns={columns}
        rows={list.data?.rows ?? []}
        rowKey={(r) => String(r.id)}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={(p) => update({ page: p > 1 ? String(p) : null }, false)}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyTitle={t('monitoring.webhooks.empty')}
        toolbar={
          <>
            <select aria-label={t('monitoring.webhooks.cols.provider')} value={provider} onChange={(e) => update({ provider: e.target.value || null })} className={control}>
              <option value="">{t('monitoring.webhooks.allProviders')}</option>
              {PROVIDERS.map((p) => <option key={p} value={p}>{t(`providers.${p}`)}</option>)}
            </select>
            <select aria-label={t('monitoring.webhooks.cols.status')} value={status} onChange={(e) => update({ status: e.target.value || null })} className={control}>
              <option value="">{t('monitoring.webhooks.allStatuses')}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`monitoring.webhooks.status.${s}`)}</option>)}
            </select>
          </>
        }
      />
      <p className="text-xs text-ink-muted">
        {t('monitoring.webhooks.resend')}{' '}
        <Link to="/admin/billing?tab=providers" className="text-brand-600 hover:underline dark:text-brand">{t('monitoring.webhooks.setup')}</Link>
      </p>
    </div>
  );
}
