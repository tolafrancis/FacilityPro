import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Cpu, Circle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAssets, useDevices, useMeters } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate } from '../lib/ui';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';

const KINDS = ['sensor', 'gateway', 'plc', 'meter', 'controller', 'other'];

export default function Devices() {
  const { t, i18n } = useTranslation('devices');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const { currentOrg, role } = useOrg();
  const orgId = currentOrg?.id;
  const isAdmin = role === 'org_admin';

  const devices = useDevices();
  const assets = useAssets();
  const [showAdd, setShowAdd] = useState(false);

  const assetName = (id: string | null) => {
    if (!id) return '—';
    const a = assets.data?.find((x) => x.id === id);
    return a ? resolveI18n(a.name_i18n, lng) : '—';
  };

  const online = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 10 * 60 * 1000; // 10 min
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={16} /> {t('add')}
          </Button>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-line bg-white">
        {(devices.data ?? []).length === 0 ? (
          <div className="p-8 text-center">
            <Cpu className="mx-auto text-ink-muted" aria-hidden />
            <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
          </div>
        ) : (
          <ul>
            {(devices.data ?? []).map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/devices/${d.id}`)}
                  className="flex w-full items-center justify-between border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface"
                >
                  <div className="flex items-center gap-3">
                    <Circle
                      size={10}
                      className={online(d.last_seen_at) ? 'fill-status-ok text-status-ok' : 'fill-line text-line'}
                      aria-hidden
                    />
                    <div>
                      <p className="text-sm font-medium text-ink">{d.name}</p>
                      <p className="text-xs text-ink-muted">
                        {assetName(d.asset_id)}
                        {d.last_seen_at ? ` · ${t('lastSeen')} ${formatDate(d.last_seen_at, lng)}` : ` · ${t('neverSeen')}`}
                      </p>
                    </div>
                  </div>
                  {d.kind && <Pill className="bg-surface text-ink-muted">{d.kind}</Pill>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAdd && orgId && (
        <AddDeviceDialog
          orgId={orgId}
          onClose={() => setShowAdd(false)}
          onCreated={(id) => {
            setShowAdd(false);
            navigate(`/devices/${id}`);
          }}
        />
      )}
    </div>
  );
}

function AddDeviceDialog({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t, i18n } = useTranslation('devices');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const queryClient = useQueryClient();
  const assets = useAssets();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('sensor');
  const [assetId, setAssetId] = useState('');
  const [meterId, setMeterId] = useState('');
  const meters = useMeters(assetId || undefined);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('fp_devices')
        .insert({
          org_id: orgId,
          name: name.trim(),
          kind,
          asset_id: assetId || null,
          meter_id: meterId || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ['devices', orgId] });
      onCreated(id);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{t('addTitle')}</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('name')}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('kind')}</label>
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('asset')}</label>
              <Select value={assetId} onChange={(e) => { setAssetId(e.target.value); setMeterId(''); }}>
                <option value="">{t('noAsset')}</option>
                {(assets.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {resolveI18n(a.name_i18n, lng)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {assetId && (meters.data ?? []).length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('meter')}</label>
              <Select value={meterId} onChange={(e) => setMeterId(e.target.value)}>
                <option value="">{t('noMeter')}</option>
                {(meters.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {resolveI18n(m.name_i18n, lng)}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-ink-muted">{t('meterHint')}</p>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            {tc('actions.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
