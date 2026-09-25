import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { useAssetTypes, useAssets, useFaultTypes, useLocations } from '../lib/queries';
import { uploadMedia } from '../lib/media';
import { resolveI18n } from '../i18n/resolver';
import { PRIORITIES, friendlyError } from '../lib/ui';
import type { Priority } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import SearchSelect from '../components/ui/SearchSelect';

type CreateModal =
  | { kind: 'fault'; query: string }
  | { kind: 'location'; query: string }
  | { kind: 'asset'; query: string }
  | { kind: 'assetType'; query: string }
  | null;

const LOCATION_KINDS = ['building', 'floor', 'room', 'zone'] as const;

export default function NewRequest() {
  const { t } = useTranslation('requests');
  const { t: tc } = useTranslation('common');
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { currentOrg, role } = useOrg();
  const orgId = currentOrg?.id;
  // Tenants report with the essentials only: no asset pickers and no
  // "create new" options (those catalogues are staff data, 0081). An asset
  // or location from a scanned QR code (?asset=, ?location=) is still kept.
  const isTenant = role === 'occupant';
  const queryClient = useQueryClient();

  const faultTypes = useFaultTypes();
  const assetTypes = useAssetTypes();
  const locations = useLocations();
  const assets = useAssets();

  const [title, setTitle] = useState('');
  const [faultTypeId, setFaultTypeId] = useState('');
  const [assetTypeId, setAssetTypeId] = useState('');
  const [locationId, setLocationId] = useState(params.get('location') ?? '');
  const [assetId, setAssetId] = useState(params.get('asset') ?? '');
  const [severity, setSeverity] = useState<Priority>('medium');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState<CreateModal>(null);

  const faultOptions = (faultTypes.data ?? [])
    .filter((ft) => ft.is_active !== false)
    .map((ft) => ({ id: ft.id, label: resolveI18n(ft.name_i18n, lng) }));
  const assetTypeOptions = (assetTypes.data ?? [])
    .filter((at) => at.is_active !== false)
    .map((at) => ({ id: at.id, label: resolveI18n(at.name_i18n, lng) }));
  const locationOptions = (locations.data ?? []).map((l) => ({ id: l.id, label: resolveI18n(l.name_i18n, lng) }));
  const assetOptions = (assets.data ?? []).map((a) => ({ id: a.id, label: resolveI18n(a.name_i18n, lng) }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title) {
      setError(tc('common.empty'));
      return;
    }
    setBusy(true);

    const ft = faultTypes.data?.find((x) => x.id === faultTypeId);
    const priority: Priority = severity ?? ft?.default_priority ?? 'medium';

    const { data, error: insErr } = await supabase
      .from('fp_requests')
      .insert({
        org_id: orgId,
        title,
        body_original: description || null,
        source_lng: lng,
        fault_type_id: faultTypeId || null,
        asset_type_id: assetTypeId || null,
        location_id: locationId || null,
        asset_id: assetId || null,
        severity,
        priority,
        channel: 'web',
        created_by: user?.id ?? null,
      })
      .select('id')
      .single();

    if (insErr) {
      setBusy(false);
      setError(insErr.message);
      return;
    }

    if (file && data && orgId) {
      await uploadMedia({ orgId, file, requestId: data.id });
    }

    setBusy(false);
    navigate(`/requests/${data!.id}`, { replace: true });
  };

  return (
    <div className="max-w-xl">
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> {tc('actions.back')}
      </button>
      <h1 className="text-2xl font-semibold text-ink">{t('form.title')}</h1>

      <form onSubmit={onSubmit} className="mt-5 space-y-4 rounded-xl border border-line bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('form.summary')}</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('form.summaryPlaceholder')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.faultType')}</label>
            <SearchSelect
              value={faultTypeId}
              onChange={setFaultTypeId}
              options={faultOptions}
              placeholder={t('form.none')}
              emptyLabel={t('form.none')}
              createLabel="Create new fault type"
              onCreate={isTenant ? undefined : (query) => setCreateModal({ kind: 'fault', query })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.severity')}</label>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{tc(`severity.${p}`)}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.location')}</label>
            <SearchSelect
              value={locationId}
              onChange={setLocationId}
              options={locationOptions}
              placeholder={t('form.none')}
              emptyLabel={t('form.none')}
              createLabel="Add new location"
              onCreate={isTenant ? undefined : (query) => setCreateModal({ kind: 'location', query })}
            />
          </div>
          {!isTenant && (<>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Asset type</label>
            <SearchSelect
              value={assetTypeId}
              onChange={setAssetTypeId}
              options={assetTypeOptions}
              placeholder={t('form.none')}
              emptyLabel={t('form.none')}
              createLabel="Create new asset type"
              onCreate={(query) => setCreateModal({ kind: 'assetType', query })}
            />
            <p className="mt-1 text-xs text-ink-muted">Category — use when the exact asset isn’t registered.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.asset')}</label>
            <SearchSelect
              value={assetId}
              onChange={setAssetId}
              options={assetOptions}
              placeholder={t('form.none')}
              emptyLabel={t('form.none')}
              createLabel="Create new asset"
              onCreate={(query) => setCreateModal({ kind: 'asset', query })}
            />
            <p className="mt-1 text-xs text-ink-muted">A specific registered asset (optional).</p>
          </div>
          </>)}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('form.description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('form.descriptionPlaceholder')}
            rows={4}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('form.photo')}</label>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />
        </div>
        {error && <p className="text-sm text-status-crit">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">{t('form.submit')}</Button>
      </form>

      {createModal?.kind === 'fault' && (
        <CreateFaultModal
          orgId={orgId}
          initialName={createModal.query}
          onCancel={() => setCreateModal(null)}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['fault_types', orgId] });
            setFaultTypeId(id);
            setCreateModal(null);
          }}
        />
      )}
      {createModal?.kind === 'location' && (
        <CreateLocationModal
          orgId={orgId}
          initialName={createModal.query}
          onCancel={() => setCreateModal(null)}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['locations', orgId] });
            setLocationId(id);
            setCreateModal(null);
          }}
        />
      )}
      {createModal?.kind === 'asset' && (
        <CreateAssetModal
          orgId={orgId}
          initialName={createModal.query}
          onCancel={() => setCreateModal(null)}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['assets', orgId] });
            setAssetId(id);
            setCreateModal(null);
          }}
        />
      )}
      {createModal?.kind === 'assetType' && (
        <CreateAssetTypeModal
          orgId={orgId}
          initialName={createModal.query}
          onCancel={() => setCreateModal(null)}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['asset_types', orgId] });
            setAssetTypeId(id);
            setCreateModal(null);
          }}
        />
      )}
    </div>
  );
}

