import { useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, RefreshCw, Trash2, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useDevice, useDeviceRules, useTelemetry } from '../lib/queries';
import { formatDate, PRIORITIES } from '../lib/ui';
import type { DeviceRuleAction, DeviceRuleOp, Priority } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';

const OPS: DeviceRuleOp[] = ['gt', 'gte', 'lt', 'lte', 'eq'];
const OP_SYMBOL: Record<DeviceRuleOp, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' };
const ACTIONS: DeviceRuleAction[] = ['notify', 'work_order', 'both'];

const ENV = import.meta.env as Record<string, string | undefined>;
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co';
const ANON = ENV.VITE_SUPABASE_ANON_KEY ?? 'YOUR-ANON-KEY';

export default function DeviceDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('devices');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { role } = useOrg();
  const isAdmin = role === 'org_admin';
  const queryClient = useQueryClient();

  const device = useDevice(id);
  const rules = useDeviceRules(id);
  const telemetry = useTelemetry(id, 50);
  const [showRule, setShowRule] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const d = device.data;

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const rotate = useMutation({
    mutationFn: async () => {
      const key = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
      const { error } = await supabase.from('fp_devices').update({ device_key: key }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device', id] }),
  });

  const toggleActive = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase.from('fp_devices').update({ active }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device', id] }),
  });

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase.from('fp_device_rules').delete().eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device_rules', id] }),
  });

  if (device.isLoading) return <p className="text-sm text-ink-muted">{tc('loading')}</p>;
  if (!d) return <p className="text-sm text-ink-muted">{t('notFound')}</p>;

  const key = d.device_key;
  const rpcExample = `curl -X POST "${SUPABASE_URL}/rest/v1/rpc/fp_device_ingest" \\
  -H "apikey: ${ANON}" \\
  -H "Content-Type: application/json" \\
  -d '{"p_key":"${key}","p_metric":"temperature","p_value":22.5,"p_unit":"C"}'`;
  const fnExample = `curl -X POST "${SUPABASE_URL}/functions/v1/iot-ingest" \\
  -H "x-device-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"temperature":22.5,"humidity":60}'`;

  return (
    <div className="max-w-3xl">
      <Link to="/devices" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> {t('title')}
      </Link>

      <div className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{d.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {d.kind ? t(`kinds.${d.kind}`) : ''}
            {d.last_seen_at ? ` · ${t('lastSeen')} ${formatDate(d.last_seen_at, lng)}` : ` · ${t('neverSeen')}`}
          </p>
        </div>
        {isAdmin && (
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={d.active}
              onChange={(e) => toggleActive.mutate(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
            />
            {t('active')}
          </label>
        )}
      </div>

      {/* Connection */}
      <section className="mt-6 rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold text-ink">{t('connection')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('connectionHint')}</p>

        <div className="mt-3">
          <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('deviceKey')}</label>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-surface px-3 py-2 text-xs text-ink">{key}</code>
            <button type="button" onClick={() => copy(key, 'key')} className="text-ink-muted hover:text-ink" aria-label="copy">
              <Copy size={15} />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => rotate.mutate()}
                className="text-ink-muted hover:text-status-crit"
                aria-label="rotate"
                title={t('rotate')}
              >
                <RefreshCw size={15} />
              </button>
            )}
          </div>
          {copied === 'key' && <p className="mt-1 text-xs text-status-ok">{t('copied')}</p>}
        </div>

        <CodeBlock title={t('exampleRpc')} code={rpcExample} onCopy={() => copy(rpcExample, 'rpc')} copied={copied === 'rpc'} copiedLabel={t('copied')} />
        <CodeBlock title={t('exampleFn')} code={fnExample} onCopy={() => copy(fnExample, 'fn')} copied={copied === 'fn'} copiedLabel={t('copied')} />
        <p className="mt-2 text-xs text-ink-muted">{t('mqttHint')}</p>
      </section>

      {/* Rules */}
      <section className="mt-6 rounded-xl border border-line bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">{t('rules')}</h2>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowRule((s) => !s)}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand"
            >
              <Plus size={15} /> {t('addRule')}
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-muted">{t('rulesHint')}</p>

        {showRule && id && (
          <RuleForm
            deviceId={id}
            orgId={d.org_id}
            onDone={() => setShowRule(false)}
          />
        )}

        <ul className="mt-3 divide-y divide-line">
          {(rules.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">
                <span className="font-medium">{r.metric || t('anyMetric')}</span>{' '}
                {OP_SYMBOL[r.op]} {r.threshold} →{' '}
                <Pill className="bg-surface text-ink-muted">{t(`actions.${r.action}`)}</Pill>{' '}
                <span className="text-ink-muted">({tc(`severity.${r.severity}`)})</span>
              </span>
              {isAdmin && (
                <button type="button" onClick={() => deleteRule.mutate(r.id)} className="text-ink-muted hover:text-status-crit">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
          {(rules.data ?? []).length === 0 && <li className="py-2 text-sm text-ink-muted">{t('noRules')}</li>}
        </ul>
      </section>

      {/* Telemetry */}
      <section className="mt-6 rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold text-ink">{t('telemetry')}</h2>
        {(telemetry.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">{t('noTelemetry')}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="pb-2">{t('metric')}</th>
                  <th className="pb-2">{t('value')}</th>
                  <th className="pb-2">{t('time')}</th>
                </tr>
              </thead>
              <tbody>
                {(telemetry.data ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="py-1.5 text-ink">{row.metric}</td>
                    <td className="py-1.5 text-ink">
                      {row.value ?? '—'}
                      {row.unit ? ` ${row.unit}` : ''}
                    </td>
                    <td className="py-1.5 text-ink-muted">{formatDate(row.ts, lng)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
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
