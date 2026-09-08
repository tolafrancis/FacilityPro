import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import SearchSelect from '../components/ui/SearchSelect';
import ProcurementManager from '../components/ProcurementManager';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAssets, useCostCenters, useParts, useProcurementOrders, useVendorInvoices, useVendors, useWorkOrders } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';

interface CustomerRecord {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  notes: string | null;
  created_at: string;
}

interface PaymentRecord {
  id: string;
  description: string;
  amount: number;
  method: string;
  status: string;
  reference: string;
  vendor_id: string | null;
  procurement_id: string | null;
  invoice_id: string | null;
  created_at: string;
}

interface ExpenditureRecord {
  id: string;
  description: string;
  category: string;
  amount: number;
  vendor: string | null;
  vendor_id: string | null;
  work_order_id: string | null;
  asset_id: string | null;
  part_id: string | null;
  cost_center_id: string | null;
  created_at: string;
}

interface RateCardRecord {
  id: string;
  service: string;
  unit: string;
  rate: number;
  currency: string;
  created_at: string;
}

interface BudgetRecord {
  id: string;
  name: string;
  amount: number;
  period: string;
  notes: string | null;
  cost_center_id: string | null;
  created_at: string;
}

async function fetchCustomers(orgId: string | undefined) {
  if (!orgId) return [] as CustomerRecord[];
  const { data, error } = await supabase.from('fp_finance_customers').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerRecord[];
}

async function fetchPayments(orgId: string | undefined) {
  if (!orgId) return [] as PaymentRecord[];
  const { data, error } = await supabase.from('fp_finance_payments').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PaymentRecord[];
}

async function fetchExpenditures(orgId: string | undefined) {
  if (!orgId) return [] as ExpenditureRecord[];
  const { data, error } = await supabase.from('fp_finance_expenditures').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExpenditureRecord[];
}

async function fetchRates(orgId: string | undefined) {
  if (!orgId) return [] as RateCardRecord[];
  const { data, error } = await supabase.from('fp_finance_rates').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RateCardRecord[];
}

async function fetchBudgets(orgId: string | undefined) {
  if (!orgId) return [] as BudgetRecord[];
  const { data, error } = await supabase.from('fp_finance_budgets').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BudgetRecord[];
}

