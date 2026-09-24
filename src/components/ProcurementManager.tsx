import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ChevronDown, ChevronRight, FileWarning, PackageCheck, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMoney } from '../lib/useMoney';
import { useOrg } from '../contexts/OrgContext';
import {
  useCostCenters,
  useParts,
  useProcurementLines,
  useProcurementOrders,
  useProcurementReceiptLines,
  useVendorInvoices,
  useVendors,
} from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDateOnly, friendlyError } from '../lib/ui';
import type {
  CostCenter,
  ProcurementLine,
  ProcurementOrder,
  ProcurementReceiptLine,
  ProcurementStatus,
  Vendor,
} from '../lib/database.types';
import Button from './ui/Button';
import Input from './ui/Input';
import Pill from './ui/Pill';
import SearchSelect from './ui/SearchSelect';


const STATUSES: ProcurementStatus[] = ['rfq', 'po', 'received', 'approved'];

interface MatchResult {
  amountMatches: boolean;
  fullyReceived: boolean;
}

/**
 * The three-way match: does the vendor's invoice agree with what was
 * ordered (the PO's live line-item total) and what actually arrived (every
 * part-backed line fully received)? A line with no part_id is a service —
 * there's nothing physical to receive, so it's treated as satisfied.
 */
function matchInvoice(
  invoiceAmount: number,
  poAmount: number,
  lines: ProcurementLine[],
  receiptLines: ProcurementReceiptLine[]
): MatchResult {
  const receivedFor = (lineId: string) =>
    receiptLines.filter((r) => r.procurement_line_id === lineId).reduce((sum, r) => sum + r.quantity_received, 0);
  const fullyReceived = lines.every((l) => !l.part_id || receivedFor(l.id) >= l.quantity);
  const amountMatches = Math.abs(invoiceAmount - poAmount) < 0.01;
  return { amountMatches, fullyReceived };
}

interface OrderForm {
  title: string;
  vendorId: string;
  costCenterId: string;
  notes: string;
}

const EMPTY_FORM: OrderForm = { title: '', vendorId: '', costCenterId: '', notes: '' };

/**
 * Replaces the old flat "Procurement" card: a real requisition → PO → receipt
 * flow. A PO selects an existing vendor (SearchSelect over fp_vendors, not a
 * text field), carries line items against the parts catalog, and receiving a
 * line posts into the inventory ledger so stock actually updates.
 */
