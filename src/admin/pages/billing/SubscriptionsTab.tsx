import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, XCircle } from 'lucide-react';
import { useAdmin } from '../../AdminContext';
import DataTable, { type Column, type Sort } from '../../components/DataTable';
import { Badge } from '../../components/ui';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { formatMoney, timeAgo } from '../../lib/format';
import { useAdminAction } from '../../lib/tenants';
import { PROVIDERS, SUB_STATUSES, adminBilling, useSubscriptions, type SubscriptionRow } from '../../lib/billing';
import { control, subStatusTone } from './shared';

const PAGE_SIZE = 25;
const SORTS = ['mrr', 'org', 'period_end', 'status', 'plan'];

export default function SubscriptionsTab() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { can } = useAdmin();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (SUB_STATUSES as readonly string[]).includes(params.get('status') ?? '') ? params.get('status')! : '';
  const provider = (PROVIDERS as readonly string[]).includes(params.get('provider') ?? '') ? params.get('provider')! : '';
  const sort: Sort = { key: SORTS.includes(params.get('sort') ?? '') ? params.get('sort')! : 'mrr', desc: params.get('dir') !== 'asc' };
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
  const list = useSubscriptions({ search: q, status, provider, sort: sort.key, desc: sort.desc, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const [cancelling, setCancelling] = useState<SubscriptionRow | null>(null);

  const columns: Column<SubscriptionRow>[] = [
    { key: 'org', header: t('billing.cols.tenant'), sortKey: 'org', fixed: true, cell: (r) => <Link to={`/admin/tenants/${r.org_id}?tab=billing`} className="font-medium hover:underline">{r.org_name}</Link> },
    { key: 'plan', header: t('billing.cols.plan'), sortKey: 'plan', cell: (r) => <span className="whitespace-nowrap">{t(`plans.${r.plan_code}`, { defaultValue: r.plan_code ?? '—' })}{r.billing_interval === 'year' && <span className="text-xs text-ink-muted"> · {t('tenants.yearly')}</span>}</span> },
    {
      key: 'status', header: t('billing.cols.status'), sortKey: 'status',
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          <Badge tone={subStatusTone(r.status)}>{t(`subStatus.${r.status}`, { defaultValue: r.status })}</Badge>
          {r.cancel_at_period_end && r.status !== 'canceled' && <Badge tone="warn">{t('billing.endsAtPeriodEnd')}</Badge>}
          {r.requested_plan_code && <Badge tone="info">{t('billing.requested', { plan: t(`plans.${r.requested_plan_code}`, { defaultValue: r.requested_plan_code }) })}</Badge>}
        </span>
      ),
    },
    { key: 'provider', header: t('billing.provider'), cell: (r) => t(`providers.${r.provider}`, { defaultValue: r.provider }) },
    {
      key: 'period', header: t('billing.cols.renews'), sortKey: 'period_end',
      cell: (r) => {
        const end = r.status === 'trialing' ? r.trial_ends_at ?? r.current_period_end : r.current_period_end;
        return <span className="whitespace-nowrap text-ink-muted">{end ? `${new Date(end).toLocaleDateString(lng)} (${timeAgo(end, lng)})` : '—'}</span>;
      },
    },
    { key: 'mrr', header: t('billing.kpi.mrr'), sortKey: 'mrr', align: 'right', cell: (r) => (r.mrr ? formatMoney(r.mrr, 'USD', lng) : <span className="text-ink-muted">—</span>) },
    { key: 'ref', header: t('billing.cols.reference'), hiddenByDefault: true, cell: (r) => <code className="text-xs">{r.provider_subscription_id ?? '—'}</code> },
    {
      key: 'actions', header: '', fixed: true,
      cell: (r) =>
        can('billing.manage') && r.provider !== 'manual' && r.provider_subscription_id && ['active', 'trialing', 'past_due'].includes(r.status) ? (
          <button type="button" onClick={() => setCancelling(r)} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-status-crit">
            <XCircle size={14} aria-hidden /> {t('billing.cancelSub')}
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <DataTable
        id="subscriptions"
        columns={columns}
        rows={list.data?.rows ?? []}
        rowKey={(r) => r.org_id}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={(p) => update({ page: p > 1 ? String(p) : null }, false)}
        sort={sort}
        onSort={(s) => update({ sort: s.key, dir: s.desc ? null : 'asc' })}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyTitle={t('billing.noSubscriptions')}
        toolbar={
          <>
            <div className="relative w-full sm:w-60">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('billing.searchSubs')} aria-label={t('billing.searchSubs')} className={`${control} w-full pl-8`} />
            </div>
            <select aria-label={t('billing.cols.status')} value={status} onChange={(e) => update({ status: e.target.value || null })} className={control}>
              <option value="">{t('tenants.allStatuses')}</option>
              {SUB_STATUSES.map((s) => <option key={s} value={s}>{t(`subStatus.${s}`)}</option>)}
            </select>
            <select aria-label={t('billing.provider')} value={provider} onChange={(e) => update({ provider: e.target.value || null })} className={control}>
              <option value="">{t('billing.allProviders')}</option>
              {PROVIDERS.map((s) => <option key={s} value={s}>{t(`providers.${s}`)}</option>)}
            </select>
          </>
        }
      />
      {cancelling && <CancelDialog sub={cancelling} onClose={() => setCancelling(null)} />}
    </>
  );
}

function CancelDialog({ sub, onClose }: { sub: SubscriptionRow; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const [atEnd, setAtEnd] = useState(true);
  const stripe = sub.provider === 'stripe';
  const cancel = useAdminAction(
    () => adminBilling({ action: 'cancel', org_id: sub.org_id, at_period_end: stripe ? atEnd : false, reason: reason.trim() }),
    t('billing.toast.cancelled'),
  );
  return (
    <Modal title={t('billing.cancelTitle', { name: sub.org_name })} onClose={onClose} closeLabel={t('close')}>
      <p className="text-sm text-ink-muted">{stripe ? t('billing.cancelStripe') : t('billing.cancelPaypal')}</p>
      {stripe && (
        <fieldset className="mt-4 space-y-2 text-sm text-ink">
          <label className="flex items-center gap-2"><input type="radio" checked={atEnd} onChange={() => setAtEnd(true)} className="accent-[#E8552D]" /> {t('billing.cancelAtEnd')}</label>
          <label className="flex items-center gap-2"><input type="radio" checked={!atEnd} onChange={() => setAtEnd(false)} className="accent-[#E8552D]" /> {t('billing.cancelNow')}</label>
        </fieldset>
      )}
      <label htmlFor="cs-reason" className="mb-1 mt-4 block text-sm font-medium text-ink">{t('user.ban.reason')}</label>
      <textarea id="cs-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button variant="danger" disabled={reason.trim().length < 3} loading={cancel.isPending} onClick={() => cancel.mutate(undefined, { onSuccess: onClose })}>
          <XCircle size={15} aria-hidden /> {t('billing.cancelSub')}
        </Button>
      </div>
    </Modal>
  );
}
