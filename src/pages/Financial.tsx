import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';

interface CustomerRecord {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  notes: string | null;
  created_at: string;
}

interface ProcurementRecord {
  id: string;
  title: string;
  vendor: string;
  amount: number;
  status: string;
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
  created_at: string;
}

interface ExpenditureRecord {
  id: string;
  description: string;
  category: string;
  amount: number;
  vendor: string;
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
  created_at: string;
}

async function fetchCustomers(orgId: string | undefined) {
  if (!orgId) return [] as CustomerRecord[];
  const { data, error } = await supabase.from('fp_finance_customers').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerRecord[];
}

async function fetchProcurement(orgId: string | undefined) {
  if (!orgId) return [] as ProcurementRecord[];
  const { data, error } = await supabase.from('fp_finance_procurement').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProcurementRecord[];
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
  const [procurementForm, setProcurementForm] = useState({ title: '', vendor: '', amount: '', status: 'rfq', notes: '' });
  const [paymentForm, setPaymentForm] = useState({ description: '', amount: '', method: 'Manual transfer', reference: '', status: 'pending' });
  const [expenditureForm, setExpenditureForm] = useState({ description: '', category: 'Parts', amount: '', vendor: '' });
  const [rateForm, setRateForm] = useState({ service: '', unit: 'hour', rate: '', currency: 'USD' });
  const [budgetForm, setBudgetForm] = useState({ name: 'Operating budget', amount: '', period: 'Monthly', notes: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: customers = [] } = useQuery({ queryKey: ['finance-customers', currentOrg?.id], queryFn: () => fetchCustomers(currentOrg?.id), enabled: !!currentOrg?.id });
  const { data: procurement = [] } = useQuery({ queryKey: ['finance-procurement', currentOrg?.id], queryFn: () => fetchProcurement(currentOrg?.id), enabled: !!currentOrg?.id });
  useQuery({ queryKey: ['finance-payments', currentOrg?.id], queryFn: () => fetchPayments(currentOrg?.id), enabled: !!currentOrg?.id });
  const { data: expenditures = [] } = useQuery({ queryKey: ['finance-expenditures', currentOrg?.id], queryFn: () => fetchExpenditures(currentOrg?.id), enabled: !!currentOrg?.id });
  useQuery({ queryKey: ['finance-rates', currentOrg?.id], queryFn: () => fetchRates(currentOrg?.id), enabled: !!currentOrg?.id });
  const { data: budgets = [] } = useQuery({ queryKey: ['finance-budgets', currentOrg?.id], queryFn: () => fetchBudgets(currentOrg?.id), enabled: !!currentOrg?.id });

  const totalSpend = expenditures.reduce((sum, item) => sum + item.amount, 0);
  const totalBudget = budgets.reduce((sum, item) => sum + item.amount, 0);

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

  const submitProcurement = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !procurementForm.title) return;
    setBusy('procurement');
    setMessage(null);
    try {
      await saveRecord('fp_finance_procurement', { ...procurementForm, amount: Number(procurementForm.amount || 0) }, 'finance-procurement');
      setProcurementForm({ title: '', vendor: '', amount: '', status: 'rfq', notes: '' });
      setMessage('Procurement request saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save procurement request.');
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
      await saveRecord('fp_finance_payments', { ...paymentForm, amount: Number(paymentForm.amount || 0) }, 'finance-payments');
      setPaymentForm({ description: '', amount: '', method: 'Manual transfer', reference: '', status: 'pending' });
      setMessage('Payment entry saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save payment.');
    } finally {
      setBusy(null);
    }
  };

  const submitExpenditure = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !expenditureForm.description) return;
    setBusy('expenditure');
    setMessage(null);
    try {
      await saveRecord('fp_finance_expenditures', { ...expenditureForm, amount: Number(expenditureForm.amount || 0) }, 'finance-expenditures');
      setExpenditureForm({ description: '', category: 'Parts', amount: '', vendor: '' });
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
      await saveRecord('fp_finance_budgets', { ...budgetForm, amount: Number(budgetForm.amount || 0) }, 'finance-budgets');
      setBudgetForm({ name: 'Operating budget', amount: '', period: 'Monthly', notes: '' });
      setMessage('Budget target saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save budget.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Financial operations</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Track customers, procurements, payments, expenditures, rate cards, and budget targets in one place.
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
          <p className="text-sm text-ink-muted">Open procurement</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{procurement.filter((item) => item.status !== 'approved').length}</p>
        </div>
      </div>

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

        <form onSubmit={submitProcurement} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Procurement</h2>
          <div className="mt-4 space-y-3">
            <Input value={procurementForm.title} onChange={(event) => setProcurementForm({ ...procurementForm, title: event.target.value })} placeholder="RFQ / PO / receipt title" />
            <Input value={procurementForm.vendor} onChange={(event) => setProcurementForm({ ...procurementForm, vendor: event.target.value })} placeholder="Vendor" />
            <Input type="number" value={procurementForm.amount} onChange={(event) => setProcurementForm({ ...procurementForm, amount: event.target.value })} placeholder="Amount" />
            <select value={procurementForm.status} onChange={(event) => setProcurementForm({ ...procurementForm, status: event.target.value })} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
              <option value="rfq">RFQ</option>
              <option value="po">PO</option>
              <option value="received">Received</option>
              <option value="approved">Approved</option>
            </select>
            <textarea value={procurementForm.notes} onChange={(event) => setProcurementForm({ ...procurementForm, notes: event.target.value })} rows={3} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Notes" />
            <Button type="submit" loading={busy === 'procurement'}>Save request</Button>
          </div>
        </form>

        <form onSubmit={submitPayment} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Payments</h2>
          <div className="mt-4 space-y-3">
            <Input value={paymentForm.description} onChange={(event) => setPaymentForm({ ...paymentForm, description: event.target.value })} placeholder="Invoice or payment description" />
            <Input type="number" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} placeholder="Amount" />
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
            <Input value={expenditureForm.description} onChange={(event) => setExpenditureForm({ ...expenditureForm, description: event.target.value })} placeholder="Description" />
            <Input value={expenditureForm.category} onChange={(event) => setExpenditureForm({ ...expenditureForm, category: event.target.value })} placeholder="Category" />
            <Input type="number" value={expenditureForm.amount} onChange={(event) => setExpenditureForm({ ...expenditureForm, amount: event.target.value })} placeholder="Amount" />
            <Input value={expenditureForm.vendor} onChange={(event) => setExpenditureForm({ ...expenditureForm, vendor: event.target.value })} placeholder="Vendor" />
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
            <textarea value={budgetForm.notes} onChange={(event) => setBudgetForm({ ...budgetForm, notes: event.target.value })} rows={3} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Notes" />
            <Button type="submit" loading={busy === 'budget'}>Save budget</Button>
          </div>
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
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
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Open procurement</h2>
          <div className="mt-4 space-y-2">
            {procurement.length === 0 && <p className="text-sm text-ink-muted">No requests yet.</p>}
            {procurement.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-lg border border-line bg-surface px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-ink">{item.title}</p>
                  <span className="text-xs uppercase tracking-[0.2em] text-ink-muted">{item.status}</span>
                </div>
                <p className="text-sm text-ink-muted">{item.vendor} · {currency(item.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
