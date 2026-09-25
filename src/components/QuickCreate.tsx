import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAssetTypes, useLocations } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { friendlyError } from '../lib/ui';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';
import Modal from './ui/Modal';

export type QuickKind = 'location' | 'asset' | 'part' | 'vendor';

const LOCATION_KINDS = ['building', 'floor', 'room', 'zone'] as const;

/**
 * Add a location, asset, part or vendor without leaving the dashboard (the
 * Create menu and the setup to-do list). Essentials only; everything else is
 * on the full page. After saving: add another, or close.
 */
export default function QuickCreate({ kind, onClose }: { kind: QuickKind; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const locations = useLocations();
  const assetTypes = useAssetTypes();

  const [name, setName] = useState('');
  const [locationKind, setLocationKind] = useState<(typeof LOCATION_KINDS)[number]>('building');
  const [parentId, setParentId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [assetTypeId, setAssetTypeId] = useState('');
  const [sku, setSku] = useState('');
  const [stock, setStock] = useState('0');
  const [reorder, setReorder] = useState('0');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setSku('');
    setStock('0');
    setReorder('0');
    setPhone('');
    setEmail('');
    setSaved(null);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    if (!n || !orgId) {
      setError(t('quick.nameRequired'));
      return;
    }
    const i18nName = { en: n, vi: n };
    setBusy(true);
    const { error: err } =
      kind === 'location'
        ? await supabase.from('fp_locations').insert({ org_id: orgId, name_i18n: i18nName, kind: locationKind, parent_id: parentId || null })
        : kind === 'asset'
          ? await supabase.from('fp_assets').insert({ org_id: orgId, name_i18n: i18nName, location_id: locationId || null, asset_type_id: assetTypeId || null })
          : kind === 'part'
            ? await supabase.from('fp_parts').insert({
                org_id: orgId,
                name_i18n: i18nName,
                sku: sku.trim() || null,
                stock_balance: Math.max(0, Number(stock) || 0),
                reorder_level: Math.max(0, Number(reorder) || 0),
              })
            : await supabase.from('fp_vendors').insert({ org_id: orgId, name: n, phone: phone.trim() || null, email: email.trim() || null });
    setBusy(false);
    if (err) {
      setError(friendlyError(err, t));
      return;
    }
    // Prefix matches: every list and count that shows these records.
    const keys: Record<QuickKind, string[]> = {
      location: ['locations'],
      asset: ['assets', 'assets_page'],
      part: ['parts', 'parts_page'],
      vendor: ['vendors', 'vendors_page'],
    };
    for (const k of [...keys[kind], 'dashboard_kpis']) void queryClient.invalidateQueries({ queryKey: [k] });
    setSaved(n);
  };

  const locationOptions = (locations.data ?? []).map((l) => ({ id: l.id, label: resolveI18n(l.name_i18n, lng) }));

  return (
    <Modal title={t(`quick.title.${kind}`)} onClose={onClose} closeLabel={t('actions.close')}>
      {saved ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 size={40} className="mx-auto text-status-ok" aria-hidden />
          <p className="text-sm text-ink">{t('quick.saved', { name: saved })}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="secondary" onClick={reset}>{t('quick.addAnother')}</Button>
            <Button type="button" onClick={onClose}>{t('quick.done')}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label={t('quick.name')} htmlFor="quick-name">
            <Input id="quick-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={t(`quick.placeholder.${kind}`)} autoFocus />
          </Field>

          {kind === 'location' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('quick.locationKind')} htmlFor="quick-kind">
                <Select id="quick-kind" value={locationKind} onChange={(e) => setLocationKind(e.target.value as (typeof LOCATION_KINDS)[number])}>
                  {LOCATION_KINDS.map((k) => <option key={k} value={k}>{t(`quick.kinds.${k}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('quick.parent')} htmlFor="quick-parent">
                <Select id="quick-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">{t('quick.none')}</option>
                  {locationOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
              </Field>
            </div>
          )}

          {kind === 'asset' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('quick.location')} htmlFor="quick-location">
                <Select id="quick-location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">{t('quick.none')}</option>
                  {locationOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label={t('quick.assetType')} htmlFor="quick-type">
                <Select id="quick-type" value={assetTypeId} onChange={(e) => setAssetTypeId(e.target.value)}>
                  <option value="">{t('quick.none')}</option>
                  {(assetTypes.data ?? []).filter((a) => a.is_active !== false).map((a) => (
                    <option key={a.id} value={a.id}>{resolveI18n(a.name_i18n, lng)}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {kind === 'part' && (
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('quick.sku')} htmlFor="quick-sku">
                <Input id="quick-sku" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={60} />
              </Field>
              <Field label={t('quick.stock')} htmlFor="quick-stock">
                <Input id="quick-stock" type="number" inputMode="numeric" min={0} value={stock} onChange={(e) => setStock(e.target.value)} />
              </Field>
              <Field label={t('quick.reorder')} htmlFor="quick-reorder">
                <Input id="quick-reorder" type="number" inputMode="numeric" min={0} value={reorder} onChange={(e) => setReorder(e.target.value)} />
              </Field>
            </div>
          )}

          {kind === 'vendor' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('quick.phone')} htmlFor="quick-phone">
                <Input id="quick-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
              </Field>
              <Field label={t('quick.email')} htmlFor="quick-email">
                <Input id="quick-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
              </Field>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-status-crit">{error}</p>}
          <Button type="submit" loading={busy} className="w-full">{t('quick.save')}</Button>
          <p className="text-center text-xs text-ink-muted">{t('quick.moreOnPage')}</p>
        </form>
      )}
    </Modal>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {children}
    </div>
  );
}
