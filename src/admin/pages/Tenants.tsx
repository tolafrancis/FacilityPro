import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Pause, Play, Plus, Search } from 'lucide-react';
import { useAdmin } from '../AdminContext';
import DataTable, { type Column, type Sort } from '../components/DataTable';
import TenantFormDialog from '../components/TenantFormDialog';
import { Badge, PageHeader } from '../components/ui';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { notify } from '../../components/Toaster';
import { orgLogoUrl } from '../../lib/orgLogo';
import { resolveI18n } from '../../i18n/resolver';
import { formatMoney, timeAgo } from '../lib/format';
import { downloadCsv, toCsv } from '../lib/csv';
import { TENANT_STATUSES, fetchTenants, rpc, useAdminAction, usePlans, useTenants, type TenantQuery, type TenantRow, type TenantStatus } from '../lib/tenants';
import { tenantStatusTone } from '../lib/tenantStatus';

const PAGE_SIZE = 25;
const SORTS = ['name', 'created_at', 'last_active_at', 'users', 'mrr', 'status', 'plan', 'sites'];

export default function Tenants() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { can } = useAdmin();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const plans = usePlans();

  const q = params.get('q') ?? '';
  const status = (TENANT_STATUSES as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as TenantStatus) : '';
  const plan = params.get('plan') ?? '';
  const sort: Sort = { key: SORTS.includes(params.get('sort') ?? '') ? params.get('sort')! : 'created_at', desc: params.get('dir') !== 'asc' };
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

  // Search box: applied after a short pause.
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search.trim() === q) return;
    const id = setTimeout(() => update({ q: search.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query: TenantQuery = { search: q, status, plan, sort: sort.key, desc: sort.desc, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  const list = useTenants(query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [exporting, setExporting] = useState(false);

  const reactivate = useAdminAction((ids: string[]) => rpc('fp_admin_bulk_suspend', { p_orgs: ids, p_suspend: false }), (ids) => t('tenants.toast.reactivatedMany', { count: ids.length }));

  const planName = (code: string | null) => {
    if (!code) return t('plans.none');
    const p = plans.data?.find((x) => x.code === code);
    return p ? resolveI18n(p.name_i18n, lng) : code;
  };

  const csvColumns = [
    { header: t('tenants.cols.name'), value: (r: TenantRow) => r.name },
    { header: 'ID', value: (r: TenantRow) => r.id },
    { header: t('tenants.cols.plan'), value: (r: TenantRow) => r.plan_code ?? '' },
    { header: t('tenants.cols.status'), value: (r: TenantRow) => t(`tenantStatus.${r.status}`) },
    { header: t('tenants.cols.users'), value: (r: TenantRow) => r.users },
    { header: t('tenants.cols.sites'), value: (r: TenantRow) => r.sites },
    { header: t('tenants.cols.locations'), value: (r: TenantRow) => r.locations },
    { header: t('tenants.cols.mrr'), value: (r: TenantRow) => r.mrr },
    { header: t('tenants.cols.contact'), value: (r: TenantRow) => r.contact_email ?? '' },
    { header: t('tenants.cols.created'), value: (r: TenantRow) => r.created_at },
    { header: t('tenants.cols.lastActive'), value: (r: TenantRow) => r.last_active_at ?? '' },
  ];

  const exportCsv = async (ids?: string[]) => {
    setExporting(true);
    try {
      const all = await fetchTenants({ ...query, limit: 5000, offset: 0, ids });
      downloadCsv(`tenants-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(all.rows, csvColumns));
      notify(t('tenants.toast.exported', { count: all.rows.length }), 'success');
    } catch {
      notify(t('errors.load'), 'error');
    }
    setExporting(false);
  };

  const columns: Column<TenantRow>[] = [
    {
      key: 'name', header: t('tenants.cols.name'), sortKey: 'name', fixed: true,
      cell: (r) => {
        const logo = orgLogoUrl(r.logo_path);
        return (
          <Link to={`/admin/tenants/${r.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
            {logo ? (
              <img src={logo} alt="" className="h-7 w-7 shrink-0 rounded-md border border-line bg-white object-contain" />
            ) : (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand/10 text-xs font-semibold text-brand-600 dark:text-brand">{r.name.slice(0, 1).toUpperCase()}</span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">{r.name}</span>
              {r.subdomain && <span className="block truncate text-xs text-ink-muted">{r.subdomain}.facilitypro.tech</span>}
            </span>
          </Link>
        );
      },
    },
    { key: 'plan', header: t('tenants.cols.plan'), sortKey: 'plan', cell: (r) => <span className="whitespace-nowrap">{planName(r.plan_code)}{r.billing_interval === 'year' && <span className="text-xs text-ink-muted"> · {t('tenants.yearly')}</span>}</span> },
    {
      key: 'status', header: t('tenants.cols.status'), sortKey: 'status',
      cell: (r) => (
        <span className="flex flex-col items-start gap-0.5">
          <Badge tone={tenantStatusTone(r.status)}>{t(`tenantStatus.${r.status}`)}</Badge>
          {r.status === 'trial' && r.trial_ends_at && <span className="text-[11px] text-ink-muted">{t('tenants.trialEnds', { when: timeAgo(r.trial_ends_at, lng) })}</span>}
        </span>
      ),
    },
    { key: 'users', header: t('tenants.cols.users'), sortKey: 'users', align: 'right', cell: (r) => r.users },
    { key: 'sites', header: t('tenants.cols.sites'), sortKey: 'sites', align: 'right', cell: (r) => r.sites },
    { key: 'locations', header: t('tenants.cols.locations'), align: 'right', hiddenByDefault: true, cell: (r) => r.locations },
    { key: 'mrr', header: t('tenants.cols.mrr'), sortKey: 'mrr', align: 'right', cell: (r) => (r.mrr ? formatMoney(r.mrr, 'USD', lng) : <span className="text-ink-muted">—</span>) },
    { key: 'contact', header: t('tenants.cols.contact'), hiddenByDefault: true, cell: (r) => r.contact_email ?? <span className="text-ink-muted">—</span> },
    { key: 'created', header: t('tenants.cols.created'), sortKey: 'created_at', cell: (r) => <span className="whitespace-nowrap">{new Date(r.created_at).toLocaleDateString(lng, { day: 'numeric', month: 'short', year: 'numeric' })}</span> },
    { key: 'active', header: t('tenants.cols.lastActive'), sortKey: 'last_active_at', cell: (r) => <span className="whitespace-nowrap text-ink-muted">{r.last_active_at ? timeAgo(r.last_active_at, lng) : t('tenants.never')}</span> },
  ];

  const sel = [...selected];
  const control = 'h-9 rounded-md border border-line bg-panel px-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t('nav.items.tenants')}
        description={t('tenants.subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => void exportCsv()} loading={exporting}>
              <Download size={16} aria-hidden /> {t('tenants.exportAll')}
            </Button>
            {can('tenants.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} aria-hidden /> {t('tenants.new')}
              </Button>
            )}
          </>
        }
      />

      <DataTable
        id="tenants"
        columns={columns}
        rows={list.data?.rows ?? []}
        rowKey={(r) => r.id}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={(p) => update({ page: p > 1 ? String(p) : null }, false)}
        sort={sort}
        onSort={(s) => update({ sort: s.key, dir: s.desc ? null : 'asc' })}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyTitle={q || status || plan ? t('tenants.noMatches') : t('tenants.empty')}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={
          <>
            <Button variant="secondary" onClick={() => void exportCsv(sel)} loading={exporting}>
              <Download size={15} aria-hidden /> {t('tenants.exportSelected')}
            </Button>
            {can('tenants.manage') && (
              <>
                <Button variant="secondary" onClick={() => setSuspending(true)}>
                  <Pause size={15} aria-hidden /> {t('tenants.actions.suspend')}
                </Button>
                <Button variant="secondary" loading={reactivate.isPending} onClick={() => reactivate.mutate(sel, { onSuccess: () => setSelected(new Set()) })}>
                  <Play size={15} aria-hidden /> {t('tenants.actions.reactivate')}
                </Button>
              </>
            )}
          </>
        }
        toolbar={
          <>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('tenants.searchPlaceholder')}
                aria-label={t('tenants.searchPlaceholder')}
                className={`${control} w-full pl-8`}
              />
            </div>
            <select aria-label={t('tenants.cols.status')} value={status} onChange={(e) => update({ status: e.target.value || null })} className={control}>
              <option value="">{t('tenants.allStatuses')}</option>
              {TENANT_STATUSES.map((s) => <option key={s} value={s}>{t(`tenantStatus.${s}`)}</option>)}
            </select>
            <select aria-label={t('tenants.cols.plan')} value={plan} onChange={(e) => update({ plan: e.target.value || null })} className={control}>
              <option value="">{t('tenants.allPlans')}</option>
              {(plans.data ?? []).map((p) => <option key={p.code} value={p.code}>{resolveI18n(p.name_i18n, lng)}</option>)}
              <option value="none">{t('plans.none')}</option>
            </select>
          </>
        }
      />

      {creating && <TenantFormDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(`/admin/tenants/${id}`)} />}
      {suspending && (
        <SuspendDialog
          count={selected.size}
          onClose={() => setSuspending(false)}
          ids={sel}
          onDone={() => {
            setSuspending(false);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

export function SuspendDialog({ ids, count, onClose, onDone }: { ids: string[]; count: number; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const suspend = useAdminAction(
    (v: { ids: string[]; reason: string }) => rpc('fp_admin_bulk_suspend', { p_orgs: v.ids, p_suspend: true, p_reason: v.reason }),
    t('tenants.toast.suspendedMany', { count }),
  );
  return (
    <Modal title={t('tenants.suspend.title', { count })} onClose={onClose} closeLabel={t('close')}>
      <p className="text-sm text-ink-muted">{t('tenants.suspend.body')}</p>
      <label htmlFor="suspend-reason" className="mb-1 mt-4 block text-sm font-medium text-ink">{t('tenants.suspend.reason')}</label>
      <textarea
        id="suspend-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button
          variant="danger"
          disabled={reason.trim().length < 3}
          loading={suspend.isPending}
          onClick={() => suspend.mutate({ ids, reason: reason.trim() }, { onSuccess: onDone })}
        >
          {t('tenants.actions.suspend')}
        </Button>
      </div>
    </Modal>
  );
}
