import { useState, type FormEvent, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, RefreshCw, Trash2, Plus, Circle, Battery, Signal, Radio } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAssets, useDevice, useDeviceConnection, useDeviceRules } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITIES } from '../lib/ui';
import type { DeviceConnProtocol, DeviceRuleAction, DeviceRuleOp, Priority } from '../lib/database.types';
import { ago, ALERT_SEVERITIES, formatValue, STATUS_DOT, useDirectoryDevice, useGateways, useIotCatalog, type AlertSeverity } from '../lib/iot';
import { useLocationLabels } from '../components/iot/locationLabels';
import LiveAndHistory from '../components/iot/LiveAndHistory';
import DeviceAlerts from '../components/iot/DeviceAlerts';
import DeviceCommands from '../components/iot/DeviceCommands';
import DataPoints from '../components/iot/DataPoints';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import NotFound from '../components/NotFound';

const OPS: DeviceRuleOp[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'pct_above_baseline', 'pct_below_baseline'];
const OP_SYMBOL: Record<DeviceRuleOp, string> = {
  gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠', pct_above_baseline: '% ↑ baseline', pct_below_baseline: '% ↓ baseline',
};
const ACTIONS: DeviceRuleAction[] = ['alert', 'notify', 'work_order', 'both'];
const TABS = ['overview', 'alerts', 'commands', 'dataPoints', 'rules', 'maintenance', 'connection'] as const;
type Tab = (typeof TABS)[number];

const ENV = import.meta.env as Record<string, string | undefined>;
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co';
const ANON = ENV.VITE_SUPABASE_ANON_KEY ?? 'YOUR-ANON-KEY';

function signalLabel(rssi: number | null) {
  if (rssi === null) return null;
  return rssi >= -70 ? 'good' : rssi >= -90 ? 'fair' : 'poor';
}

