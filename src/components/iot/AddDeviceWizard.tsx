import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resolveI18n } from '../../i18n/resolver';
import { useAssets } from '../../lib/queries';
import { CATEGORIES, PROTOCOLS, SUPPORTED_PROTOCOLS, useGateways, useIotCatalog, type DeviceCategory, type IotProtocol } from '../../lib/iot';
import { useLocationLabels } from './locationLabels';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

const STEPS = ['where', 'what', 'connect', 'credentials'] as const;
const GATEWAY_PROTOCOLS: IotProtocol[] = ['modbus_tcp', 'modbus_rtu', 'lorawan', 'bacnet_ip', 'bacnet_mstp', 'opcua', 'knx', 'zigbee'];

/**
 * Onboarding: location → category/type → manufacturer/model → protocol,
 * device id and connection → credentials. No code changes are needed for a
 * device whose protocol and model already exist in the catalog.
 */
export default function AddDeviceWizard({ orgId, onClose, onCreated }: { orgId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { t, i18n } = useTranslation('devices');
  const lng = i18n.resolvedLanguage ?? 'en';
  const queryClient = useQueryClient();
  const catalog = useIotCatalog();
  const gateways = useGateways();
  const assets = useAssets();
  const labels = useLocationLabels();

  const [step, setStep] = useState(0);
  const [locationId, setLocationId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [category, setCategory] = useState<DeviceCategory | ''>('');
  const [typeId, setTypeId] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [modelId, setModelId] = useState('');
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<IotProtocol>('mqtt');
  const [externalId, setExternalId] = useState('');
  const [gatewayId, setGatewayId] = useState('');
  const [conn, setConn] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<{ k: string; v: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const c = catalog.data;
  const types = useMemo(() => (c?.types ?? []).filter((x) => !category || x.category === category)
    .sort((a, b) => resolveI18n(a.name_i18n, lng).localeCompare(resolveI18n(b.name_i18n, lng))), [c, category, lng]);
  const models = (c?.models ?? []).filter((m) => (!manufacturerId || m.manufacturer_id === manufacturerId) && (!typeId || !m.device_type_id || m.device_type_id === typeId));
  const model = c?.models.find((m) => m.id === modelId);
  const protocolOptions = model?.protocols.length ? model.protocols : [...PROTOCOLS];
  const needsGateway = GATEWAY_PROTOCOLS.includes(protocol);

  const pickModel = (id: string) => {
    setModelId(id);
    const m = c?.models.find((x) => x.id === id);
    if (m?.protocols.length && !m.protocols.includes(protocol)) setProtocol(m.protocols[0]);
    if (m?.device_type_id) setTypeId(m.device_type_id);
    if (m && !name) setName(`${c?.manufacturers.find((x) => x.id === m.manufacturer_id)?.name ?? ''} ${m.model}`.trim());
  };

  const connection = (): Record<string, unknown> => {
    const num = (k: string) => (conn[k] ? Number(conn[k]) : undefined);
    switch (protocol) {
      case 'modbus_tcp': return { host: conn.host, port: num('port') ?? 502, unit_id: num('unit_id') ?? 1, poll_seconds: num('poll_seconds') ?? 60 };
      case 'modbus_rtu': return { serial_port: conn.serial_port, baud_rate: num('baud_rate') ?? 9600, parity: conn.parity || 'none', unit_id: num('unit_id') ?? 1, poll_seconds: num('poll_seconds') ?? 60 };
      case 'lorawan': return { join_eui: conn.join_eui || undefined };
      case 'mqtt': return conn.url ? { url: conn.url } : {};
      case 'bacnet_ip': return { host: conn.host, device_instance: num('device_instance') };
      case 'opcua': return { endpoint: conn.endpoint };
      default: return {};
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      const { data, error: e1 } = await supabase.from('fp_devices').insert({
        org_id: orgId, name: name.trim(), kind: 'sensor', location_id: locationId || null, asset_id: assetId || null,
        device_type_id: typeId || null, model_id: modelId || null, protocol, external_id: externalId.trim() || null,
        gateway_id: needsGateway ? gatewayId || null : null, connection_config: JSON.parse(JSON.stringify(connection())),
      }).select('id').single();
      if (e1) throw e1;
      if (modelId) {
        const { error: e2 } = await supabase.rpc('fp_device_apply_model', { p_device: data.id });
        if (e2) throw e2;
      }
      const s = Object.fromEntries(secrets.filter((x) => x.k.trim() && x.v).map((x) => [x.k.trim(), x.v]));
      if (Object.keys(s).length) {
        const { error: e3 } = await supabase.rpc('fp_device_set_credentials', { p_device: data.id, p_secrets: s });
        if (e3) throw e3;
      }
      return data.id as string;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ['device_directory', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['devices', orgId] });
      onCreated(id);
    },
    onError: (e: Error) => setError(e.message),
  });

  const field = (k: string, label: string, props: Record<string, unknown> = {}) => (
    <label key={k} className="text-xs font-medium text-ink">
      {label}
      <Input value={conn[k] ?? ''} onChange={(e) => setConn((s) => ({ ...s, [k]: e.target.value }))} {...props} />
    </label>
  );

  const canNext = [
    true,
    !!name.trim(),
    (!needsGateway || !!gatewayId) && (protocol !== 'modbus_tcp' || !!conn.host) && (protocol !== 'modbus_rtu' || !!conn.serial_port)
      && (protocol !== 'lorawan' || /^[0-9a-fA-F]{16}$/.test(externalId.trim())),
    true,
  ][step];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-line bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{t('addTitle')}</h2>
        <ol className="mt-3 flex gap-1" aria-label={t('iot.steps')}>
          {STEPS.map((s, i) => (
            <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} title={t(`iot.step.${s}`)} />
          ))}
        </ol>
        <p className="mt-2 text-sm font-medium text-ink">{t(`iot.step.${STEPS[step]}`)}</p>

        <div className="mt-4 space-y-3">
          {step === 0 && (
            <>
              <label className="block text-xs font-medium text-ink">{t('iot.location')}
                <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">{t('iot.noLocation')}</option>
                  {labels.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
              </label>
              <label className="block text-xs font-medium text-ink">{t('asset')}
                <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                  <option value="">{t('noAsset')}</option>
                  {(assets.data ?? []).filter((a) => a.status === 'active' && (!locationId || !a.location_id || a.location_id === locationId))
                    .map((a) => <option key={a.id} value={a.id}>{resolveI18n(a.name_i18n, lng)}</option>)}
                </Select>
              </label>
              <p className="text-xs text-ink-muted">{t('iot.whereHint')}</p>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-ink">{t('iot.category')}
                  <Select value={category} onChange={(e) => { setCategory(e.target.value as DeviceCategory); setTypeId(''); }}>
                    <option value="">{t('iot.all')}</option>
                    {CATEGORIES.map((x) => <option key={x} value={x}>{t(`iot.categories.${x}`)}</option>)}
                  </Select>
                </label>
                <label className="text-xs font-medium text-ink">{t('kind')}
                  <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                    <option value="">—</option>
                    {types.map((x) => <option key={x.id} value={x.id}>{resolveI18n(x.name_i18n, lng)}</option>)}
                  </Select>
                </label>
                <label className="text-xs font-medium text-ink">{t('iot.manufacturer')}
                  <Select value={manufacturerId} onChange={(e) => { setManufacturerId(e.target.value); setModelId(''); }}>
                    <option value="">—</option>
                    {(c?.manufacturers ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                </label>
                <label className="text-xs font-medium text-ink">{t('iot.model')}
                  <Select value={modelId} onChange={(e) => pickModel(e.target.value)}>
                    <option value="">{t('iot.noModel')}</option>
                    {models.map((m) => <option key={m.id} value={m.id}>{m.model}</option>)}
                  </Select>
                </label>
              </div>
              {model?.notes && <p className="text-xs text-ink-muted">{model.notes}</p>}
              <label className="block text-xs font-medium text-ink">{t('name')}
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} required />
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-ink">{t('iot.protocolLabel')}
                  <Select value={protocol} onChange={(e) => { setProtocol(e.target.value as IotProtocol); setConn({}); }}>
                    {protocolOptions.map((p) => (
                      <option key={p} value={p}>
                        {t(`iot.protocol.${p}`)}{SUPPORTED_PROTOCOLS.includes(p) ? '' : ` (${t('iot.planned')})`}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="text-xs font-medium text-ink">{protocol === 'lorawan' ? 'DevEUI' : t('iot.externalId')}
                  <Input value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder={protocol === 'lorawan' ? '70B3D57ED0000001' : t('iot.externalIdPlaceholder')} />
                </label>
              </div>
              {needsGateway && (
                <label className="block text-xs font-medium text-ink">{protocol === 'lorawan' ? t('iot.networkServer') : t('iot.gateway')}
                  <Select value={gatewayId} onChange={(e) => setGatewayId(e.target.value)}>
                    <option value="">—</option>
                    {(gateways.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                  {(gateways.data ?? []).length === 0 && <span className="mt-1 block font-normal text-ink-muted">{t('iot.addGatewayFirst')}</span>}
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                {protocol === 'modbus_tcp' && [field('host', t('iot.host'), { placeholder: '192.168.1.50' }), field('port', t('brokerPort'), { type: 'number', placeholder: '502' }),
                  field('unit_id', t('iot.unitId'), { type: 'number', placeholder: '1' }), field('poll_seconds', t('iot.pollSeconds'), { type: 'number', placeholder: '60' })]}
                {protocol === 'modbus_rtu' && [field('serial_port', t('iot.serialPort'), { placeholder: '/dev/ttyUSB0' }), field('baud_rate', t('iot.baudRate'), { type: 'number', placeholder: '9600' }),
                  field('parity', t('iot.parity'), { placeholder: 'none' }), field('unit_id', t('iot.unitId'), { type: 'number', placeholder: '1' })]}
                {protocol === 'lorawan' && field('join_eui', 'JoinEUI (AppEUI)')}
                {protocol === 'bacnet_ip' && [field('host', t('iot.host')), field('device_instance', t('iot.deviceInstance'), { type: 'number' })]}
                {protocol === 'opcua' && field('endpoint', t('iot.endpoint'), { placeholder: 'opc.tcp://…' })}
                {protocol === 'mqtt' && field('url', t('iot.localBroker'), { placeholder: t('iot.localBrokerPlaceholder') })}
              </div>
              <p className="text-xs text-ink-muted">{t(`iot.connectHint.${needsGateway ? 'gateway' : 'direct'}`)}</p>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-xs text-ink-muted">{t('iot.credentialsHint')}</p>
              {secrets.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={s.k} onChange={(e) => setSecrets((x) => x.map((y, j) => (j === i ? { ...y, k: e.target.value } : y)))} placeholder={protocol === 'lorawan' ? 'app_key' : 'api_token'} />
                  <Input type="password" autoComplete="new-password" value={s.v} onChange={(e) => setSecrets((x) => x.map((y, j) => (j === i ? { ...y, v: e.target.value } : y)))} />
                  <button type="button" aria-label={t('iot.delete')} onClick={() => setSecrets((x) => x.filter((_, j) => j !== i))} className="text-ink-muted hover:text-status-crit"><Trash2 size={15} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setSecrets((x) => [...x, { k: '', v: '' }])} className="inline-flex items-center gap-1 text-sm font-medium text-brand">
                <Plus size={14} /> {t('iot.addSecret')}
              </button>
              <p className="rounded-lg bg-surface p-3 text-xs text-ink-muted">{t('iot.afterSave')}</p>
            </>
          )}
          {error && <p className="text-sm text-status-crit">{error}</p>}
        </div>

        <div className="mt-6 flex justify-between gap-2">
          <Button type="button" variant="secondary" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}>
            {step === 0 ? t('iot.cancel') : t('iot.back')}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>{t('iot.next')}</Button>
          ) : (
            <Button type="button" loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>{t('iot.saveAndTest')}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
