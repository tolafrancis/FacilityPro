import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useInventoryTransactions, useOrgMembers, usePartCategories, usePartsPage, useVendors } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate } from '../lib/ui';
import type { Part } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import BilingualName from '../components/ui/BilingualName';
import SearchSelect from '../components/ui/SearchSelect';
import Pagination from '../components/ui/Pagination';

const PAGE_SIZE = 25;

export default function Parts() {
  const { t, i18n } = useTranslation('parts');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const vendorsQuery = useVendors();
  const categoriesQuery = usePartCategories();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [page, setPage] = useState(1);

  const partsQuery = usePartsPage(page, PAGE_SIZE, { categoryId: filterCategoryId || undefined });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['parts', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['parts_page'] });
  };

  const addPart = useMutation({
    mutationFn: async (v: {
      en: string;
      vi: string;
      sku: string;
      unit: string;
      stock: number;
      reorder: number;
      cost: number;
      vendorId: string;
      categoryId: string;
    }) => {
      const { error } = await supabase.from('fp_parts').insert({
        org_id: orgId,
        name_i18n: { en: v.en, vi: v.vi || v.en },
        sku: v.sku || null,
        unit: v.unit || null,
        stock_balance: v.stock,
        reorder_level: v.reorder,
        unit_cost: v.cost,
        preferred_vendor_id: v.vendorId || null,
        category_id: v.categoryId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate();
      setOpen(false);
    },
  });

  const createCategory = async (name: string): Promise<string | null> => {
    const nm = name.trim();
    if (!nm || !orgId) return null;
    const { data, error } = await supabase
      .from('fp_part_categories')
      .insert({ org_id: orgId, name_i18n: { en: nm, vi: nm } })
      .select('id')
      .single();
    if (error) return null;
    await queryClient.invalidateQueries({ queryKey: ['part_categories', orgId] });
    return data.id as string;
  };

  // Restocking records a reason in the inventory ledger — the ledger's own
  // trigger applies the balance change, so fp_parts.stock_balance is never
  // written to directly from the app.
  const restock = useMutation({
    mutationFn: async (v: { partId: string; add: number }) => {
      if (!orgId) return;
      const { error } = await supabase.from('fp_inventory_transactions').insert({
        org_id: orgId,
        part_id: v.partId,
        type: 'adjustment',
        quantity_delta: v.add,
      });
      if (error) throw error;
    },
    onSuccess: (_data, v) => {
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ['inventory_transactions', v.partId] });
    },
  });

  const parts = partsQuery.data?.rows ?? [];
  const total = partsQuery.data?.count ?? 0;
  const vendorName = (id: string | null) => vendorsQuery.data?.find((v) => v.id === id)?.name ?? null;
  const categoryName = (id: string | null) =>
    id ? resolveI18n(categoriesQuery.data?.find((c) => c.id === id)?.name_i18n, lng) : null;

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> {t('add')}
        </Button>
      </div>

      <div className="mt-5 min-w-[180px]">
        <label className="mb-1 block text-xs text-ink-muted">{t('dialog.category')}</label>
        <Select
          value={filterCategoryId}
          onChange={(e) => {
            setFilterCategoryId(e.target.value);
            setPage(1);
          }}
          className="w-56"
        >
          <option value="">{tc('common.all')}</option>
          {(categoriesQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{resolveI18n(c.name_i18n, lng)}</option>
          ))}
        </Select>
      </div>

      {parts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <Package className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2" />
                <th className="px-4 py-2 font-medium">{t('columns.name')}</th>
                <th className="px-4 py-2 font-medium">{t('columns.sku')}</th>
                <th className="px-4 py-2 font-medium">{t('columns.stock')}</th>
                <th className="px-4 py-2 font-medium">{t('columns.reorder')}</th>
                <th className="px-4 py-2 font-medium">{t('columns.cost')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <PartRow
                  key={p.id}
                  part={p}
                  lng={lng}
                  vendorName={vendorName(p.preferred_vendor_id)}
                  categoryName={categoryName(p.category_id)}
                  expanded={expanded === p.id}
                  onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                  onRestock={(add) => restock.mutate({ partId: p.id, add })}
                  lowLabel={t('lowStock')}
                  restockLabel={t('restock')}
                  historyLabel={t('history.title')}
                  historyEmptyLabel={t('history.empty')}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        summary={(p, tp, tt) => tc('pagination.summary', { page: p, totalPages: tp, total: tt })}
        prevLabel={tc('pagination.prev')}
        nextLabel={tc('pagination.next')}
      />

      {open && (
        <PartDialog
          busy={addPart.isPending}
          vendors={vendorsQuery.data ?? []}
          categoryOptions={(categoriesQuery.data ?? []).map((c) => ({ id: c.id, label: resolveI18n(c.name_i18n, lng) }))}
          onCreateCategory={createCategory}
          onCancel={() => setOpen(false)}
          onSubmit={(v) => addPart.mutate(v)}
          t={t}
          cancelLabel={tc('actions.cancel')}
          saveLabel={tc('actions.create')}
          noneLabel={tc('common.none')}
        />
      )}
    </div>
  );
}

