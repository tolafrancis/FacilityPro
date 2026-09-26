import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, EyeOff, RotateCcw, Search } from 'lucide-react';
import DataTable, { type Column } from '../../components/DataTable';
import { Badge, Card, ErrorState, Skeleton, type Tone } from '../../components/ui';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { formatNumber, timeAgo } from '../../lib/format';
import { rpc, useAdminAction } from '../../lib/tenants';
import { useAppError, useAppErrors, useWorkflowFailures, type AppErrorRow } from '../../lib/monitoring';
import { control } from '../billing/shared';

const PAGE_SIZE = 50;
const VIEWS = ['open', 'resolved', 'ignored', 'all'] as const;
const SOURCES = ['web', 'admin', 'edge'] as const;

function statusTone(s: string): Tone {
  return s === 'open' ? 'crit' : s === 'resolved' ? 'ok' : 'neutral';
}

export default function ErrorsTab() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [params, setParams] = useSearchParams();
  const view = (VIEWS as readonly string[]).includes(params.get('view') ?? '') ? params.get('view')! : 'open';
  const source = params.get('source') ?? '';
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

  const list = useAppErrors({ status: view === 'all' ? '' : view, source, search: q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const setStatus = useAdminAction(
    (v: { ids: number[]; status: string }) => rpc<number>('fp_admin_app_errors_set', { p_ids: v.ids, p_status: v.status }),
    (v) => t(`monitoring.errors.toast.${v.status}`, { count: v.ids.length }),
  );
  const bulk = (status: string) => setStatus.mutate({ ids: [...selected].map(Number), status }, { onSuccess: () => setSelected(new Set()) });

  const columns: Column<AppErrorRow>[] = [
    {
      key: 'message', header: t('monitoring.errors.cols.error'), fixed: true, cell: (r) => (
        <button type="button" onClick={() => setOpen(r.id)} className="block max-w-xl text-left">
          <span className="line-clamp-2 break-words font-medium text-ink hover:underline">{r.message}</span>
          {r.location && <code className="mt-0.5 block truncate text-xs text-ink-muted">{r.location}</code>}
        </button>
      ),
    },
    { key: 'source', header: t('monitoring.errors.cols.source'), cell: (r) => <span className="text-ink-muted">{t(`monitoring.errors.source.${r.source}`, { defaultValue: r.source })}</span> },
    { key: 'count', header: t('monitoring.errors.cols.count'), align: 'right', cell: (r) => <span className="tabular-nums">{formatNumber(r.occurrences, lng)}</span> },
    { key: 'last', header: t('monitoring.errors.cols.last'), cell: (r) => <span className="whitespace-nowrap" title={new Date(r.last_seen).toLocaleString(lng)}>{timeAgo(r.last_seen, lng)}</span> },
    { key: 'first', header: t('monitoring.errors.cols.first'), cell: (r) => <span className="whitespace-nowrap text-ink-muted">{timeAgo(r.first_seen, lng)}</span>, hiddenByDefault: true },
    {
      key: 'status', header: t('monitoring.errors.cols.status'), cell: (r) => (
        <span className="inline-flex flex-wrap gap-1">
          <Badge tone={statusTone(r.status)}>{t(`monitoring.errors.status.${r.status}`)}</Badge>
          {r.reopened > 0 && r.status === 'open' && <Badge tone="warn">{t('monitoring.errors.regressed')}</Badge>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        id="app-errors"
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
        emptyTitle={view === 'open' ? t('monitoring.errors.noneOpen') : t('monitoring.errors.empty')}
        emptyBody={view === 'open' ? t('monitoring.errors.noneOpenHint') : undefined}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={
          <>
            {view !== 'resolved' && <Button variant="secondary" loading={setStatus.isPending} onClick={() => bulk('resolved')}><CheckCircle2 size={15} aria-hidden /> {t('monitoring.errors.resolve')}</Button>}
            {view !== 'ignored' && <Button variant="secondary" loading={setStatus.isPending} onClick={() => bulk('ignored')}><EyeOff size={15} aria-hidden /> {t('monitoring.errors.ignore')}</Button>}
            {view !== 'open' && <Button variant="secondary" loading={setStatus.isPending} onClick={() => bulk('open')}><RotateCcw size={15} aria-hidden /> {t('monitoring.errors.reopen')}</Button>}
          </>
        }
        toolbar={
          <>
            <div role="group" aria-label={t('monitoring.errors.cols.status')} className="inline-flex rounded-md border border-line p-0.5">
              {VIEWS.map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => { setSelected(new Set()); update({ view: v === 'open' ? null : v }); }}
                  className={`rounded px-2.5 py-1 text-sm ${view === v ? 'bg-ink/10 font-medium text-ink' : 'text-ink-muted hover:text-ink'}`}>
                  {t(`monitoring.errors.view.${v}`)}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-56">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('monitoring.errors.search')} aria-label={t('monitoring.errors.search')} className={`${control} w-full pl-8`} />
            </div>
            <select aria-label={t('monitoring.errors.cols.source')} value={source} onChange={(e) => update({ source: e.target.value || null })} className={control}>
              <option value="">{t('monitoring.errors.allSources')}</option>
              {SOURCES.map((x) => <option key={x} value={x}>{t(`monitoring.errors.source.${x}`)}</option>)}
            </select>
          </>
        }
      />
      <p className="text-xs text-ink-muted">{t('monitoring.errors.howItWorks')}</p>

      <WorkflowFailures />
      {open != null && <ErrorDialog id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ErrorDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const q = useAppError(id);
  const setStatus = useAdminAction(
    (status: string) => rpc<number>('fp_admin_app_errors_set', { p_ids: [id], p_status: status }),
    (status) => t(`monitoring.errors.toast.${status}`, { count: 1 }),
  );
  const e = q.data;
  return (
    <Modal title={t('monitoring.errors.detail')} onClose={onClose} closeLabel={t('close')} wide>
      {q.isError ? <ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} /> : !e ? <Skeleton className="h-60" /> : (
        <div className="space-y-4">
          <p className="break-words font-mono text-sm text-ink">{e.message}</p>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-ink-muted">{t('monitoring.errors.cols.status')}</dt>
            <dd><Badge tone={statusTone(e.status)}>{t(`monitoring.errors.status.${e.status}`)}</Badge>
              {e.resolved_at && <span className="ml-2 text-xs text-ink-muted">{t('monitoring.errors.resolvedBy', { who: e.resolved_by_email ?? '—', when: timeAgo(e.resolved_at, lng) })}</span>}</dd>
            <dt className="text-ink-muted">{t('monitoring.errors.cols.source')}</dt><dd className="text-ink">{t(`monitoring.errors.source.${e.source}`, { defaultValue: e.source })}</dd>
            <dt className="text-ink-muted">{t('monitoring.errors.cols.count')}</dt>
            <dd className="text-ink">{t('monitoring.errors.countDetail', { count: e.occurrences, first: new Date(e.first_seen).toLocaleString(lng), last: new Date(e.last_seen).toLocaleString(lng) })}</dd>
            {e.reopened > 0 && <><dt className="text-ink-muted">{t('monitoring.errors.regressed')}</dt><dd className="text-ink">{t('monitoring.errors.reopenedTimes', { count: e.reopened })}</dd></>}
            {e.sample.url && <><dt className="text-ink-muted">{t('monitoring.errors.page')}</dt><dd className="break-all text-ink">{e.sample.url}</dd></>}
            {e.sample.release && <><dt className="text-ink-muted">{t('monitoring.errors.release')}</dt><dd className="text-ink"><code>{e.sample.release}</code></dd></>}
            {e.last_user_id && <><dt className="text-ink-muted">{t('monitoring.errors.lastUser')}</dt><dd className="text-ink"><Link to={`/admin/users/${e.last_user_id}`} className="hover:underline">{e.last_user_email ?? e.last_user_id}</Link></dd></>}
            {e.last_org_id && <><dt className="text-ink-muted">{t('audit.cols.tenant')}</dt><dd className="text-ink"><Link to={`/admin/tenants/${e.last_org_id}`} className="hover:underline">{e.last_org_name ?? e.last_org_id}</Link></dd></>}
          </dl>
          {e.sample.context && Object.keys(e.sample.context).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{t('monitoring.errors.context')}</p>
              <pre className="max-h-32 overflow-auto rounded-lg bg-ink/5 p-3 text-xs text-ink">{JSON.stringify(e.sample.context, null, 2)}</pre>
            </div>
          )}
          {e.sample.stack && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{t('monitoring.errors.stack')}</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink/5 p-3 text-xs text-ink">{e.sample.stack}</pre>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            {e.status !== 'ignored' && <Button variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate('ignored', { onSuccess: onClose })}><EyeOff size={15} aria-hidden /> {t('monitoring.errors.ignore')}</Button>}
            {e.status !== 'open' && <Button variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate('open', { onSuccess: onClose })}><RotateCcw size={15} aria-hidden /> {t('monitoring.errors.reopen')}</Button>}
            {e.status !== 'resolved' && <Button loading={setStatus.isPending} onClick={() => setStatus.mutate('resolved', { onSuccess: onClose })}><CheckCircle2 size={15} aria-hidden /> {t('monitoring.errors.resolve')}</Button>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function WorkflowFailures() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const q = useWorkflowFailures();
  return (
    <Card title={t('monitoring.errors.workflows')} description={t('monitoring.errors.workflowsHint')}>
      {q.isError ? <ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} /> : !q.data ? <Skeleton className="h-20" /> : q.data.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('monitoring.errors.noWorkflowFailures')}</p>
      ) : (
        <ul className="-my-2 divide-y divide-line">
          {q.data.map((w) => (
            <li key={w.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-ink"><span className="font-medium">{w.workflow}</span>
                  {w.org_id && <> · <Link to={`/admin/tenants/${w.org_id}`} className="text-ink-muted hover:underline">{w.org_name}</Link></>}</p>
                {w.error && <p className="break-words text-xs text-ink-muted">{w.error}</p>}
              </div>
              <span className="whitespace-nowrap text-xs text-ink-muted">{timeAgo(w.at, lng)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