function currency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function Financial() {
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();
  const [customerForm, setCustomerForm] = useState({ name: '', company: '', email: '', phone: '', notes: '' });
  const [paymentForm, setPaymentForm] = useState({
    description: '',
    amount: '',
    method: 'Manual transfer',
    reference: '',
    status: 'pending',
    vendorId: '',
    procurementId: '',
    invoiceId: '',
  });
  const [expenditureForm, setExpenditureForm] = useState({
    description: '',
    category: 'Parts',
    amount: '',
    vendorId: '',
    workOrderId: '',
    assetId: '',
    partId: '',
    cost_center_id: '',
  });
  const [rateForm, setRateForm] = useState({ service: '', unit: 'hour', rate: '', currency: 'USD' });
  const [budgetForm, setBudgetForm] = useState({ name: 'Operating budget', amount: '', period: 'Monthly', notes: '', cost_center_id: '' });
  const [costCenterForm, setCostCenterForm] = useState({ name: '', code: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const costCentersQuery = useCostCenters();
  const costCenters = costCentersQuery.data ?? [];
  const vendorsQuery = useVendors();
  const vendors = vendorsQuery.data ?? [];
  const procurementOrdersQuery = useProcurementOrders();
  const procurementOrders = procurementOrdersQuery.data ?? [];
  const paymentInvoicesQuery = useVendorInvoices(paymentForm.procurementId || undefined);
  const paymentInvoices = paymentInvoicesQuery.data ?? [];
  const workOrdersQuery = useWorkOrders();
  const workOrders = workOrdersQuery.data ?? [];
  const assetsQuery = useAssets();
  const assets = assetsQuery.data ?? [];
  const partsQuery = useParts();
  const parts = partsQuery.data ?? [];

  const { data: customers = [] } = useQuery({ queryKey: ['finance-customers', currentOrg?.id], queryFn: () => fetchCustomers(currentOrg?.id), enabled: !!currentOrg?.id });
  useQuery({ queryKey: ['finance-payments', currentOrg?.id], queryFn: () => fetchPayments(currentOrg?.id), enabled: !!currentOrg?.id });
  const { data: expenditures = [] } = useQuery({ queryKey: ['finance-expenditures', currentOrg?.id], queryFn: () => fetchExpenditures(currentOrg?.id), enabled: !!currentOrg?.id });
  useQuery({ queryKey: ['finance-rates', currentOrg?.id], queryFn: () => fetchRates(currentOrg?.id), enabled: !!currentOrg?.id });
  const { data: budgets = [] } = useQuery({ queryKey: ['finance-budgets', currentOrg?.id], queryFn: () => fetchBudgets(currentOrg?.id), enabled: !!currentOrg?.id });

  const totalSpend = expenditures.reduce((sum, item) => sum + item.amount, 0);
  const totalBudget = budgets.reduce((sum, item) => sum + item.amount, 0);
  const openProcurementCount = procurementOrders.filter((item) => item.status !== 'approved').length;

  const saveRecord = async (table: string, values: Record<string, unknown>, invalidateKey: string) => {
    if (!currentOrg?.id) return;
    const { error } = await supabase.from(table).insert({ org_id: currentOrg.id, ...values });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: [invalidateKey, currentOrg.id] });
  };

  const submitCustomer = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !customerForm.name) return;
    setBusy('customer');
    setMessage(null);
    try {
      await saveRecord('fp_finance_customers', customerForm, 'finance-customers');
      setCustomerForm({ name: '', company: '', email: '', phone: '', notes: '' });
      setMessage('Customer record saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save customer record.');
    } finally {
      setBusy(null);
    }
  };

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !paymentForm.description) return;
    setBusy('payment');
    setMessage(null);
    try {
      await saveRecord(
        'fp_finance_payments',
        {
          description: paymentForm.description,
          amount: Number(paymentForm.amount || 0),
          method: paymentForm.method,
          reference: paymentForm.reference,
          status: paymentForm.status,
          vendor_id: paymentForm.vendorId || null,
          procurement_id: paymentForm.procurementId || null,
          invoice_id: paymentForm.invoiceId || null,
        },
        'finance-payments'
      );
      setPaymentForm({ description: '', amount: '', method: 'Manual transfer', reference: '', status: 'pending', vendorId: '', procurementId: '', invoiceId: '' });
      setMessage('Payment entry saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save payment.');
    } finally {
      setBusy(null);
    }
  };

  const submitExpenditure = async (event: FormEvent) => {
    event.preventDefault();
    const selectedPart = parts.find((p) => p.id === expenditureForm.partId);
    const description = expenditureForm.description || (selectedPart ? resolveI18n(selectedPart.name_i18n, 'en') : '');
    if (!currentOrg?.id || !description) return;
    setBusy('expenditure');
    setMessage(null);
    try {
      await saveRecord(
        'fp_finance_expenditures',
        {
          description,
          category: expenditureForm.category,
          amount: Number(expenditureForm.amount || 0),
          vendor_id: expenditureForm.vendorId || null,
          work_order_id: expenditureForm.workOrderId || null,
          asset_id: expenditureForm.assetId || null,
          part_id: expenditureForm.partId || null,
          cost_center_id: expenditureForm.cost_center_id || null,
        },
        'finance-expenditures'
      );
      setExpenditureForm({ description: '', category: 'Parts', amount: '', vendorId: '', workOrderId: '', assetId: '', partId: '', cost_center_id: '' });
      setMessage('Expenditure recorded.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save expenditure.');
    } finally {
      setBusy(null);
    }
  };

  const submitRate = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !rateForm.service) return;
    setBusy('rate');
    setMessage(null);
    try {
      await saveRecord('fp_finance_rates', { ...rateForm, rate: Number(rateForm.rate || 0) }, 'finance-rates');
      setRateForm({ service: '', unit: 'hour', rate: '', currency: 'USD' });
      setMessage('Rate card saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save rate card.');
    } finally {
      setBusy(null);
    }
  };

  const submitBudget = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !budgetForm.name) return;
    setBusy('budget');
    setMessage(null);
    try {
      await saveRecord(
        'fp_finance_budgets',
        { ...budgetForm, amount: Number(budgetForm.amount || 0), cost_center_id: budgetForm.cost_center_id || null },
        'finance-budgets'
      );
      setBudgetForm({ name: 'Operating budget', amount: '', period: 'Monthly', notes: '', cost_center_id: '' });
      setMessage('Budget target saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save budget.');
    } finally {
      setBusy(null);
    }
  };

  const submitCostCenter = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !costCenterForm.name) return;
    setBusy('costCenter');
    setMessage(null);
    try {
      const { error } = await supabase.from('fp_cost_centers').insert({ org_id: currentOrg.id, ...costCenterForm });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['cost_centers', currentOrg.id] });
      setCostCenterForm({ name: '', code: '' });
      setMessage('Cost center saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save cost center.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Financial operations</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Track customers, procurement, payments, expenditures, rate cards, and budget targets in one place.
        </p>
      </div>

      {message && <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand">{message}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <p className="text-sm text-ink-muted">Budgeted</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{currency(totalBudget)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <p className="text-sm text-ink-muted">Committed spend</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{currency(totalSpend)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <p className="text-sm text-ink-muted">Open purchase orders</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{openProcurementCount}</p>
        </div>
      </div>

      <ProcurementManager />

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={submitCustomer} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Customers</h2>
          <div className="mt-4 space-y-3">
            <Input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder="Customer or client name" />
            <Input value={customerForm.company} onChange={(event) => setCustomerForm({ ...customerForm, company: event.target.value })} placeholder="Company" />
            <Input value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} placeholder="Email" />
            <Input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} placeholder="Phone" />
            <textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} rows={3} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Notes" />
            <Button type="submit" loading={busy === 'customer'}>Save customer</Button>
          </div>
        </form>

        <form onSubmit={submitPayment} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Payments</h2>
          <div className="mt-4 space-y-3">
            <Input value={paymentForm.description} onChange={(event) => setPaymentForm({ ...paymentForm, description: event.target.value })} placeholder="Invoice or payment description" />
            <Input type="number" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} placeholder="Amount" />
            <div>
              <label className="mb-1 block text-xs text-ink-muted">Vendor</label>
              <SearchSelect
                value={paymentForm.vendorId}
                onChange={(id) => setPaymentForm({ ...paymentForm, vendorId: id })}
                options={vendors.map((v) => ({ id: v.id, label: v.name }))}
                placeholder="Search vendors…"
                emptyLabel="No vendor"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-muted">Purchase order</label>
              <select
                value={paymentForm.procurementId}
                onChange={(event) => setPaymentForm({ ...paymentForm, procurementId: event.target.value, invoiceId: '' })}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                <option value="">No purchase order</option>
                {procurementOrders.map((po) => (
                  <option key={po.id} value={po.id}>{po.po_number ? `${po.po_number} — ${po.title}` : po.title}</option>
                ))}
              </select>
            </div>
            {paymentForm.procurementId && (
              <div>
                <label className="mb-1 block text-xs text-ink-muted">Invoice (three-way match)</label>
                <select
                  value={paymentForm.invoiceId}
                  onChange={(event) => setPaymentForm({ ...paymentForm, invoiceId: event.target.value })}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                >
                  <option value="">No specific invoice</option>
                  {paymentInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>{inv.invoice_number || 'No invoice #'} · {currency(inv.amount)}</option>
                  ))}
                </select>
                {paymentInvoices.length === 0 && (
                  <p className="mt-1 text-xs text-ink-muted">No invoices recorded on this PO yet — add one from the Procurement panel above.</p>
                )}
              </div>
            )}
            <Input value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })} placeholder="Method" />
            <Input value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} placeholder="Reference" />
            <select value={paymentForm.status} onChange={(event) => setPaymentForm({ ...paymentForm, status: event.target.value })} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
            <Button type="submit" loading={busy === 'payment'}>Save payment</Button>
          </div>
        </form>

        <form onSubmit={submitExpenditure} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Expenditures</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-ink-muted">Part (optional)</label>
              <SearchSelect
                value={expenditureForm.partId}
                onChange={(id) => {
                  const part = parts.find((p) => p.id === id);
                  setExpenditureForm({
                    ...expenditureForm,
                    partId: id,
                    // Pre-fill a blank description from the part name, and
                    // suggest its preferred vendor — never overwriting
                    // either if the user already set them.
                    description: !expenditureForm.description && part ? resolveI18n(part.name_i18n, 'en') : expenditureForm.description,
                    vendorId: !expenditureForm.vendorId && part?.preferred_vendor_id ? part.preferred_vendor_id : expenditureForm.vendorId,
                  });
                }}
                options={parts.map((p) => ({ id: p.id, label: resolveI18n(p.name_i18n, 'en') }))}
                placeholder="Search parts…"
                emptyLabel="Not a part / service"
              />
            </div>
            <Input value={expenditureForm.description} onChange={(event) => setExpenditureForm({ ...expenditureForm, description: event.target.value })} placeholder="Description" />
            <Input value={expenditureForm.category} onChange={(event) => setExpenditureForm({ ...expenditureForm, category: event.target.value })} placeholder="Category" />
            <Input type="number" value={expenditureForm.amount} onChange={(event) => setExpenditureForm({ ...expenditureForm, amount: event.target.value })} placeholder="Amount" />
            <div>
              <label className="mb-1 block text-xs text-ink-muted">Work order (optional)</label>
              <select
                value={expenditureForm.workOrderId}
                onChange={(event) => {
                  const workOrderId = event.target.value;
                  const wo = workOrders.find((w) => w.id === workOrderId);
                  setExpenditureForm({
                    ...expenditureForm,
                    workOrderId,
                    // Pick up the work order's vendor automatically, but never
                    // overwrite a vendor the user already chose themselves.
                    vendorId: !expenditureForm.vendorId && wo?.vendor_id ? wo.vendor_id : expenditureForm.vendorId,
                  });
                }}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                <option value="">No work order</option>
                {workOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>{wo.title ?? wo.id.slice(0, 8)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-muted">Asset (optional)</label>
              <select
                value={expenditureForm.assetId}
                onChange={(event) => setExpenditureForm({ ...expenditureForm, assetId: event.target.value })}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                <option value="">No asset</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{resolveI18n(asset.name_i18n, 'en')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-muted">Vendor</label>
              <SearchSelect
                value={expenditureForm.vendorId}
                onChange={(id) => setExpenditureForm({ ...expenditureForm, vendorId: id })}
                options={vendors.map((v) => ({ id: v.id, label: v.name }))}
                placeholder="Search vendors…"
                emptyLabel="No vendor"
              />
            </div>
            <select value={expenditureForm.cost_center_id} onChange={(event) => setExpenditureForm({ ...expenditureForm, cost_center_id: event.target.value })} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
              <option value="">No cost center</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.code ? `${cc.code} — ${cc.name}` : cc.name}</option>
              ))}
            </select>
            <Button type="submit" loading={busy === 'expenditure'}>Record spend</Button>
          </div>
        </form>

        <form onSubmit={submitRate} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Schedule of rates</h2>
          <div className="mt-4 space-y-3">
            <Input value={rateForm.service} onChange={(event) => setRateForm({ ...rateForm, service: event.target.value })} placeholder="Service or labour item" />
            <Input value={rateForm.unit} onChange={(event) => setRateForm({ ...rateForm, unit: event.target.value })} placeholder="Unit" />
            <Input type="number" value={rateForm.rate} onChange={(event) => setRateForm({ ...rateForm, rate: event.target.value })} placeholder="Rate" />
            <Input value={rateForm.currency} onChange={(event) => setRateForm({ ...rateForm, currency: event.target.value })} placeholder="Currency" />
            <Button type="submit" loading={busy === 'rate'}>Save rate</Button>
          </div>
        </form>

        <form onSubmit={submitBudget} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Budget</h2>
          <div className="mt-4 space-y-3">
            <Input value={budgetForm.name} onChange={(event) => setBudgetForm({ ...budgetForm, name: event.target.value })} placeholder="Budget name" />
            <Input type="number" value={budgetForm.amount} onChange={(event) => setBudgetForm({ ...budgetForm, amount: event.target.value })} placeholder="Amount" />
            <Input value={budgetForm.period} onChange={(event) => setBudgetForm({ ...budgetForm, period: event.target.value })} placeholder="Period" />
            <select value={budgetForm.cost_center_id} onChange={(event) => setBudgetForm({ ...budgetForm, cost_center_id: event.target.value })} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
              <option value="">No cost center</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.code ? `${cc.code} — ${cc.name}` : cc.name}</option>
              ))}
            </select>
            <textarea value={budgetForm.notes} onChange={(event) => setBudgetForm({ ...budgetForm, notes: event.target.value })} rows={3} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Notes" />
            <Button type="submit" loading={busy === 'budget'}>Save budget</Button>
          </div>
        </form>

        <form onSubmit={submitCostCenter} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Cost centers</h2>
          <div className="mt-4 space-y-3">
            <Input value={costCenterForm.name} onChange={(event) => setCostCenterForm({ ...costCenterForm, name: event.target.value })} placeholder="Name (e.g. Facilities — HVAC)" />
            <Input value={costCenterForm.code} onChange={(event) => setCostCenterForm({ ...costCenterForm, code: event.target.value })} placeholder="Code (optional)" />
            <Button type="submit" loading={busy === 'costCenter'}>Save cost center</Button>
            {costCenters.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                {costCenters.map((cc) => (
                  <li key={cc.id}>{cc.code ? `${cc.code} — ${cc.name}` : cc.name}</li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Recent customers</h2>
        <div className="mt-4 space-y-2">
          {customers.length === 0 && <p className="text-sm text-ink-muted">No customer records yet.</p>}
          {customers.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-lg border border-line bg-surface px-3 py-2">
              <p className="font-medium text-ink">{item.name}</p>
              <p className="text-sm text-ink-muted">{item.company || 'Client'} · {item.email}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
