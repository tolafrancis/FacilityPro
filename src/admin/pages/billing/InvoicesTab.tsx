import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ban, CheckCircle2, Download, ExternalLink, Plus, RotateCcw, Search } from 'lucide-react';
import { useAdmin } from '../../AdminContext';
import DataTable, { type Column, type Sort } from '../../components/DataTable';
import { Badge, Skeleton } from '../../components/ui';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { notify } from '../../../components/Toaster';
import { formatMoney } from '../../lib/format';
import { downloadCsv, toCsv } from '../../lib/csv';
import { CURRENCIES, fetchTenants, rpc, useAdminAction, usePlans } from '../../lib/tenants';
import { INVOICE_STATUSES, PROVIDERS, adminBilling, fetchInvoices, useInvoice, useInvoices, type InvoiceQuery, type InvoiceRow } from '../../lib/billing';
import { resolveI18n } from '../../../i18n/resolver';
import { Field, control, invoiceStatusTone } from './shared';

const PAGE_SIZE = 25;
const SORTS = ['issued_at', 'amount', 'number', 'org', 'status', 'paid_at'];

export default function InvoicesTab() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { can } = useAdmin();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (INVOICE_STATUSES as readonly string[]).includes(params.get('status') ?? '') ? params.get('status')! : '';
  const provider = (PROVIDERS as readonly string[]).includes(params.get('provider') ?? '') ? params.get('provider')! : '';
  const sort: Sort = { key: SORTS.includes(params.get('sort') ?? '') ? params.get('sort')! : 'issued_at', desc: params.get('dir') !== 'asc' };
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

  const query: InvoiceQuery = { search: q, status, provider, sort: sort.key, desc: sort.desc, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  const list = useInvoices(query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(lng, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  const exportCsv = async (ids?: string[]) => {
    setExporting(true);
    try {
      const all = await fetchInvoices({ ...query, limit: 5000, offset: 0, ids });
      downloadCsv(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(all.rows, [
        { header: t('billing.cols.number'), value: (r) => r.number },
        { header: t('billing.cols.tenant'), value: (r) => r.org_name },
        { header: t('billing.cols.amount'), value: (r) => r.amount },
        { header: t('billing.cols.currency'), value: (r) => r.currency },
        { header: t('billing.cols.refunded'), value: (r) => r.refunded_amount },
        { header: t('billing.cols.status'), value: (r) => t(`invoiceStatus.${r.status}`) },
        { header: t('billing.provider'), value: (r) => t(`providers.${r.provider}`) },
        { header: t('billing.cols.plan'), value: (r) => r.plan_code ?? '' },
        { header: t('billing.cols.issued'), value: (r) => r.issued_at },
        { header: t('billing.cols.paid'), value: (r) => r.paid_at ?? '' },
        { header: t('billing.cols.reference'), value: (r) => r.provider_ref ?? '' },
      ]));
      notify(t('billing.toast.exported', { count: all.rows.length }), 'success');
    } catch {
      notify(t('errors.load'), 'error');
    }
    setExporting(false);
  };

  const columns: Column<InvoiceRow>[] = [
    {
      key: 'number', header: t('billing.cols.number'), sortKey: 'number', fixed: true,
      cell: (r) => (
        <button type="button" onClick={() => setOpen(r.id)} className="font-medium text-ink hover:underline">{r.number}</button>
      ),
    },
    { key: 'org', header: t('billing.cols.tenant'), sortKey: 'org', cell: (r) => <Link to={`/admin/tenants/${r.org_id}?tab=billing`} className="hover:underline">{r.org_name}</Link> },
    {
      key: 'amount', header: t('billing.cols.amount'), sortKey: 'amount', align: 'right',
      cell: (r) => (
        <span className="whitespace-nowrap">
          {formatMoney(r.amount, r.currency, lng)}
          {r.refunded_amount > 0 && r.status !== 'refunded' && <span className="block text-[11px] text-ink-muted">−{formatMoney(r.refunded_amount, r.currency, lng)}</span>}
        </span>
      ),
    },
    { key: 'status', header: t('billing.cols.status'), sortKey: 'status', cell: (r) => <Badge tone={invoiceStatusTone(r.status)}>{t(`invoiceStatus.${r.status}`)}</Badge> },
    { key: 'provider', header: t('billing.provider'), cell: (r) => t(`providers.${r.provider}`) },
    { key: 'issued', header: t('billing.cols.issued'), sortKey: 'issued_at', cell: (r) => <span className="whitespace-nowrap">{date(r.issued_at)}</span> },
    { key: 'paid', header: t('billing.cols.paid'), sortKey: 'paid_at', cell: (r) => <span className="whitespace-nowrap text-ink-muted">{date(r.paid_at)}</span> },
    { key: 'plan', header: t('billing.cols.plan'), hiddenByDefault: true, cell: (r) => r.plan_code ?? '—' },
    { key: 'ref', header: t('billing.cols.reference'), hiddenByDefault: true, cell: (r) => <code className="text-xs">{r.provider_ref ?? '—'}</code> },
  ];

  return (
    <>
      <DataTable
        id="invoices"
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
        emptyTitle={q || status || provider ? t('billing.noMatches') : t('billing.noInvoices')}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={
          <Button variant="secondary" onClick={() => void exportCsv([...selected])} loading={exporting}>
            <Download size={15} aria-hidden /> {t('users.exportSelected')}
          </Button>
        }
        toolbar={
          <>
            <div className="relative w-full sm:w-60">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('billing.searchInvoices')} aria-label={t('billing.searchInvoices')} className={`${control} w-full pl-8`} />
            </div>
            <select aria-label={t('billing.cols.status')} value={status} onChange={(e) => update({ status: e.target.value || null })} className={control}>
              <option value="">{t('tenants.allStatuses')}</option>
              {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{t(`invoiceStatus.${s}`)}</option>)}
            </select>
            <select aria-label={t('billing.provider')} value={provider} onChange={(e) => update({ provider: e.target.value || null })} className={control}>
              <option value="">{t('billing.allProviders')}</option>
              {PROVIDERS.map((s) => <option key={s} value={s}>{t(`providers.${s}`)}</option>)}
            </select>
            <span className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={() => void exportCsv()} loading={exporting}><Download size={15} aria-hidden /> {t('users.exportAll')}</Button>
              {can('billing.manage') && <Button onClick={() => setCreating(true)}><Plus size={15} aria-hidden /> {t('billing.newInvoice')}</Button>}
            </span>
          </>
        }
      />
      {list.data && list.data.total > 0 && (
        <p className="mt-2 text-right text-xs text-ink-muted">{t('billing.sumShown', { value: formatMoney(list.data.sum, 'USD', lng) })}</p>
      )}
      {open && <InvoiceDialog id={open} onClose={() => setOpen(null)} />}
      {creating && <NewInvoiceDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
    </>
  );
}

function InvoiceDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { can } = useAdmin();
  const q = useInvoice(id);
  const inv = q.data;
  const [mode, setMode] = useState<null | 'refund' | 'void'>(null);
  const markPaid = useAdminAction(() => rpc('fp_admin_mark_invoice_paid', { p_id: id }), t('billing.toast.markedPaid'));
  const manage = can('billing.manage');
  const money = (v: number) => formatMoney(v, inv?.currency ?? 'USD', lng);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lng) : '—');

  return (
    <Modal title={inv ? t('billing.invoiceTitle', { number: inv.number }) : t('loading')} onClose={onClose} closeLabel={t('close')} wide>
      {!inv ? (
        <Skeleton className="h-48" />
      ) : mode === 'refund' ? (
        <RefundForm invoice={inv} onDone={() => setMode(null)} />
      ) : mode === 'void' ? (
        <VoidForm id={inv.id} onDone={() => setMode(null)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-2xl font-semibold tabular-nums text-ink">{money(inv.amount)}</p>
            <Badge tone={invoiceStatusTone(inv.status)}>{t(`invoiceStatus.${inv.status}`)}</Badge>
            <Badge>{t(`providers.${inv.provider}`)}</Badge>
          </div>
          <dl className="mt-4 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-muted">{t('billing.cols.tenant')}</dt><dd><Link to={`/admin/tenants/${inv.org_id}?tab=billing`} className="text-ink hover:underline" onClick={onClose}>{inv.org_name}</Link></dd>
            {inv.description && <><dt className="text-ink-muted">{t('billing.description')}</dt><dd className="text-ink">{inv.description}</dd></>}
            <dt className="text-ink-muted">{t('billing.cols.plan')}</dt><dd className="text-ink">{inv.plan_code ?? '—'}</dd>
            <dt className="text-ink-muted">{t('billing.period')}</dt><dd className="text-ink">{inv.period_start ? `${new Date(inv.period_start).toLocaleDateString(lng)} – ${inv.period_end ? new Date(inv.period_end).toLocaleDateString(lng) : ''}` : '—'}</dd>
            <dt className="text-ink-muted">{t('billing.cols.issued')}</dt><dd className="text-ink">{when(inv.issued_at)}</dd>
            {inv.due_at && <><dt className="text-ink-muted">{t('billing.due')}</dt><dd className="text-ink">{when(inv.due_at)}</dd></>}
            <dt className="text-ink-muted">{t('billing.cols.paid')}</dt><dd className="text-ink">{when(inv.paid_at)}</dd>
            {inv.failed_at && <><dt className="text-ink-muted">{t('billing.failedAt')}</dt><dd className="text-ink">{when(inv.failed_at)} · {t('billing.attempts', { count: inv.attempts })}</dd></>}
            {inv.coupon_code && <><dt className="text-ink-muted">{t('billing.coupon')}</dt><dd className="text-ink">{inv.coupon_code}</dd></>}
            {inv.provider_ref && <><dt className="text-ink-muted">{t('billing.cols.reference')}</dt><dd><code className="break-all text-xs">{inv.provider_ref}</code></dd></>}
            {inv.void_reason && <><dt className="text-ink-muted">{t('billing.voidReason')}</dt><dd className="text-ink">{inv.void_reason}</dd></>}
          </dl>
          {inv.refunds.length > 0 && (
            <div className="mt-4 rounded-lg border border-line p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{t('billing.refunds')}</p>
              <ul className="space-y-1 text-sm">
                {inv.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2">
                    <span className="text-ink">{money(r.amount)}{r.reason && <span className="text-ink-muted"> · {r.reason}</span>}</span>
                    <span className="text-xs text-ink-muted">{new Date(r.at).toLocaleDateString(lng)}{r.by && ` · ${r.by}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {inv.hosted_url && (
              <a href={inv.hosted_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink hover:bg-ink/5">
                <ExternalLink size={15} aria-hidden /> {t('billing.viewAtProvider')}
              </a>
            )}
            {manage && inv.provider === 'manual' && ['open', 'failed', 'draft'].includes(inv.status) && (
              <>
                <Button variant="secondary" onClick={() => setMode('void')}><Ban size={15} aria-hidden /> {t('billing.void')}</Button>
                <Button onClick={() => markPaid.mutate(undefined)} loading={markPaid.isPending}><CheckCircle2 size={15} aria-hidden /> {t('billing.markPaid')}</Button>
              </>
            )}
            {manage && ['paid', 'refunded'].includes(inv.status) && inv.refunded_amount < inv.amount && (
              <Button variant="secondary" onClick={() => setMode('refund')}><RotateCcw size={15} aria-hidden /> {t('billing.refund')}</Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function RefundForm({ invoice, onDone }: { invoice: { id: string; amount: number; refunded_amount: number; currency: string; provider: string }; onDone: () => void }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const left = Math.round((invoice.amount - invoice.refunded_amount) * 100) / 100;
  const [amount, setAmount] = useState(String(left));
  const [reason, setReason] = useState('');
  const value = Number(amount);
  const valid = value > 0 && value <= left && reason.trim().length >= 3;
  const refund = useAdminAction(
    () => (invoice.provider === 'manual'
      ? rpc('fp_admin_refund_manual', { p_id: invoice.id, p_amount: value, p_reason: reason.trim() })
      : adminBilling({ action: 'refund', invoice_id: invoice.id, amount: value, reason: reason.trim() })),
    t('billing.toast.refunded'),
  );
  return (
    <div>
      <p className="text-sm text-ink-muted">
        {invoice.provider === 'manual' ? t('billing.refundManual') : t('billing.refundProvider', { provider: t(`providers.${invoice.provider}`) })}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field id="rf-amount" label={t('billing.refundAmount')} hint={t('billing.refundLeft', { value: formatMoney(left, invoice.currency, lng) })}>
          <Input id="rf-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <Field id="rf-reason" label={t('user.ban.reason')} className="mt-3">
        <textarea id="rf-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>{t('cancel')}</Button>
        <Button variant="danger" disabled={!valid} loading={refund.isPending} onClick={() => refund.mutate(undefined, { onSuccess: onDone })}>
          <RotateCcw size={15} aria-hidden /> {t('billing.refundConfirm', { value: formatMoney(value || 0, invoice.currency, lng) })}
        </Button>
      </div>
    </div>
  );
}

function VoidForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const voidIt = useAdminAction(() => rpc('fp_admin_void_invoice', { p_id: id, p_reason: reason.trim() }), t('billing.toast.voided'));
  return (
    <div>
      <p className="text-sm text-ink-muted">{t('billing.voidBody')}</p>
      <Field id="void-reason" label={t('user.ban.reason')} className="mt-4">
        <textarea id="void-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>{t('cancel')}</Button>
        <Button variant="danger" disabled={reason.trim().length < 3} loading={voidIt.isPending} onClick={() => voidIt.mutate(undefined, { onSuccess: onDone })}>
          <Ban size={15} aria-hidden /> {t('billing.void')}
        </Button>
      </div>
    </div>
  );
}

function NewInvoiceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const plans = usePlans();
  const [tenantQuery, setTenantQuery] = useState('');
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [plan, setPlan] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('14');
  const [status, setStatus] = useState<'open' | 'paid'>('open');
  const [coupon, setCoupon] = useState('');

  useEffect(() => {
    if (org || tenantQuery.trim().length < 2) {
      setTenants([]);
      return;
    }
    const id = setTimeout(() => {
      fetchTenants({ search: tenantQuery.trim(), sort: 'name', desc: false, limit: 8, offset: 0 })
        .then((r) => setTenants(r.rows.map((x) => ({ id: x.id, name: x.name }))))
        .catch(() => setTenants([]));
    }, 250);
    return () => clearTimeout(id);
  }, [tenantQuery, org]);

  const create = useAdminAction(
    () => rpc<string>('fp_admin_create_invoice', {
      p: { org_id: org?.id, plan_code: plan || null, amount: Number(amount), currency, description, due_days: Number(due), status, coupon_code: coupon || null },
    }),
    t('billing.toast.created'),
  );
  const valid = !!org && Number(amount) > 0;

  return (
    <Modal title={t('billing.newInvoice')} onClose={onClose} closeLabel={t('close')} wide>
      <div className="space-y-3">
        <Field id="ni-org" label={t('billing.cols.tenant')}>
          {org ? (
            <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
              <span className="text-ink">{org.name}</span>
              <button type="button" onClick={() => { setOrg(null); setTenantQuery(''); }} className="text-xs text-ink-muted underline">{t('billing.change')}</button>
            </div>
          ) : (
            <div className="relative">
              <Input id="ni-org" value={tenantQuery} onChange={(e) => setTenantQuery(e.target.value)} placeholder={t('billing.findTenant')} autoComplete="off" />
              {tenants.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-panel p-1 shadow-lg">
                  {tenants.map((x) => (
                    <li key={x.id}>
                      <button type="button" onClick={() => { setOrg(x); setTenants([]); }} className="w-full rounded-md px-3 py-1.5 text-left text-sm text-ink hover:bg-ink/5">{x.name}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="ni-amount" label={t('billing.cols.amount')}>
            <Input id="ni-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field id="ni-cur" label={t('billing.cols.currency')}>
            <Select id="ni-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field id="ni-plan" label={t('billing.cols.plan')}>
            <Select id="ni-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="">—</option>
              {(plans.data ?? []).map((p) => <option key={p.code} value={p.code}>{resolveI18n(p.name_i18n, lng)}</option>)}
            </Select>
          </Field>
        </div>
        <Field id="ni-desc" label={t('billing.description')}>
          <Input id="ni-desc" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder={t('billing.descriptionPlaceholder')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="ni-due" label={t('billing.dueIn')}>
            <Select id="ni-due" value={due} onChange={(e) => setDue(e.target.value)}>
              {['0', '7', '14', '30', '60'].map((d) => <option key={d} value={d}>{t('user.ban.days', { count: Number(d) })}</option>)}
            </Select>
          </Field>
          <Field id="ni-status" label={t('billing.cols.status')}>
            <Select id="ni-status" value={status} onChange={(e) => setStatus(e.target.value as 'open' | 'paid')}>
              <option value="open">{t('billing.statusOpen')}</option>
              <option value="paid">{t('billing.statusPaid')}</option>
            </Select>
          </Field>
          <Field id="ni-coupon" label={t('billing.coupon')}>
            <Input id="ni-coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="LAUNCH20" />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button disabled={!valid} loading={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: (id) => onCreated(id as string) })}>
          <Plus size={15} aria-hidden /> {t('billing.createInvoice')}
        </Button>
      </div>
    </Modal>
  );
}
