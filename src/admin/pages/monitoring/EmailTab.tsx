import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ban, RotateCcw, Search } from 'lucide-react';
import DataTable, { type Column } from '../../components/DataTable';
import { Badge, Card, Skeleton, type Tone } from '../../components/ui';
import Button from '../../../components/ui/Button';
import { formatNumber, timeAgo } from '../../lib/format';
import { rpc, useAdminAction } from '../../lib/tenants';
import { useOutbox, useOutboxStats, type OutboxRow } from '../../lib/monitoring';
import { ConfirmDialog } from '../TenantDetail';
import { control } from '../billing/shared';

const PAGE_SIZE = 50;
const STATUSES = ['pending', 'sent', 'failed'] as const;

export function outboxTone(s: string): Tone {
  return s === 'sent' ? 'ok' : s === 'failed' ? 'crit' : s === 'sending' ? 'info' : 'warn';
}

export default function EmailTab() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const channel = params.get('channel') ?? '';
  const q = params.get('q') ?? '';
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
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search.trim() === q) return;
    const id = setTimeout(() => update({ q: search.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const list = useOutbox({ status, channel, search: q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const stats = useOutboxStats();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<'retryAll' | 'cancel' | null>(null);
  const retry = useAdminAction((ids: string[] | null) => rpc<number>('fp_admin_outbox_retry', { p_ids: ids }), t('monitoring.email.retried'));
  const cancel = useAdminAction((ids: string[]) => rpc<number>('fp_admin_outbox_cancel', { p_ids: ids }), t('monitoring.email.cancelled'));
  const rows = list.data?.rows ?? [];
  const picked = rows.filter((r) => selected.has(r.id));
  const done = () => setSelected(new Set());

  const columns: Column<OutboxRow>[] = [
    { key: 'created', header: t('monitoring.email.cols.queued'), fixed: true, cell: (r) => <span className="whitespace-nowrap" title={new Date(r.created_at).toLocaleString(lng)}>{timeAgo(r.created_at, lng)}</span> },
    { key: 'to', header: t('monitoring.email.cols.to'), cell: (r) => <span className="break-all">{r.to_address}</span> },
    { key: 'subject', header: t('monitoring.email.cols.subject'), cell: (r) => <span className="line-clamp-2 max-w-xs">{r.subject}</span> },
    { key: 'tenant', header: t('audit.cols.tenant'), cell: (r) => (r.org_id ? <Link to={`/admin/tenants/${r.org_id}`} className="hover:underline">{r.org_name ?? r.org_id.slice(0, 8)}</Link> : <span className="text-ink-muted">{t('monitoring.email.platform')}</span>) },
    { key: 'channel', header: t('monitoring.email.cols.channel'), cell: (r) => <span className="text-ink-muted">{t(`monitoring.email.channel.${r.channel}`, { defaultValue: r.channel })}</span>, hiddenByDefault: false },
    {
      key: 'status', header: t('monitoring.email.cols.status'), cell: (r) => (
        <div>
          <Badge tone={outboxTone(r.status)}>{t(`monitoring.email.status.${r.status}`, { defaultValue: r.status })}</Badge>
          {r.error && <p className="mt-1 max-w-xs break-words text-xs text-ink-muted">{r.error.slice(0, 200)}</p>}
        </div>
      ),
    },
    { key: 'attempts', header: t('monitoring.email.cols.attempts'), align: 'right', cell: (r) => <span className="tabular-nums">{r.attempts}</span>, hiddenByDefault: true },
    { key: 'sent', header: t('monitoring.email.cols.sent'), cell: (r) => (r.sent_at ? <span className="whitespace-nowrap">{timeAgo(r.sent_at, lng)}</span> : '—'), hiddenByDefault: true },
  ];

  const s = stats.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('monitoring.email.last7')}>
          {!s ? <Skeleton className="h-24" /> : (
            <>
              <dl className="grid grid-cols-3 gap-3">
                {STATUSES.map((x) => {
                  const n = x === 'pending' ? (s.by_status.pending ?? 0) + (s.by_status.sending ?? 0) : s.by_status[x] ?? 0;
                  return (
                    <button key={x} type="button" onClick={() => update({ status: status === x ? null : x })}
                      className={`rounded-lg border px-3 py-2 text-left transition ${status === x ? 'border-brand' : 'border-line hover:border-ink/20'}`}>
                      <dt className="text-xs text-ink-muted">{t(`monitoring.email.status.${x}`)}</dt>
                      <dd className={`text-xl font-semibold tabular-nums ${x === 'failed' && n > 0 ? 'text-status-crit dark:text-red-400' : 'text-ink'}`}>{formatNumber(n, lng)}</dd>
                    </button>
                  );
                })}
              </dl>
              {s.oldest_pending && <p className="mt-3 text-xs text-ink-muted">{t('monitoring.email.oldest', { when: timeAgo(s.oldest_pending, lng) })}</p>}
            </>
          )}
        </Card>
        <Card className="lg:col-span-2" title={t('monitoring.email.topErrors')} description={t('monitoring.email.topErrorsHint')}
          actions={<Button variant="secondary" onClick={() => setConfirm('retryAll')}><RotateCcw size={15} aria-hidden /> {t('monitoring.email.retryAll')}</Button>}>
          {!s ? <Skeleton className="h-24" /> : s.top_errors.length === 0 ? <p className="text-sm text-ink-muted">{t('monitoring.email.noErrors')}</p> : (
            <ul className="divide-y divide-line">
              {s.top_errors.map((e) => (
                <li key={e.error ?? ''} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <button type="button" onClick={() => { setSearch(e.error ?? ''); update({ status: 'failed', q: e.error ?? null }); }} className="min-w-0 break-words text-left text-ink hover:underline">
                    {e.error ?? t('monitoring.email.unknownError')}
                  </button>
                  <span className="shrink-0 text-right text-xs text-ink-muted"><span className="font-medium tabular-nums text-ink">{formatNumber(e.count, lng)}</span><br />{timeAgo(e.last_at, lng)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <DataTable
        id="outbox"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={(p) => update({ page: p > 1 ? String(p) : null }, false)}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyTitle={t('monitoring.email.empty')}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={
          <>
            <Button variant="secondary" loading={retry.isPending} disabled={!picked.some((r) => r.status === 'failed')}
              onClick={() => retry.mutate(picked.filter((r) => r.status === 'failed').map((r) => r.id), { onSuccess: done })}>
              <RotateCcw size={15} aria-hidden /> {t('monitoring.email.retry')}
            </Button>
            <Button variant="secondary" disabled={!picked.some((r) => r.status === 'pending')} onClick={() => setConfirm('cancel')}>
              <Ban size={15} aria-hidden /> {t('monitoring.email.cancel')}
            </Button>
          </>
        }
        toolbar={
          <>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('monitoring.email.search')} aria-label={t('monitoring.email.search')} className={`${control} w-full pl-8`} />
            </div>
            <select aria-label={t('monitoring.email.cols.status')} value={status} onChange={(e) => update({ status: e.target.value || null })} className={control}>
              <option value="">{t('monitoring.email.allStatuses')}</option>
              {STATUSES.map((x) => <option key={x} value={x}>{t(`monitoring.email.status.${x}`)}</option>)}
            </select>
            {(s?.channels.length ?? 0) > 1 && (
              <select aria-label={t('monitoring.email.cols.channel')} value={channel} onChange={(e) => update({ channel: e.target.value || null })} className={control}>
                <option value="">{t('monitoring.email.allChannels')}</option>
                {s!.channels.map((c) => <option key={c} value={c}>{t(`monitoring.email.channel.${c}`, { defaultValue: c })}</option>)}
              </select>
            )}
          </>
        }
      />
      <p className="text-xs text-ink-muted">{t('monitoring.email.privacy')}</p>

      {confirm === 'retryAll' && (
        <ConfirmDialog title={t('monitoring.email.retryAll')} body={t('monitoring.email.retryAllBody')} confirmLabel={t('monitoring.email.retry')}
          busy={retry.isPending} onClose={() => setConfirm(null)} onConfirm={() => retry.mutate(null, { onSettled: () => setConfirm(null) })} />
      )}
      {confirm === 'cancel' && (
        <ConfirmDialog danger title={t('monitoring.email.cancel')} body={t('monitoring.email.cancelBody', { count: picked.filter((r) => r.status === 'pending').length })}
          confirmLabel={t('monitoring.email.cancel')} busy={cancel.isPending} onClose={() => setConfirm(null)}
          onConfirm={() => cancel.mutate(picked.filter((r) => r.status === 'pending').map((r) => r.id), { onSuccess: done, onSettled: () => setConfirm(null) })} />
      )}
    </div>
  );
}