function PartRow({
  part,
  lng,
  vendorName,
  categoryName,
  expanded,
  onToggle,
  onRestock,
  lowLabel,
  restockLabel,
  historyLabel,
  historyEmptyLabel,
}: {
  part: Part;
  lng: string;
  vendorName: string | null;
  categoryName: string | null;
  expanded: boolean;
  onToggle: () => void;
  onRestock: (add: number) => void;
  lowLabel: string;
  restockLabel: string;
  historyLabel: string;
  historyEmptyLabel: string;
}) {
  const [amount, setAmount] = useState('');
  const low = part.stock_balance <= part.reorder_level;
  const meta = [vendorName, categoryName].filter(Boolean).join(' · ');
  return (
    <>
      <tr className="border-b border-line last:border-0">
        <td className="px-4 py-2">
          <button
            type="button"
            onClick={onToggle}
            className="text-ink-muted hover:text-ink"
            aria-label={historyLabel}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        </td>
        <td className="px-4 py-2 text-ink">
          {resolveI18n(part.name_i18n, lng)}
          {meta && <span className="block text-xs text-ink-muted">{meta}</span>}
        </td>
        <td className="px-4 py-2 text-ink-muted">{part.sku ?? '—'}</td>
        <td className="px-4 py-2">
          <span className="text-ink">
            {part.stock_balance}
            {part.unit ? ` ${part.unit}` : ''}
          </span>
          {low && <Pill className="ml-2 bg-status-crit/10 text-status-crit">{lowLabel}</Pill>}
        </td>
        <td className="px-4 py-2 text-ink-muted">{part.reorder_level}</td>
        <td className="px-4 py-2 text-ink-muted">{part.unit_cost}</td>
        <td className="px-4 py-2">
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-16 rounded-md border border-line px-2 py-1 text-sm"
              placeholder="0"
            />
            <button
              type="button"
              onClick={() => {
                const n = parseFloat(amount);
                if (n > 0) {
                  onRestock(n);
                  setAmount('');
                }
              }}
              className="rounded-md border border-line px-2 py-1 text-xs font-medium text-brand hover:bg-surface"
            >
              {restockLabel}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line bg-surface last:border-0">
          <td />
          <td colSpan={6} className="px-4 py-3">
            <TransactionHistory partId={part.id} title={historyLabel} emptyLabel={historyEmptyLabel} />
          </td>
        </tr>
      )}
    </>
  );
}

function TransactionHistory({ partId, title, emptyLabel }: { partId: string; title: string; emptyLabel: string }) {
  const { i18n } = useTranslation();
  const { t: tp } = useTranslation('parts');
  const lng = i18n.resolvedLanguage ?? 'en';
  const txQuery = useInventoryTransactions(partId);
  const members = useOrgMembers();
  const rows = txQuery.data ?? [];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((row) => {
            const who = row.created_by
              ? members.data?.find((m) => m.user_id === row.created_by)?.email
              : null;
            return (
              <li key={row.id} className="flex items-center justify-between gap-3 text-ink">
                <span className="flex items-center gap-2">
                  <Pill className="bg-surface text-ink-muted">{tp(`history.types.${row.type}`)}</Pill>
                  {who && <span className="text-xs text-ink-muted">{who}</span>}
                </span>
                <span className="flex items-center gap-3 text-xs text-ink-muted">
                  <span className={row.quantity_delta < 0 ? 'text-status-crit' : 'text-status-ok'}>
                    {row.quantity_delta > 0 ? '+' : ''}
                    {row.quantity_delta}
                  </span>
                  <span>{formatDate(row.created_at, lng)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PartDialog({
  busy,
  vendors,
  categoryOptions,
  onCreateCategory,
  onCancel,
  onSubmit,
  t,
  cancelLabel,
  saveLabel,
  noneLabel,
}: {
  busy: boolean;
  vendors: { id: string; name: string }[];
  categoryOptions: { id: string; label: string }[];
  onCreateCategory: (name: string) => Promise<string | null>;
  onCancel: () => void;
  onSubmit: (v: {
    en: string;
    vi: string;
    sku: string;
    unit: string;
    stock: number;
    reorder: number;
    cost: number;
    vendorId: string;
    categoryId: string;
  }) => void;
  t: (k: string) => string;
  cancelLabel: string;
  saveLabel: string;
  noneLabel: string;
}) {
  const [en, setEn] = useState('');
  const [vi, setVi] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('');
  const [stock, setStock] = useState('0');
  const [reorder, setReorder] = useState('0');
  const [cost, setCost] = useState('0');
  const [vendorId, setVendorId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    onSubmit({
      en,
      vi,
      sku,
      unit,
      stock: parseFloat(stock) || 0,
      reorder: parseFloat(reorder) || 0,
      cost: parseFloat(cost) || 0,
      vendorId,
      categoryId,
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{t('dialog.title')}</h2>
        <div className="mt-4 space-y-4">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('dialog.sku')}</label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('dialog.unit')}</label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('dialog.category')}</label>
              <SearchSelect
                value={categoryId}
                onChange={setCategoryId}
                options={categoryOptions}
                placeholder={t('dialog.categoryPlaceholder')}
                emptyLabel={noneLabel}
                createLabel={t('dialog.createCategory')}
                onCreate={async (q) => {
                  const id = await onCreateCategory(q);
                  if (id) setCategoryId(id);
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('dialog.vendor')}</label>
              <SearchSelect
                value={vendorId}
                onChange={setVendorId}
                options={vendors.map((v) => ({ id: v.id, label: v.name }))}
                placeholder={t('dialog.vendorPlaceholder')}
                emptyLabel={noneLabel}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                {t('dialog.initialStock')}
              </label>
              <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                {t('dialog.reorder')}
              </label>
              <Input type="number" value={reorder} onChange={(e) => setReorder(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('dialog.cost')}</label>
              <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="submit" loading={busy}>
            {saveLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