export default function ProcurementManager() {
  const { t } = useTranslation('financial');
  const { t: tc } = useTranslation('common');
  const currency = useMoney();
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const ordersQuery = useProcurementOrders();
  const vendorsQuery = useVendors();
  const costCentersQuery = useCostCenters();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<OrderForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const createOrder = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.title) return;
      const { data: poNumber, error: seqErr } = await supabase.rpc('fp_next_po_number', { p_org: orgId });
      if (seqErr) throw seqErr;
      const { error: insErr } = await supabase.from('fp_finance_procurement').insert({
        org_id: orgId,
        title: form.title,
        vendor_id: form.vendorId || null,
        cost_center_id: form.costCenterId || null,
        notes: form.notes || null,
        po_number: poNumber,
        status: 'rfq',
        amount: 0,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['procurement_orders', orgId] });
      setForm(EMPTY_FORM);
      setOpen(false);
    },
    onError: (e: unknown) => setError(friendlyError(e as { code?: string; message?: string }, tc)),
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: ProcurementStatus }) => {
      const { error: err } = await supabase
        .from('fp_finance_procurement')
        .update({ status: v.status })
        .eq('id', v.id);
      if (err) throw err;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['procurement_orders', orgId] }),
  });

  const orders = ordersQuery.data ?? [];
  const vendors = vendorsQuery.data ?? [];
  const costCenters = costCentersQuery.data ?? [];
  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.name ?? null;
  const costCenterName = (id: string | null) => costCenters.find((c) => c.id === id)?.name ?? null;

  return (
    <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">{t('procurement.title')}</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600"
        >
          <Plus size={15} /> {t('procurement.newPo')}
        </button>
      </div>

      {orders.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{t('procurement.empty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {orders.map((po) => (
            <li key={po.id} className="py-2">
              <button
                type="button"
                onClick={() => setExpanded(expanded === po.id ? null : po.id)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  {expanded === po.id ? (
                    <ChevronDown size={14} className="shrink-0 text-ink-muted" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0 text-ink-muted" />
                  )}
                  <span className="shrink-0 font-mono text-xs text-ink-muted">{po.po_number ?? '—'}</span>
                  <span className="truncate font-medium text-ink">{po.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs">
                  <span className="text-ink-muted">{vendorName(po.vendor_id) ?? po.vendor ?? t('fields.noVendor')}</span>
                  <Pill className="bg-surface uppercase tracking-wide text-ink-muted">{t(`poStatus.${po.status}`)}</Pill>
                  <span className="font-medium text-ink tabular-nums">{currency(po.amount)}</span>
                </span>
              </button>
              {expanded === po.id && (
                <ProcurementDetail
                  po={po}
                  costCenterName={costCenterName(po.cost_center_id)}
                  onStatusChange={(status) => setStatus.mutate({ id: po.id, status })}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <NewOrderDialog
          busy={createOrder.isPending}
          vendors={vendors}
          costCenters={costCenters}
          form={form}
          setForm={setForm}
          error={error}
          onCancel={() => {
            setOpen(false);
            setError(null);
          }}
          onSubmit={() => {
            setError(null);
            createOrder.mutate();
          }}
        />
      )}
    </div>
  );
}

function ProcurementDetail({
  po,
  costCenterName,
  onStatusChange,
}: {
  po: ProcurementOrder;
  costCenterName: string | null;
  onStatusChange: (status: ProcurementStatus) => void;
}) {
  const { t, i18n } = useTranslation('financial');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const currency = useMoney();
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const linesQuery = useProcurementLines(po.id);
  const receiptLinesQuery = useProcurementReceiptLines(po.id);
  const invoicesQuery = useVendorInvoices(po.id);
  const partsQuery = useParts();
  const [lineForm, setLineForm] = useState({ partId: '', description: '', quantity: '1', unitCost: '0' });
  const [receiving, setReceiving] = useState(false);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: '', amount: '', invoiceDate: '' });

  const addInvoice = useMutation({
    mutationFn: async () => {
      if (!orgId || !invoiceForm.amount) return;
      const { error } = await supabase.from('fp_vendor_invoices').insert({
        org_id: orgId,
        procurement_id: po.id,
        vendor_id: po.vendor_id,
        invoice_number: invoiceForm.invoiceNumber || null,
        amount: Math.max(0, parseFloat(invoiceForm.amount) || 0),
        invoice_date: invoiceForm.invoiceDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vendor_invoices', po.id] });
      void queryClient.invalidateQueries({ queryKey: ['vendor_invoices_all', orgId] });
      setInvoiceForm({ invoiceNumber: '', amount: '', invoiceDate: '' });
    },
  });

  const invalidateLines = () => {
    void queryClient.invalidateQueries({ queryKey: ['procurement_lines', po.id] });
    void queryClient.invalidateQueries({ queryKey: ['procurement_orders', orgId] });
  };

  const addLine = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const part = partsQuery.data?.find((p) => p.id === lineForm.partId);
      const description = lineForm.description || (part ? resolveI18n(part.name_i18n, lng) : '');
      if (!description) return;
      const { error } = await supabase.from('fp_procurement_lines').insert({
        org_id: orgId,
        procurement_id: po.id,
        part_id: lineForm.partId || null,
        description,
        quantity: Math.max(0.01, parseFloat(lineForm.quantity) || 1),
        unit_cost: Math.max(0, parseFloat(lineForm.unitCost) || 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateLines();
      setLineForm({ partId: '', description: '', quantity: '1', unitCost: '0' });
    },
  });

  const lines = linesQuery.data ?? [];
  const receivedFor = (lineId: string) =>
    (receiptLinesQuery.data ?? [])
      .filter((r) => r.procurement_line_id === lineId)
      .reduce((sum, r) => sum + r.quantity_received, 0);

  const submitReceipt = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const entries = Object.entries(receiveQty).filter(([, v]) => parseFloat(v) > 0);
      if (entries.length === 0) return;
      const { data: receipt, error: recErr } = await supabase
        .from('fp_procurement_receipts')
        .insert({ org_id: orgId, procurement_id: po.id })
        .select('id')
        .single();
      if (recErr) throw recErr;
      const rows = entries.map(([lineId, v]) => ({
        org_id: orgId,
        receipt_id: receipt.id as string,
        procurement_line_id: lineId,
        quantity_received: parseFloat(v),
      }));
      const { error: linesErr } = await supabase.from('fp_procurement_receipt_lines').insert(rows);
      if (linesErr) throw linesErr;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['procurement_receipt_lines', po.id] });
      void queryClient.invalidateQueries({ queryKey: ['parts', orgId] });
      setReceiveQty({});
      setReceiving(false);
    },
  });

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>{costCenterName ? t('procurement.costCenter', { name: costCenterName }) : t('fields.noCostCenter')}</span>
        <select
          value={po.status}
          onChange={(e) => onStatusChange(e.target.value as ProcurementStatus)}
          className="rounded-md border border-line bg-white px-2 py-1 text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`poStatus.${s}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-left text-xs text-ink-muted">
            <tr>
              <th className="py-1">{t('procurement.line')}</th>
              <th className="py-1 text-right">{t('procurement.qty')}</th>
              <th className="py-1 text-right">{t('procurement.unitCost')}</th>
              <th className="py-1 text-right">{t('procurement.received')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-line">
                <td className="py-1 text-ink">{line.description}</td>
                <td className="py-1 text-right tabular-nums">{line.quantity}</td>
                <td className="py-1 text-right tabular-nums">{currency(line.unit_cost)}</td>
                <td className="py-1 text-right tabular-nums">
                  {line.part_id ? `${receivedFor(line.id)} / ${line.quantity}` : '—'}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-ink-muted">
                  {t('procurement.noLines')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-44">
          <label className="mb-1 block text-xs text-ink-muted">{t('fields.partOptional')}</label>
          <SearchSelect
            value={lineForm.partId}
            onChange={(id) => setLineForm({ ...lineForm, partId: id })}
            options={(partsQuery.data ?? []).map((p) => ({ id: p.id, label: resolveI18n(p.name_i18n, lng) }))}
            placeholder={t('fields.searchParts')}
            emptyLabel={t('procurement.servicePart')}
          />
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="mb-1 block text-xs text-ink-muted">{t('fields.description')}</label>
          <Input
            value={lineForm.description}
            onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })}
            placeholder={t('procurement.orDescription')}
          />
        </div>
        <div className="w-20">
          <label className="mb-1 block text-xs text-ink-muted">{t('procurement.qty')}</label>
          <Input
            type="number"
            value={lineForm.quantity}
            onChange={(e) => setLineForm({ ...lineForm, quantity: e.target.value })}
          />
        </div>
        <div className="w-24">
          <label className="mb-1 block text-xs text-ink-muted">{t('procurement.unitCost')}</label>
          <Input
            type="number"
            value={lineForm.unitCost}
            onChange={(e) => setLineForm({ ...lineForm, unitCost: e.target.value })}
          />
        </div>
        <Button type="button" onClick={() => addLine.mutate()} loading={addLine.isPending}>
          {t('procurement.addLine')}
        </Button>
      </div>

      {lines.some((l) => l.part_id) && (
        <div className="mt-3 border-t border-line pt-3">
          {!receiving ? (
            <button
              type="button"
              onClick={() => setReceiving(true)}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600"
            >
              <PackageCheck size={15} /> {t('procurement.receive')}
            </button>
          ) : (
            <div>
              <p className="text-xs font-medium text-ink-muted">{t('procurement.quantityReceived')}</p>
              <div className="mt-2 space-y-2">
                {lines
                  .filter((l) => l.part_id)
                  .map((line) => (
                    <div key={line.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-ink">{line.description}</span>
                      <input
                        type="number"
                        min={0}
                        placeholder={String(Math.max(0, line.quantity - receivedFor(line.id)))}
                        value={receiveQty[line.id] ?? ''}
                        onChange={(e) => setReceiveQty({ ...receiveQty, [line.id]: e.target.value })}
                        className="w-24 rounded-md border border-line px-2 py-1 text-sm"
                      />
                    </div>
                  ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setReceiving(false);
                    setReceiveQty({});
                  }}
                >
                  {tc('actions.cancel')}
                </Button>
                <Button type="button" onClick={() => submitReceipt.mutate()} loading={submitReceipt.isPending}>
                  {t('procurement.confirmReceipt')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <p className="text-xs font-medium text-ink-muted">{t('procurement.invoices')}</p>
        <div className="mt-2 space-y-2">
          {(invoicesQuery.data ?? []).map((inv) => {
            const { amountMatches, fullyReceived } = matchInvoice(
              inv.amount,
              po.amount,
              lines,
              receiptLinesQuery.data ?? []
            );
            const matched = amountMatches && fullyReceived;
            return (
              <div key={inv.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                <span className="text-ink">
                  {inv.invoice_number || t('fields.noInvoiceNumber')} · {currency(inv.amount)}
                  {inv.invoice_date && <span className="text-ink-muted"> · {formatDateOnly(inv.invoice_date, lng)}</span>}
                </span>
                {matched ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-status-ok">
                    <CheckCircle2 size={14} /> {t('match.matched')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warn" title={
                    !amountMatches && !fullyReceived
                      ? t('match.bothHint')
                      : !amountMatches
                        ? t('match.amountHint', { total: currency(po.amount) })
                        : t('match.receiptHint')
                  }>
                    <FileWarning size={14} />
                    {!amountMatches && !fullyReceived
                      ? t('match.both')
                      : !amountMatches
                        ? t('match.amount')
                        : t('match.receipt')}
                  </span>
                )}
              </div>
            );
          })}
          {(invoicesQuery.data ?? []).length === 0 && (
            <p className="text-sm text-ink-muted">{t('procurement.noInvoices')}</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="w-32">
            <label className="mb-1 block text-xs text-ink-muted">{t('procurement.invoiceNumber')}</label>
            <Input
              value={invoiceForm.invoiceNumber}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs text-ink-muted">{t('fields.amount')}</label>
            <Input
              type="number"
              value={invoiceForm.amount}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
            />
          </div>
          <div className="w-36">
            <label className="mb-1 block text-xs text-ink-muted">{t('procurement.invoiceDate')}</label>
            <Input
              type="date"
              value={invoiceForm.invoiceDate}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })}
            />
          </div>
          <Button type="button" onClick={() => addInvoice.mutate()} loading={addInvoice.isPending}>
            {t('procurement.recordInvoice')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NewOrderDialog({
  busy,
  vendors,
  costCenters,
  form,
  setForm,
  error,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  vendors: Vendor[];
  costCenters: CostCenter[];
  form: OrderForm;
  setForm: Dispatch<SetStateAction<OrderForm>>;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation('financial');
  const { t: tc } = useTranslation('common');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title) return;
    onSubmit();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{t('procurement.newTitle')}</h2>
        <div className="mt-4 space-y-3">
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t('procurement.titlePlaceholder')}
          />
          <div>
            <label className="mb-1 block text-xs text-ink-muted">{t('fields.vendor')}</label>
            <SearchSelect
              value={form.vendorId}
              onChange={(id) => setForm({ ...form, vendorId: id })}
              options={vendors.map((v) => ({ id: v.id, label: v.name }))}
              placeholder={t('fields.searchVendors')}
              emptyLabel={t('fields.noVendor')}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">{t('fields.costCenter')}</label>
            <select
              value={form.costCenterId}
              onChange={(e) => setForm({ ...form, costCenterId: e.target.value })}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              <option value="">{t('fields.noCostCenter')}</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.code ? `${cc.code} — ${cc.name}` : cc.name}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            placeholder={t('fields.notes')}
          />
          {error && <p className="text-sm text-status-crit">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {tc('actions.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
