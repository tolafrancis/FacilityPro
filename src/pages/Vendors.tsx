import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useContracts, useLicenses, useVendors, useVendorsPage } from '../lib/queries';
import { daysUntil, formatDateOnly } from '../lib/ui';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import Pagination from '../components/ui/Pagination';

type Dialog = 'vendor' | 'contract' | 'license' | null;
const PAGE_SIZE = 25;

export default function Vendors() {
  const { t, i18n } = useTranslation('vendors');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();

  // Full list for name lookups and the contract dialog's vendor picker;
  // the page below (vendorsPageQuery) is what the visible table paginates.
  const allVendorsQuery = useVendors();
  const contractsQuery = useContracts();
  const licensesQuery = useLicenses();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage] = useState(1);

  const vendorsPageQuery = useVendorsPage(page, PAGE_SIZE, { category: filterCategory || undefined });

  const vendors = allVendorsQuery.data ?? [];
  const vendorRows = vendorsPageQuery.data?.rows ?? [];
  const vendorTotal = vendorsPageQuery.data?.count ?? 0;
  const vendorCategories = Array.from(new Set(vendors.map((v) => v.category).filter((c): c is string => !!c)));
  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.name ?? '—';

  const addVendor = useMutation({
    mutationFn: async (v: { name: string; category: string; email: string; phone: string }) => {
      const { error } = await supabase.from('fp_vendors').insert({
        org_id: orgId,
        name: v.name,
        category: v.category || null,
        email: v.email || null,
        phone: v.phone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vendors', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['vendors_page'] });
      setDialog(null);
    },
  });

  const addContract = useMutation({
    mutationFn: async (v: { title: string; vendorId: string; url: string; expiry: string }) => {
      const { error } = await supabase.from('fp_contracts').insert({
        org_id: orgId,
        title: v.title,
        vendor_id: v.vendorId || null,
        document_url: v.url || null,
        expiry_date: v.expiry || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contracts', orgId] });
      setDialog(null);
    },
  });

  const addLicense = useMutation({
    mutationFn: async (v: { name: string; holder: string; url: string; expiry: string }) => {
      const { error } = await supabase.from('fp_licenses').insert({
        org_id: orgId,
        name: v.name,
        holder: v.holder || null,
        document_url: v.url || null,
        expiry_date: v.expiry || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['licenses', orgId] });
      setDialog(null);
    },
  });

  const expiryPill = (expiry: string | null) => {
    if (!expiry) return <span className="text-xs text-ink-muted">{t('noExpiry')}</span>;
    const d = daysUntil(expiry);
    const label = `${t('expires')} ${formatDateOnly(expiry, lng)}`;
    if (d !== null && d < 0)
      return <Pill className="bg-status-crit/10 text-status-crit">{t('expired')}</Pill>;
    if (d !== null && d <= 30)
      return <Pill className="bg-status-warn/15 text-status-warn">{t('expiringSoon')}</Pill>;
    return <span className="text-xs text-ink-muted">{label}</span>;
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>

      <Section
        title={t('vendors')}
        action={
          <AddButton label={t('addVendor')} onClick={() => setDialog('vendor')} />
        }
      >
        {vendorCategories.length > 0 && (
          <div className="mb-3">
            <Select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setPage(1);
              }}
              className="w-56"
            >
              <option value="">{tc('common.all')}</option>
              {vendorCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </Select>
          </div>
        )}
        {vendorRows.length === 0 ? (
          <Empty text={t('emptyVendors')} />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {vendorRows.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{v.name}</span>
                  <span className="text-xs text-ink-muted">
                    {[v.category, v.email, v.phone].filter(Boolean).join(' · ') || '—'}
                  </span>
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={vendorTotal}
              onPageChange={setPage}
              summary={(p, tp, tt) => tc('pagination.summary', { page: p, totalPages: tp, total: tt })}
              prevLabel={tc('pagination.prev')}
              nextLabel={tc('pagination.next')}
            />
          </>
        )}
      </Section>

      <Section
        title={t('contracts')}
        action={<AddButton label={t('addContract')} onClick={() => setDialog('contract')} />}
      >
        {(contractsQuery.data ?? []).length === 0 ? (
          <Empty text={t('emptyContracts')} />
        ) : (
          <ul className="divide-y divide-line">
            {(contractsQuery.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {c.title}
                  <span className="ml-2 text-xs text-ink-muted">{vendorName(c.vendor_id)}</span>
                </span>
                {expiryPill(c.expiry_date)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t('licenses')}
        action={<AddButton label={t('addLicense')} onClick={() => setDialog('license')} />}
      >
        {(licensesQuery.data ?? []).length === 0 ? (
          <Empty text={t('emptyLicenses')} />
        ) : (
          <ul className="divide-y divide-line">
            {(licensesQuery.data ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {l.name}
                  {l.holder && <span className="ml-2 text-xs text-ink-muted">{l.holder}</span>}
                </span>
                {expiryPill(l.expiry_date)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {dialog === 'vendor' && (
        <VendorDialog
          busy={addVendor.isPending}
          onCancel={() => setDialog(null)}
          onSubmit={(v) => addVendor.mutate(v)}
          t={t}
          cancelLabel={tc('actions.cancel')}
          saveLabel={tc('actions.create')}
        />
      )}
      {dialog === 'contract' && (
        <ContractDialog
          busy={addContract.isPending}
          vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
          onCancel={() => setDialog(null)}
          onSubmit={(v) => addContract.mutate(v)}
          t={t}
          noneLabel={tc('common.none')}
          cancelLabel={tc('actions.cancel')}
          saveLabel={tc('actions.create')}
        />
      )}
      {dialog === 'license' && (
        <LicenseDialog
          busy={addLicense.isPending}
          onCancel={() => setDialog(null)}
          onSubmit={(v) => addLicense.mutate(v)}
          t={t}
          cancelLabel={tc('actions.cancel')}
          saveLabel={tc('actions.create')}
        />
      )}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  // Vendors, contracts and licenses are managed by admins/managers (RLS).
  const { isManager } = useOrg();
  if (!isManager) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600"
    >
      <Plus size={15} /> {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-ink-muted">{text}</p>;
}

function Shell({
  title,
  onCancel,
  children,
  busy,
  cancelLabel,
  saveLabel,
  onSubmit,
}: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
  busy: boolean;
  cancelLabel: string;
  saveLabel: string;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-4 space-y-3">{children}</div>
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

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {children}
    </div>
  );
}

type TFn = (k: string) => string;

function VendorDialog({
  busy,
  onCancel,
  onSubmit,
  t,
  cancelLabel,
  saveLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { name: string; category: string; email: string; phone: string }) => void;
  t: TFn;
  cancelLabel: string;
  saveLabel: string;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    onSubmit({ name, category, email, phone });
  };
  return (
    <Shell
      title={t('addVendor')}
      onCancel={onCancel}
      busy={busy}
      cancelLabel={cancelLabel}
      saveLabel={saveLabel}
      onSubmit={submit}
    >
      <Labeled label={t('fields.name')}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Labeled>
      <Labeled label={t('fields.category')}>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} />
      </Labeled>
      <Labeled label={t('fields.email')}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Labeled>
      <Labeled label={t('fields.phone')}>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Labeled>
    </Shell>
  );
}

function ContractDialog({
  busy,
  vendors,
  onCancel,
  onSubmit,
  t,
  noneLabel,
  cancelLabel,
  saveLabel,
}: {
  busy: boolean;
  vendors: { id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (v: { title: string; vendorId: string; url: string; expiry: string }) => void;
  t: TFn;
  noneLabel: string;
  cancelLabel: string;
  saveLabel: string;
}) {
  const [title, setTitle] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [url, setUrl] = useState('');
  const [expiry, setExpiry] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title) return;
    onSubmit({ title, vendorId, url, expiry });
  };
  return (
    <Shell
      title={t('addContract')}
      onCancel={onCancel}
      busy={busy}
      cancelLabel={cancelLabel}
      saveLabel={saveLabel}
      onSubmit={submit}
    >
      <Labeled label={t('fields.ctitle')}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Labeled>
      <Labeled label={t('fields.vendor')}>
        <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">{noneLabel}</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </Labeled>
      <Labeled label={t('fields.documentUrl')}>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} />
      </Labeled>
      <Labeled label={t('fields.expiry')}>
        <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </Labeled>
    </Shell>
  );
}

function LicenseDialog({
  busy,
  onCancel,
  onSubmit,
  t,
  cancelLabel,
  saveLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { name: string; holder: string; url: string; expiry: string }) => void;
  t: TFn;
  cancelLabel: string;
  saveLabel: string;
}) {
  const [name, setName] = useState('');
  const [holder, setHolder] = useState('');
  const [url, setUrl] = useState('');
  const [expiry, setExpiry] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    onSubmit({ name, holder, url, expiry });
  };
  return (
    <Shell
      title={t('addLicense')}
      onCancel={onCancel}
      busy={busy}
      cancelLabel={cancelLabel}
      saveLabel={saveLabel}
      onSubmit={submit}
    >
      <Labeled label={t('fields.name')}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Labeled>
      <Labeled label={t('fields.holder')}>
        <Input value={holder} onChange={(e) => setHolder(e.target.value)} />
      </Labeled>
      <Labeled label={t('fields.documentUrl')}>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} />
      </Labeled>
      <Labeled label={t('fields.expiry')}>
        <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </Labeled>
    </Shell>
  );
}
