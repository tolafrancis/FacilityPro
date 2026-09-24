import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Asset, AssetStatus, LocationRow } from '../lib/database.types';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';
import SearchSelect from './ui/SearchSelect';
import BilingualName from './ui/BilingualName';

export const ASSET_STATUSES: AssetStatus[] = ['active', 'inactive', 'retired', 'disposed'];

export interface AssetFormValues {
  en: string;
  vi: string;
  assetTypeId: string;
  locationId: string;
  serial: string;
  manufacturer: string;
  model: string;
  warranty: string;
  status: AssetStatus;
}

interface Props {
  /** Editing an existing asset; omitted when creating. */
  initial?: Asset;
  locations: LocationRow[];
  assetTypeOptions: { id: string; label: string }[];
  locationLabel: (l: LocationRow) => string;
  onCreateType: (name: string) => Promise<string | null>;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (v: AssetFormValues) => void;
}

// Create / edit form for an asset. Locations are picked from the site tree
// only (no inline "create location"): a location made here had no site or
// parent, which let site-scoped users see its work (audit S1-M1).
export default function AssetDialog({
  initial,
  locations,
  assetTypeOptions,
  locationLabel,
  onCreateType,
  busy,
  error,
  onCancel,
  onSubmit,
}: Props) {
  const { t } = useTranslation('assets');
  const { t: tc } = useTranslation('common');
  const [en, setEn] = useState(initial?.name_i18n.en ?? '');
  const [vi, setVi] = useState(initial?.name_i18n.vi ?? '');
  const [assetTypeId, setAssetTypeId] = useState(initial?.asset_type_id ?? '');
  const [locationId, setLocationId] = useState(initial?.location_id ?? '');
  const [serial, setSerial] = useState(initial?.serial ?? '');
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [warranty, setWarranty] = useState(initial?.warranty_expiry ?? '');
  const [status, setStatus] = useState<AssetStatus>(initial?.status ?? 'active');

  const locOptions = useMemo(
    () =>
      locations
        .filter((l) => l.kind === 'room' || l.kind === 'zone' || l.kind === 'floor')
        .map((l) => ({ id: l.id, label: locationLabel(l) })),
    [locations, locationLabel]
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    onSubmit({ en, vi, assetTypeId, locationId, serial, manufacturer, model, warranty, status });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-black/30 p-4">
      <form onSubmit={submit} className="my-8 w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{initial ? t('form.editTitle') : t('form.title')}</h2>
        <div className="mt-4 space-y-4">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.type')}</label>
            <SearchSelect
              value={assetTypeId}
              onChange={setAssetTypeId}
              options={assetTypeOptions}
              placeholder={t('form.searchOrAdd')}
              emptyLabel={tc('common.none')}
              createLabel={t('form.createType')}
              onCreate={async (q) => {
                const id = await onCreateType(q);
                if (id) setAssetTypeId(id);
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.location')}</label>
            <SearchSelect
              value={locationId}
              onChange={setLocationId}
              options={locOptions}
              placeholder={t('form.searchOrAdd')}
              emptyLabel={tc('common.none')}
            />
            <p className="mt-1 text-xs text-ink-muted">
              <Link to="/locations" className="text-brand hover:text-brand-600">{t('form.locationHint')}</Link>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('form.serial')}</label>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('form.warranty')}</label>
              <Input type="date" value={warranty} onChange={(e) => setWarranty(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('form.manufacturer')}</label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('form.model')}</label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          </div>
          {initial && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('form.status')}</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value as AssetStatus)}>
                {ASSET_STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </Select>
              {(status === 'retired' || status === 'disposed') && initial.status !== status && (
                <p className="mt-1 text-xs text-ink-muted">{t('actions.retireHint')}</p>
              )}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-status-crit">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {initial ? t('form.save') : t('form.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