export default function DeviceDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('devices');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { role } = useOrg();
  const isAdmin = role === 'org_admin';
  const isManager = isAdmin || role === 'manager';
  const isStaff = isManager || role === 'technician';
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');

  const device = useDirectoryDevice(id);
  const keyed = useDevice(id, isManager); // key + admin settings
  const rules = useDeviceRules(isManager ? id : undefined);
  const labels = useLocationLabels();
  const gateways = useGateways(isManager);
  const catalog = useIotCatalog();
  const [showRule, setShowRule] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const d = device.data;
  const k = keyed.data;

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['device', id] });
    void queryClient.invalidateQueries({ queryKey: ['device_directory_row', id] });
    void queryClient.invalidateQueries({ queryKey: ['device_directory'] });
  };

  const rotate = useMutation({
    mutationFn: async () => {
      const key = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
      const { error } = await supabase.from('fp_devices').update({ device_key: key }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from('fp_devices').update(patch).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase.from('fp_device_rules').delete().eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device_rules', id] }),
  });

  // Maintenance history of the asset this device monitors.
  const requests = useQuery({
    queryKey: ['device_asset_requests', d?.asset_id],
    enabled: !!d?.asset_id && tab === 'maintenance',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_requests')
        .select('id, title, status, severity, created_at')
        .eq('asset_id', d!.asset_id!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as { id: string; title: string; status: string; severity: string | null; created_at: string }[];
    },
  });
  const assets = useAssets();

  if (device.isLoading) return <p className="text-sm text-ink-muted">{tc('loading')}</p>;
  if (!d) return <NotFound backTo="/devices" backLabel={t('title')} />;

  const key = k?.device_key ?? '';
  const rpcExample = `curl -X POST "${SUPABASE_URL}/rest/v1/rpc/fp_device_ingest" \\
  -H "apikey: ${ANON}" \\
  -H "Content-Type: application/json" \\
  -d '{"p_key":"${key}","p_metric":"temperature","p_value":22.5,"p_unit":"C"}'`;
  const fnExample = `curl -X POST "${SUPABASE_URL}/functions/v1/iot-ingest" \\
  -H "x-device-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"temperature":22.5,"humidity":60}'`;
  const topic = `facilitypro/${d.org_id}/${d.site_id ?? '-'}/${d.external_id || d.id}`;
  const gatewayName = d.gateway_id ? gateways.data?.find((g) => g.id === d.gateway_id)?.name ?? '—' : null;
  const type = catalog.data?.types.find((x) => x.id === d.device_type_id);
  const asset = assets.data?.find((a) => a.id === d.asset_id);
  const sig = signalLabel(d.signal_rssi);
  const visibleTabs = TABS.filter((x) => (x === 'rules' || x === 'connection' ? isManager : true));

  return (
    <div className="max-w-4xl">
      <Link to="/devices" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> {t('title')}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink">
            <Circle size={12} className={STATUS_DOT[d.status]} aria-hidden /> {d.name}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {t(`iot.status.${d.status}`)}
            {d.last_seen_at ? ` · ${t('lastSeen')} ${ago(d.last_seen_at, lng)}` : ''}
            {d.location_id ? ` · ${labels.label(d.location_id)}` : ''}
          </p>
          {k?.offline_alerted_at && <p className="mt-1 text-sm font-medium text-status-crit">{t('offline.now')}</p>}
        </div>
        {isAdmin && k && (
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setEditing((s) => !s)}>{t('iot.edit')}</Button>
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={k.active} onChange={(e) => update.mutate({ active: e.target.checked })} className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30" />
              {t('active')}
            </label>
          </div>
        )}
      </div>

      {editing && k && <EditDevice deviceId={d.id} device={k} onDone={() => { setEditing(false); refresh(); }} />}

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {visibleTabs.map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${tab === x ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}>
            {t(`iot.detailTabs.${x}`)}
            {x === 'alerts' && d.open_alerts > 0 && <span className="ml-1.5 rounded-full bg-status-crit px-1.5 text-[11px] text-white">{d.open_alerts}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {d.status === 'never' && (
            <section className="mt-6 rounded-xl border border-dashed border-brand/40 bg-brand-50 p-4">
              <h2 className="font-semibold text-ink">{t('iot.waitingTitle')}</h2>
              <p className="mt-1 text-sm text-ink">{t(`iot.waiting.${d.gateway_id ? 'gateway' : d.protocol === 'lorawan' ? 'lorawan' : 'direct'}`)}</p>
              {!d.gateway_id && d.protocol === 'mqtt' && <p className="mt-2 font-mono text-xs text-ink">{topic}/telemetry</p>}
            </section>
          )}
          <section className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-line bg-white p-4 text-sm sm:grid-cols-3">
            <Fact label={t('kind')} value={type ? resolveI18n(type.name_i18n, lng) : d.kind ? t(`kinds.${d.kind}`, { defaultValue: d.kind }) : '—'} />
            <Fact label={t('iot.manufacturer')} value={[d.manufacturer, d.model].filter(Boolean).join(' ') || '—'} />
            <Fact label={t('iot.protocolLabel')} value={d.protocol ? t(`iot.protocol.${d.protocol}`) : '—'} />
            <Fact label={d.protocol === 'lorawan' ? 'DevEUI' : t('iot.externalId')} value={d.external_id ?? '—'} mono />
            <Fact label={t('iot.gateway')} value={d.gateway_id ? gatewayName ?? '—' : t('iot.direct')} />
            <Fact label={t('asset')} value={asset ? <Link className="text-brand hover:underline" to={`/assets/${asset.id}`}>{resolveI18n(asset.name_i18n, lng)}</Link> : '—'} />
            <Fact label={t('iot.battery')} value={d.battery_pct !== null ? <span className={d.battery_low ? 'text-amber-600' : ''}><Battery size={14} className="mr-1 inline" aria-hidden />{formatValue(d.battery_pct, '%')}</span> : '—'} />
            <Fact label={t('iot.signal')} value={sig ? <span><Signal size={14} className="mr-1 inline" aria-hidden />{t(`iot.signalQuality.${sig}`)} ({formatValue(d.signal_rssi, 'dBm')})</span> : '—'} />
            <Fact label={t('iot.firmware')} value={d.firmware_version ?? '—'} />
          </section>
          <LiveAndHistory device={d} />
        </>
      )}

      {tab === 'alerts' && (
        <section className="mt-6 rounded-xl border border-line bg-white px-4">
          <DeviceAlerts deviceId={d.id} canAct={isStaff} />
        </section>
      )}

      {tab === 'commands' && <DeviceCommands device={d} />}

      {tab === 'dataPoints' && <DataPoints device={d} isAdmin={isAdmin} />}

      {tab === 'maintenance' && (
        <section className="mt-6 rounded-xl border border-line bg-white p-4">
          <h2 className="font-semibold text-ink">{t('iot.maintenance')}</h2>
          {!d.asset_id ? (
            <p className="mt-2 text-sm text-ink-muted">{t('iot.noAssetLinked')}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-muted">
                {t('iot.maintenanceHint')}{' '}
                <Link to={`/assets/${d.asset_id}`} className="text-brand hover:underline">{t('iot.openAsset')}</Link>
              </p>
              <ul className="mt-3 divide-y divide-line text-sm">
                {(requests.data ?? []).map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2">
                    <Link to={`/requests/${r.id}`} className="text-ink hover:underline">{r.title}</Link>
                    <span className="text-xs text-ink-muted">{r.status} · {formatDate(r.created_at, lng)}</span>
                  </li>
                ))}
                {(requests.data ?? []).length === 0 && <li className="py-2 text-ink-muted">{t('iot.noRequests')}</li>}
              </ul>
            </>
          )}
        </section>
      )}

      {tab === 'rules' && isManager && (
        <section className="mt-6 rounded-xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">{t('rules')}</h2>
            {isAdmin && (
              <button type="button" onClick={() => setShowRule((s) => !s)} className="inline-flex items-center gap-1 text-sm font-medium text-brand">
                <Plus size={15} /> {t('addRule')}
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">{t('rulesHint')}</p>
          {showRule && <RuleForm deviceId={d.id} orgId={d.org_id} onDone={() => setShowRule(false)} />}
          <ul className="mt-3 divide-y divide-line">
            {(rules.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-ink">
                  <span className="font-medium">{r.metric || t('anyMetric')}</span> {OP_SYMBOL[r.op]} {r.threshold}
                  {(r.conditions ?? []).map((c, i) => <span key={i} className="text-ink-muted"> {t('iot.and')} {c.metric} {OP_SYMBOL[c.op as DeviceRuleOp] ?? c.op} {c.threshold}</span>)}
                  {' → '}
                  <Pill className="bg-surface text-ink-muted">{t(`actions.${r.action}`)}</Pill>{' '}
                  <Pill className="bg-surface text-ink-muted">{t(`iot.severity.${r.alert_severity ?? 'warning'}`)}</Pill>
                  {r.escalate_after_minutes ? <span className="text-xs text-ink-muted"> · {t('iot.escalatesAfter', { minutes: r.escalate_after_minutes })}</span> : null}
                </span>
                {isAdmin && (
                  <button type="button" aria-label={t('iot.delete')} onClick={() => deleteRule.mutate(r.id)} className="text-ink-muted hover:text-status-crit">
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
            {(rules.data ?? []).length === 0 && <li className="py-2 text-sm text-ink-muted">{t('noRules')}</li>}
          </ul>
        </section>
      )}

      {tab === 'connection' && isManager && k && (
        <>
          <section className="mt-6 rounded-xl border border-line bg-white p-4">
            <h2 className="font-semibold text-ink">{t('connection')}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t('connectionHint')}</p>
            {isAdmin && (
              <label className="mt-3 flex items-center gap-2 text-sm text-ink">
                {t('offline.label')}
                <select value={k.offline_after_minutes ?? ''} onChange={(e) => update.mutate({ offline_after_minutes: e.target.value ? Number(e.target.value) : null })}
                  className="rounded-lg border border-line bg-white px-2 py-1 text-sm">
                  <option value="">{t('offline.never')}</option>
                  {[15, 30, 60, 240, 1440].map((m) => <option key={m} value={m}>{t(`offline.after.${m}`)}</option>)}
                </select>
              </label>
            )}
            <div className="mt-3">
              <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('deviceKey')}</label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-surface px-3 py-2 text-xs text-ink">{key}</code>
                <button type="button" onClick={() => copy(key, 'key')} className="text-ink-muted hover:text-ink" aria-label="copy"><Copy size={15} /></button>
                {isAdmin && (
                  <button type="button" onClick={() => rotate.mutate()} className="text-ink-muted hover:text-status-crit" aria-label="rotate" title={t('rotate')}>
                    <RefreshCw size={15} />
                  </button>
                )}
              </div>
              {copied === 'key' && <p className="mt-1 text-xs text-status-ok">{t('copied')}</p>}
            </div>
            <CodeBlock title={t('exampleRpc')} code={rpcExample} onCopy={() => copy(rpcExample, 'rpc')} copied={copied === 'rpc'} copiedLabel={t('copied')} />
            <CodeBlock title={t('exampleFn')} code={fnExample} onCopy={() => copy(fnExample, 'fn')} copied={copied === 'fn'} copiedLabel={t('copied')} />
            <p className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
              <Radio size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>{t('iot.topicHint')} <code className="font-mono text-ink">{topic}/telemetry</code> · <code className="font-mono text-ink">{topic}/command</code></span>
            </p>
            <p className="mt-2 text-xs text-ink-muted">{t('mqttHint')}</p>
          </section>
          {isAdmin && <BrokerConnection deviceId={d.id} orgId={d.org_id} />}
        </>
      )}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-muted">{label}</p>
      <div className={`truncate text-ink ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}

function EditDevice({ deviceId, device, onDone }: { deviceId: string; device: import('../lib/database.types').Device; onDone: () => void }) {
  const { t, i18n } = useTranslation('devices');
  const lng = i18n.resolvedLanguage ?? 'en';
  const labels = useLocationLabels();
  const gateways = useGateways();
  const assets = useAssets();
  const [name, setName] = useState(device.name);
  const [locationId, setLocationId] = useState(device.location_id ?? '');
  const [assetId, setAssetId] = useState(device.asset_id ?? '');
  const [gatewayId, setGatewayId] = useState(device.gateway_id ?? '');
  const [externalId, setExternalId] = useState(device.external_id ?? '');
  const [connText, setConnText] = useState(JSON.stringify(device.connection_config ?? {}, null, 0));
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      let connection_config: unknown;
      try {
        connection_config = JSON.parse(connText || '{}');
      } catch {
        throw new Error(t('iot.invalidJson'));
      }
      const { error } = await supabase.from('fp_devices').update({
        name: name.trim(), location_id: locationId || null, asset_id: assetId || null, gateway_id: gatewayId || null,
        external_id: externalId.trim() || null, connection_config,
      }).eq('id', deviceId);
      if (error) throw error;
    },
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <form className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2"
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate(); }}>
      <label className="text-xs font-medium text-ink">{t('name')}<Input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label className="text-xs font-medium text-ink">{t('iot.location')}
        <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">{t('iot.noLocation')}</option>
          {labels.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      </label>
      <label className="text-xs font-medium text-ink">{t('asset')}
        <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">{t('noAsset')}</option>
          {(assets.data ?? []).filter((a) => a.status === 'active' || a.id === assetId).map((a) => <option key={a.id} value={a.id}>{resolveI18n(a.name_i18n, lng)}</option>)}
        </Select>
      </label>
      <label className="text-xs font-medium text-ink">{t('iot.gateway')}
        <Select value={gatewayId} onChange={(e) => setGatewayId(e.target.value)}>
          <option value="">{t('iot.direct')}</option>
          {(gateways.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      </label>
      <label className="text-xs font-medium text-ink">{t('iot.externalId')}<Input value={externalId} onChange={(e) => setExternalId(e.target.value)} /></label>
      <label className="text-xs font-medium text-ink">{t('iot.connectionSettings')}
        <Input className="font-mono text-xs" value={connText} onChange={(e) => setConnText(e.target.value)} />
      </label>
      {err && <p className="text-xs text-status-crit sm:col-span-2">{err}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onDone}>{t('iot.cancel')}</Button>
        <Button type="submit" loading={save.isPending}>{t('iot.save')}</Button>
      </div>
    </form>
  );
}

function CodeBlock({
  title,
  code,
  onCopy,
  copied,
  copiedLabel,
}: {
  title: string;
  code: string;
  onCopy: () => void;
  copied: boolean;
  copiedLabel: string;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">{title}</label>
        <button type="button" onClick={onCopy} className="text-ink-muted hover:text-ink" aria-label="copy">
          <Copy size={14} />
        </button>
      </div>
      <pre className="mt-1 overflow-x-auto rounded-lg bg-ink/95 p-3 text-xs text-white">{code}</pre>
      {copied && <p className="mt-1 text-xs text-status-ok">{copiedLabel}</p>}
    </div>
  );
}

const PROTOCOLS: DeviceConnProtocol[] = ['mqtt', 'mqtts', 'ws', 'wss'];
const DEFAULT_PORT: Record<DeviceConnProtocol, number> = { mqtt: 1883, mqtts: 8883, ws: 80, wss: 443 };

function BrokerConnection({ deviceId, orgId }: { deviceId: string; orgId: string }) {
  const { t, i18n } = useTranslation('devices');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const queryClient = useQueryClient();
  const conn = useDeviceConnection(deviceId);
  const c = conn.data;

  const [protocol, setProtocol] = useState<DeviceConnProtocol>('mqtt');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('1883');
  const [topic, setTopic] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [clientId, setClientId] = useState('');
  const [qos, setQos] = useState('0');
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  // Hydrate the form once from the saved row (and again if it's replaced/deleted).
  const sig = c?.id ?? 'none';
  if (hydratedId !== sig) {
    setHydratedId(sig);
    setProtocol(c?.protocol ?? 'mqtt');
    setHost(c?.host ?? '');
    setPort(String(c?.port ?? DEFAULT_PORT[c?.protocol ?? 'mqtt']));
    setTopic(c?.topic ?? '');
    setUsername(c?.username ?? '');
    setPassword(c?.password ?? '');
    setClientId(c?.client_id ?? '');
    setQos(String(c?.qos ?? 0));
  }

  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      const row = {
        org_id: orgId,
        device_id: deviceId,
        protocol,
        host: host.trim(),
        port: parseInt(port, 10) || DEFAULT_PORT[protocol],
        topic: topic.trim(),
        username: username.trim() || null,
        password: password.trim() || null,
        client_id: clientId.trim() || null,
        qos: (parseInt(qos, 10) || 0) as 0 | 1 | 2,
        enabled,
      };
      const { error } = await supabase
        .from('fp_device_connections')
        .upsert(row, { onConflict: 'device_id' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device_connection', deviceId] }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('fp_device_connections').delete().eq('device_id', deviceId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device_connection', deviceId] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!host.trim() || !topic.trim()) return;
    save.mutate(c?.enabled ?? true);
  };

  const onProtocol = (p: DeviceConnProtocol) => {
    setProtocol(p);
    // Only auto-fill the port if it still matches a known default (don't clobber a custom one).
    if (!port || Object.values(DEFAULT_PORT).includes(parseInt(port, 10))) setPort(String(DEFAULT_PORT[p]));
  };

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">{t('broker')}</h2>
        {c && (
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={c.enabled}
              onChange={(e) => save.mutate(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
            />
            {t('brokerEnabled')}
          </label>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-muted">{t('brokerHint')}</p>

      {c && (
        <div className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs">
          {c.last_error ? (
            <p className="text-status-crit">{t('brokerError', { error: c.last_error })}</p>
          ) : c.last_connected_at ? (
            <p className="text-status-ok">{t('brokerConnected', { when: formatDate(c.last_connected_at, lng) })}</p>
          ) : (
            <p className="text-ink-muted">{t('brokerPending')}</p>
          )}
        </div>
      )}

      <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('brokerProtocol')}</label>
          <Select value={protocol} onChange={(e) => onProtocol(e.target.value as DeviceConnProtocol)}>
            {PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink">{t('brokerHost')}</label>
          <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder={t('brokerHostPlaceholder')} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('brokerPort')}</label>
          <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} />
        </div>
        <div className="col-span-2 sm:col-span-4">
          <label className="mb-1 block text-xs font-medium text-ink">{t('brokerTopic')}</label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('brokerTopicPlaceholder')} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('brokerUsername')}</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('brokerPassword')}</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('brokerClientId')}</label>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={t('brokerClientIdPlaceholder')} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('brokerQos')}</label>
          <Select value={qos} onChange={(e) => setQos(e.target.value)}>
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
          </Select>
        </div>
        <div className="col-span-2 mt-1 flex items-end gap-2 sm:col-span-4">
          <Button type="submit" loading={save.isPending} disabled={!host.trim() || !topic.trim()}>
            {c ? tc('actions.save') : tc('actions.create')}
          </Button>
          {c && (
            <Button type="button" variant="secondary" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t('brokerRemove')}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function RuleForm({ deviceId, orgId, onDone }: { deviceId: string; orgId: string; onDone: () => void }) {
  const { t } = useTranslation('devices');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();
  const [metric, setMetric] = useState('');
  const [op, setOp] = useState<DeviceRuleOp>('gt');
  const [threshold, setThreshold] = useState('');
  const [action, setAction] = useState<DeviceRuleAction>('both');
  const [severity, setSeverity] = useState<Priority>('high');
  const [cooldown, setCooldown] = useState('60');
  const [message, setMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState<AlertSeverity>('warning');
  const [condMetric, setCondMetric] = useState('');
  const [condOp, setCondOp] = useState<DeviceRuleOp>('gt');
  const [condThreshold, setCondThreshold] = useState('');
  const [escalate, setEscalate] = useState('');
  const [notifyTech, setNotifyTech] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('fp_device_rules').insert({
        org_id: orgId,
        device_id: deviceId,
        metric: metric.trim() || null,
        op,
        threshold: parseFloat(threshold),
        action,
        severity,
        cooldown_minutes: parseInt(cooldown, 10) || 60,
        message: message.trim() || null,
        alert_severity: alertSeverity,
        conditions: condMetric.trim() && condThreshold !== ''
          ? [{ metric: condMetric.trim(), op: condOp, threshold: parseFloat(condThreshold) }]
          : [],
        escalate_after_minutes: escalate ? parseInt(escalate, 10) : null,
        notify_roles: notifyTech ? ['org_admin', 'manager', 'technician'] : ['org_admin', 'manager'],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['device_rules', deviceId] });
      onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (threshold === '') return;
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-line bg-surface p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink">{t('metric')}</label>
          <Input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder={t('anyMetric')} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('op')}</label>
          <Select value={op} onChange={(e) => setOp(e.target.value as DeviceRuleOp)}>
            {OPS.map((o) => (
              <option key={o} value={o}>
                {OP_SYMBOL[o]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('threshold')}</label>
          <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink">{t('action')}</label>
          <Select value={action} onChange={(e) => setAction(e.target.value as DeviceRuleAction)}>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`actions.${a}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('iot.alertSeverity')}</label>
          <Select value={alertSeverity} onChange={(e) => setAlertSeverity(e.target.value as AlertSeverity)}>
            {ALERT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`iot.severity.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('severity')}</label>
          <Select value={severity} onChange={(e) => setSeverity(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {tc(`severity.${p}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('cooldown')}</label>
          <Input type="number" value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink">{t('iot.andMetric')}</label>
          <Input value={condMetric} onChange={(e) => setCondMetric(e.target.value)} placeholder="people_count" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('op')}</label>
          <Select value={condOp} onChange={(e) => setCondOp(e.target.value as DeviceRuleOp)}>
            {OPS.slice(0, 6).map((o) => <option key={o} value={o}>{OP_SYMBOL[o]}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">{t('threshold')}</label>
          <Input type="number" value={condThreshold} onChange={(e) => setCondThreshold(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink">{t('iot.escalateAfter')}</label>
          <Input type="number" min={5} value={escalate} onChange={(e) => setEscalate(e.target.value)} placeholder={t('iot.escalateNever')} />
        </div>
        <label className="col-span-2 flex items-end gap-2 pb-2 text-xs text-ink">
          <input type="checkbox" checked={notifyTech} onChange={(e) => setNotifyTech(e.target.checked)} /> {t('iot.notifyTechnicians')}
        </label>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-ink">{t('message')}</label>
        <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('messagePlaceholder')} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {tc('actions.cancel')}
        </Button>
        <Button type="submit" loading={create.isPending} disabled={threshold === ''}>
          {tc('actions.create')}
        </Button>
      </div>
    </form>
  );
}
