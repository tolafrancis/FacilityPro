import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { useAssets, useFaultTypes, useLocations } from '../lib/queries';
import { uploadMedia } from '../lib/media';
import { resolveI18n } from '../i18n/resolver';
import { PRIORITIES } from '../lib/ui';
import type { Priority } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

export default function NewRequest() {
  const { t } = useTranslation('requests');
  const { t: tc } = useTranslation('common');
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const faultTypes = useFaultTypes();
  const locations = useLocations();
  const assets = useAssets();

  const [title, setTitle] = useState('');
  const [faultTypeId, setFaultTypeId] = useState('');
  const [locationId, setLocationId] = useState(params.get('location') ?? '');
  const [assetId, setAssetId] = useState(params.get('asset') ?? '');
  const [severity, setSeverity] = useState<Priority>('medium');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title) {
      setError(tc('common.empty'));
      return;
    }
    setBusy(true);

    // Default priority from the chosen fault type, overridable by severity.
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
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} /> {tc('actions.back')}
      </button>
      <h1 className="text-2xl font-semibold text-ink">{t('form.title')}</h1>

      <form onSubmit={onSubmit} className="mt-5 space-y-4 rounded-xl border border-line bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('form.summary')}</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('form.summaryPlaceholder')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.faultType')}</label>
            <Select value={faultTypeId} onChange={(e) => setFaultTypeId(e.target.value)}>
              <option value="">{t('form.none')}</option>
              {(faultTypes.data ?? []).map((ft) => (
                <option key={ft.id} value={ft.id}>
                  {resolveI18n(ft.name_i18n, lng)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.severity')}</label>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {tc(`severity.${p}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.location')}</label>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">{t('form.none')}</option>
              {(locations.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {resolveI18n(l.name_i18n, lng)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.asset')}</label>
            <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">{t('form.none')}</option>
              {(assets.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {resolveI18n(a.name_i18n, lng)}
                </option>
              ))}
            </Select>
          </div>
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
        <Button type="submit" loading={busy} className="w-full">
          {t('form.submit')}
        </Button>
      </form>
    </div>
  );
}
