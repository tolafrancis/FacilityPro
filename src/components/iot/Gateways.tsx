import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, RefreshCw, Circle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ago, useGateways } from '../../lib/iot';
import { useLocationLabels } from './locationLabels';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

const GW_PROTOCOLS = ['modbus_tcp', 'modbus_rtu', 'mqtt', 'lorawan', 'bacnet_ip'];

/** Edge gateways (admins manage; managers see status). Keys are admin-only in the UI. */
export default function Gateways({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const { t, i18n } = useTranslation('devices');
  const lng = i18n.resolvedLanguage ?? 'en';
  const queryClient = useQueryClient();
  const gateways = useGateways();
  const labels = useLocationLabels();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState('');
  const [protocols, setProtocols] = useState<string[]>(['modbus_tcp']);
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['gateways', orgId] });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('fp_iot_gateways').insert({
        org_id: orgId, name: name.trim(), location_id: locationId || null, protocols,
      });
      if (error) throw error;
    },
    onSuccess: () => { setAdding(false); setName(''); refresh(); },
  });

  const rotate = useMutation({
    mutationFn: async (id: string) => {
      const key = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
      const { error } = await supabase.from('fp_iot_gateways').update({ gateway_key: key }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('fp_iot_gateways').update({ active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const copy = (text: string, id: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded-xl border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-sm text-ink-muted">{t('iot.gatewaysHint')}</p>
        {isAdmin && (
          <Button className="shrink-0 px-3 py-1.5 text-xs" onClick={() => setAdding((s) => !s)}>
            <Plus size={14} /> {t('iot.addGateway')}
          </Button>
        )}
      </div>

      {adding && (
        <form className="grid grid-cols-1 gap-3 border-b border-line bg-surface p-4 sm:grid-cols-3"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
          <label className="text-xs font-medium text-ink">{t('name')}
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="GW-001" required />
          </label>
          <label className="text-xs font-medium text-ink">{t('iot.location')}
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">—</option>
              {labels.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </label>
          <fieldset className="text-xs font-medium text-ink">
            <legend>{t('iot.protocols')}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {GW_PROTOCOLS.map((p) => (
                <label key={p} className="inline-flex items-center gap-1 font-normal">
                  <input type="checkbox" checked={protocols.includes(p)}
                    onChange={(e) => setProtocols((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p)))} />
                  {t(`iot.protocol.${p}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>{t('iot.cancel')}</Button>
            <Button type="submit" loading={create.isPending}>{t('iot.save')}</Button>
          </div>
        </form>
      )}

      <ul>
        {(gateways.data ?? []).map((g) => {
          const online = !!g.last_seen_at && Date.now() - new Date(g.last_seen_at).getTime() < 5 * 60e3;
          return (
            <li key={g.id} className="border-b border-line px-4 py-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Circle size={10} className={online ? 'fill-status-ok text-status-ok' : 'fill-line text-line'} aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-ink">{g.name}</p>
                    <p className="text-xs text-ink-muted">
                      {labels.label(g.location_id)}
                      {` · ${g.protocols.map((p) => t(`iot.protocol.${p}`, { defaultValue: p })).join(', ')}`}
                      {g.last_seen_at ? ` · ${t('lastSeen')} ${ago(g.last_seen_at, lng)}` : ` · ${t('neverSeen')}`}
                      {g.firmware_version ? ` · ${g.firmware_version}` : ''}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3 text-xs">
                    <button type="button" className="font-medium text-brand" onClick={() => setShown(shown === g.id ? null : g.id)}>
                      {shown === g.id ? t('iot.hideKey') : t('iot.showKey')}
                    </button>
                    <label className="inline-flex items-center gap-1 text-ink">
                      <input type="checkbox" checked={g.active} onChange={(e) => toggle.mutate({ id: g.id, active: e.target.checked })} /> {t('active')}
                    </label>
                  </div>
                )}
              </div>
              {isAdmin && shown === g.id && (
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg bg-surface px-3 py-2 text-xs text-ink">{g.gateway_key}</code>
                  <button type="button" aria-label="copy" onClick={() => copy(g.gateway_key, g.id)} className="text-ink-muted hover:text-ink"><Copy size={15} /></button>
                  <button type="button" aria-label={t('rotate')} title={t('rotate')} onClick={() => rotate.mutate(g.id)} className="text-ink-muted hover:text-status-crit"><RefreshCw size={15} /></button>
                  {copied === g.id && <span className="text-xs text-status-ok">{t('copied')}</span>}
                </div>
              )}
            </li>
          );
        })}
        {(gateways.data ?? []).length === 0 && <li className="p-6 text-center text-sm text-ink-muted">{t('iot.noGateways')}</li>}
      </ul>
    </div>
  );
}