function CreateAssetTypeModal({ orgId, initialName, onCreated, onCancel }: { orgId: string | undefined; initialName: string; onCreated: (id: string) => void; onCancel: () => void }) {
  const { t: tc } = useTranslation('common');
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('fp_asset_types')
      .insert({ org_id: orgId, name_i18n: { en: name, vi: name } })
      .select('id')
      .single();
    setBusy(false);
    if (error) { setErr(friendlyError(error, tc)); return; }
    onCreated(data.id as string);
  };

  return (
    <ModalShell title="New asset type" onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        {err && <p className="text-sm text-status-crit">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>{tc('actions.cancel')}</Button>
          <Button type="submit" loading={busy}>{tc('actions.create')}</Button>
        </div>
      </form>
    </ModalShell>
  );
}


function CreateAssetModal({ orgId, initialName, onCreated, onCancel }: { orgId: string | undefined; initialName: string; onCreated: (id: string) => void; onCancel: () => void }) {
  const { t: tc } = useTranslation('common');
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const queryClient = useQueryClient();
  const assetTypes = useAssetTypes();
  const locations = useLocations();
  const [name, setName] = useState(initialName);
  const [assetTypeId, setAssetTypeId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const typeOptions = (assetTypes.data ?? [])
    .filter((at) => at.is_active !== false)
    .map((at) => ({ id: at.id, label: resolveI18n(at.name_i18n, lng) }));
  const locOptions = (locations.data ?? []).map((l) => ({ id: l.id, label: resolveI18n(l.name_i18n, lng) }));

  // "Other / specify" — type a name in the search box then click "+ Create".
  const createType = async (q: string) => {
    const nm = q.trim();
    if (!nm) return;
    const { data, error } = await supabase
      .from('fp_asset_types')
      .insert({ org_id: orgId, name_i18n: { en: nm, vi: nm } })
      .select('id')
      .single();
    if (error) { setErr(friendlyError(error, tc)); return; }
    await queryClient.invalidateQueries({ queryKey: ['asset_types', orgId] });
    setAssetTypeId(data.id as string);
  };
  const createLoc = async (q: string) => {
    const nm = q.trim();
    if (!nm) return;
    const { data, error } = await supabase
      .from('fp_locations')
      .insert({ org_id: orgId, name_i18n: { en: nm, vi: nm }, kind: 'room' })
      .select('id')
      .single();
    if (error) { setErr(friendlyError(error, tc)); return; }
    await queryClient.invalidateQueries({ queryKey: ['locations', orgId] });
    setLocationId(data.id as string);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('fp_assets')
      .insert({ org_id: orgId, name_i18n: { en: name, vi: name }, asset_type_id: assetTypeId || null, location_id: locationId || null })
      .select('id')
      .single();
    setBusy(false);
    if (error) { setErr(friendlyError(error, tc)); return; }
    onCreated(data.id as string);
  };

  return (
    <ModalShell title="New asset" onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Asset type</label>
          <SearchSelect
            value={assetTypeId}
            onChange={setAssetTypeId}
            options={typeOptions}
            placeholder="Search or type to add…"
            emptyLabel="None"
            createLabel="Other — create new type"
            onCreate={createType}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Location</label>
          <SearchSelect
            value={locationId}
            onChange={setLocationId}
            options={locOptions}
            placeholder="Search or type to add…"
            emptyLabel="None"
            createLabel="Add new location"
            onCreate={createLoc}
          />
        </div>
        {err && <p className="text-sm text-status-crit">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>{tc('actions.cancel')}</Button>
          <Button type="submit" loading={busy}>{tc('actions.create')}</Button>
        </div>
      </form>
    </ModalShell>
  );
}

function CreateFaultModal({ orgId, initialName, onCreated, onCancel }: { orgId: string | undefined; initialName: string; onCreated: (id: string) => void; onCancel: () => void }) {
  const { t: tc } = useTranslation('common');
  const [name, setName] = useState(initialName);
  const [priority, setPriority] = useState<Priority>('medium');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('fp_fault_types')
      .insert({ org_id: orgId, name_i18n: { en: name, vi: name }, default_priority: priority })
      .select('id')
      .single();
    setBusy(false);
    if (error) { setErr(friendlyError(error, tc)); return; }
    onCreated(data.id as string);
  };

  return (
    <ModalShell title="New fault type" onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Default priority</label>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{tc(`priority.${p}`)}</option>)}
          </Select>
        </div>
        {err && <p className="text-sm text-status-crit">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>{tc('actions.cancel')}</Button>
          <Button type="submit" loading={busy}>{tc('actions.create')}</Button>
        </div>
      </form>
    </ModalShell>
  );
}

function CreateLocationModal({ orgId, initialName, onCreated, onCancel }: { orgId: string | undefined; initialName: string; onCreated: (id: string) => void; onCancel: () => void }) {
  const { t: tc } = useTranslation('common');
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<(typeof LOCATION_KINDS)[number]>('room');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('fp_locations')
      .insert({ org_id: orgId, name_i18n: { en: name, vi: name }, kind })
      .select('id')
      .single();
    setBusy(false);
    if (error) { setErr(friendlyError(error, tc)); return; }
    onCreated(data.id as string);
  };

  return (
    <ModalShell title="New location" onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Kind</label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as (typeof LOCATION_KINDS)[number])}>
            {LOCATION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        </div>
        {err && <p className="text-sm text-status-crit">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>{tc('actions.cancel')}</Button>
          <Button type="submit" loading={busy}>{tc('actions.create')}</Button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({ title, onCancel, children }: { title: string; onCancel: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-ink">{title}</h2>
        {children}
      </div>
    </div>
  );
}
