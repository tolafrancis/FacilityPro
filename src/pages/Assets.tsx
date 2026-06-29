import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Boxes } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAssets, useAssetTypes, useLocations } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import type { LocationRow } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import SearchSelect from '../components/ui/SearchSelect';
import BilingualName from '../components/ui/BilingualName';

export default function Assets() {
  const { t, i18n } = useTranslation('assets');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const assets = useAssets();
  const assetTypes = useAssetTypes();
  const locations = useLocations();
  const [open, setOpen] = useState(false);

  const typeName = (id: string | null) => {
    const at = assetTypes.data?.find((x) => x.id === id);
    return at ? resolveI18n(at.name_i18n, lng) : '—';
  };
  const locName = (id: string | null) => {
    const l = locations.data?.find((x) => x.id === id);
    return l ? resolveI18n(l.name_i18n, lng) : '—';
  };

  const create = useMutation({
    mutationFn: async (v: {
      en: string;
      vi: string;
      assetTypeId: string;
      locationId: string;
      serial: string;
      manufacturer: string;
      model: string;
      warranty: string;
    }) => {
      const { error } = await supabase.from('fp_assets').insert({
        org_id: orgId,
        name_i18n: { en: v.en, vi: v.vi || v.en },
        asset_type_id: v.assetTypeId || null,
        location_id: v.locationId || null,
        serial: v.serial || null,
        manufacturer: v.manufacturer || null,
        model: v.model || null,
        warranty_expiry: v.warranty || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets', orgId] });
      setOpen(false);
    },
  });

  // Inline "Other / create new" for the dialog's type & location pickers.
  const createType = async (name: string): Promise<string | null> => {
    const nm = name.trim();
    if (!nm) return null;
    const { data, error } = await supabase
      .from('fp_asset_types')
      .insert({ org_id: orgId, name_i18n: { en: nm, vi: nm } })
      .select('id')
      .single();
    if (error) return null;
    await queryClient.invalidateQueries({ queryKey: ['asset_types', orgId] });
    return data.id as string;
  };
  const createLocation = async (name: string): Promise<string | null> => {
    const nm = name.trim();
    if (!nm) return null;
    const { data, error } = await supabase
      .from('fp_locations')
      .insert({ org_id: orgId, name_i18n: { en: nm, vi: nm }, kind: 'room' })
      .select('id')
      .single();
    if (error) return null;
    await queryClient.invalidateQueries({ queryKey: ['locations', orgId] });
    return data.id as string;
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> {t('add')}
        </Button>
      </div>

      {assets.data?.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <Boxes className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t('columns.name')}</th>
                <th className="px-4 py-2 font-medium">{t('columns.type')}</th>
                <th className="px-4 py-2 font-medium">{t('columns.location')}</th>
                <th className="px-4 py-2 font-medium">{t('columns.serial')}</th>
              </tr>
            </thead>
            <tbody>
              {(assets.data ?? []).map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0 hover:bg-surface">
                  <td className="px-4 py-2">
                    <Link to={`/assets/${a.id}`} className="font-medium text-brand hover:text-brand-600">
                      {resolveI18n(a.name_i18n, lng)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{typeName(a.asset_type_id)}</td>
                  <td className="px-4 py-2 text-ink-muted">{locName(a.location_id)}</td>
                  <td className="px-4 py-2 text-ink-muted">{a.serial ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <AssetDialog
          locations={locations.data ?? []}
          assetTypeOptions={(assetTypes.data ?? []).map((at) => ({
            id: at.id,
            label: resolveI18n(at.name_i18n, lng),
          }))}
          locationLabel={(l) => resolveI18n(l.name_i18n, lng)}
          onCreateType={createType}
          onCreateLocation={createLocation}
          busy={create.isPending}
          onCancel={() => setOpen(false)}
          onSubmit={(v) => create.mutate(v)}
          labels={{
            title: t('form.title'),
            type: t('form.type'),
            location: t('form.location'),
            serial: t('form.serial'),
            manufacturer: t('form.manufacturer'),
            model: t('form.model'),
            warranty: t('form.warranty'),
            create: t('form.create'),
            cancel: tc('actions.cancel'),
            none: tc('common.none'),
          }}
        />
      )}
    </div>
  );
}

interface AssetDialogProps {
  locations: LocationRow[];
  assetTypeOptions: { id: string; label: string }[];
  locationLabel: (l: LocationRow) => string;
  onCreateType: (name: string) => Promise<string | null>;
  onCreateLocation: (name: string) => Promise<string | null>;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: {
    en: string;
    vi: string;
    assetTypeId: string;
    locationId: string;
    serial: string;
    manufacturer: string;
    model: string;
    warranty: string;
  }) => void;
  labels: Record<string, string>;
}

function AssetDialog({
  locations,
  assetTypeOptions,
  locationLabel,
  onCreateType,
  onCreateLocation,
  busy,
  onCancel,
  onSubmit,
  labels,
}: AssetDialogProps) {
  const [en, setEn] = useState('');
  const [vi, setVi] = useState('');
  const [assetTypeId, setAssetTypeId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [serial, setSerial] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [warranty, setWarranty] = useState('');

  const placeableLocations = useMemo(
    () => locations.filter((l) => l.kind === 'room' || l.kind === 'zone' || l.kind === 'floor'),
    [locations]
  );
  const locOptions = placeableLocations.map((l) => ({ id: l.id, label: locationLabel(l) }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    onSubmit({ en, vi, assetTypeId, locationId, serial, manufacturer, model, warranty });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="my-8 w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{labels.title}</h2>
        <div className="mt-4 space-y-4">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{labels.type}</label>
            <SearchSelect
              value={assetTypeId}
              onChange={setAssetTypeId}
              options={assetTypeOptions}
              placeholder="Search or type to add…"
              emptyLabel={labels.none}
              createLabel="Other — create new type"
              onCreate={async (q) => { const id = await onCreateType(q); if (id) setAssetTypeId(id); }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{labels.location}</label>
            <SearchSelect
              value={locationId}
              onChange={setLocationId}
              options={locOptions}
              placeholder="Search or type to add…"
              emptyLabel={labels.none}
              createLabel="Add new location"
              onCreate={async (q) => { const id = await onCreateLocation(q); if (id) setLocationId(id); }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{labels.serial}</label>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{labels.warranty}</label>
              <Input type="date" value={warranty} onChange={(e) => setWarranty(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{labels.manufacturer}</label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{labels.model}</label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button type="submit" loading={busy}>
            {labels.create}
          </Button>
        </div>
      </form>
    </div>
  );
}
