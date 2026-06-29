import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useParts } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import type { Part } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Pill from '../components/ui/Pill';
import BilingualName from '../components/ui/BilingualName';

export default function Parts() {
  const { t, i18n } = useTranslation('parts');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const partsQuery = useParts();
  const [open, setOpen] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['parts', orgId] });

  const addPart = useMutation({
    mutationFn: async (v: {
      en: string;
      vi: string;
      sku: string;
      unit: string;
      stock: number;
      reorder: number;
      cost: number;
    }) => {
      const { error } = await supabase.from('fp_parts').insert({
        org_id: orgId,
        name_i18n: { en: v.en, vi: v.vi || v.en },
        sku: v.sku || null,
        unit: v.unit || null,
        stock_balance: v.stock,
        reorder_level: v.reorder,
        unit_cost: v.cost,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate();
      setOpen(false);
    },
  });

  const restock = useMutation({
    mutationFn: async (v: { id: string; current: number; add: number }) => {
      const { error } = await supabase
        .from('fp_parts')
        .update({ stock_balance: v.current + v.add })
        .eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const parts = partsQuery.data ?? [];

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

      {parts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <Package className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
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
                <PartRow key={p.id} part={p} lng={lng} onRestock={(add) =>
                  restock.mutate({ id: p.id, current: p.stock_balance, add })
                } lowLabel={t('lowStock')} restockLabel={t('restock')} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <PartDialog
          busy={addPart.isPending}
          onCancel={() => setOpen(false)}
          onSubmit={(v) => addPart.mutate(v)}
          t={t}
          cancelLabel={tc('actions.cancel')}
          saveLabel={tc('actions.create')}
        />
      )}
    </div>
  );
}

function PartRow({
  part,
  lng,
  onRestock,
  lowLabel,
  restockLabel,
}: {
  part: Part;
  lng: string;
  onRestock: (add: number) => void;
  lowLabel: string;
  restockLabel: string;
}) {
  const [amount, setAmount] = useState('');
  const low = part.stock_balance <= part.reorder_level;
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-4 py-2 text-ink">{resolveI18n(part.name_i18n, lng)}</td>
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
  );
}

function PartDialog({
  busy,
  onCancel,
  onSubmit,
  t,
  cancelLabel,
  saveLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: {
    en: string;
    vi: string;
    sku: string;
    unit: string;
    stock: number;
    reorder: number;
    cost: number;
  }) => void;
  t: (k: string) => string;
  cancelLabel: string;
  saveLabel: string;
}) {
  const [en, setEn] = useState('');
  const [vi, setVi] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('');
  const [stock, setStock] = useState('0');
  const [reorder, setReorder] = useState('0');
  const [cost, setCost] = useState('0');

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
