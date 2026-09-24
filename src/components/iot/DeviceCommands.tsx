import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrg } from '../../contexts/OrgContext';
import { ago, useDataPoints, useDeviceCommands, useIotCatalog, type DirectoryDevice } from '../../lib/iot';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Pill from '../ui/Pill';

interface Action {
  command: string;
  label: string;
  dataPoint: string | null;
  fixedValue?: number;
  min: number | null;
  max: number | null;
  dangerous: boolean;
}

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-surface text-ink-muted',
  sent: 'bg-blue-50 text-status-info',
  succeeded: 'bg-green-50 text-status-ok',
  failed: 'bg-red-50 text-status-crit',
  expired: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-surface text-ink-muted',
};

/**
 * Commands a user may send: the model's named commands and writes to the
 * device's writable data points. The server re-checks everything (role,
 * range, device online, expiry); the UI only avoids offering what would fail.
 */
export default function DeviceCommands({ device }: { device: DirectoryDevice }) {
  const { t, i18n } = useTranslation('devices');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { role } = useOrg();
  const queryClient = useQueryClient();
  const points = useDataPoints(device.id);
  const catalog = useIotCatalog();
  const commands = useDeviceCommands(device.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Action | null>(null);

  const model = catalog.data?.models.find((m) => m.id === device.model_id);
  const writable = (points.data ?? []).filter((p) => p.writable && p.active);
  const actions: Action[] = [
    ...(model?.commands ?? [])
      .map((c) => {
        const dp = writable.find((p) => p.key === c.data_point);
        if (!dp) return null;
        return {
          command: c.code, label: c.label ?? c.code, dataPoint: dp.key, fixedValue: c.value,
          min: dp.min_value, max: dp.max_value, dangerous: !!c.dangerous || dp.dangerous,
        } as Action;
      })
      .filter((a): a is Action => !!a),
    ...writable
      // Points the model already covers with named commands (Turn on / Set temperature) don't get a raw row.
      .filter((p) => !(model?.commands ?? []).some((c) => c.data_point === p.key))
      .map((p) => ({ command: 'write', label: t('iot.setPoint', { name: p.name ?? p.key }), dataPoint: p.key, min: p.min_value, max: p.max_value, dangerous: p.dangerous })),
  ];

  const canWrite = (a: Action) => role === 'org_admin' || (role === 'manager' && !a.dangerous);
  const online = device.status === 'online';

  const send = useMutation({
    mutationFn: async (a: Action) => {
      const params: Record<string, unknown> = {};
      if (a.command === 'write') params.data_point = a.dataPoint;
      if (a.fixedValue === undefined && a.command !== 'request_status') params.value = Number(values[a.command + ':' + a.dataPoint]);
      const { error } = await supabase.rpc('fp_device_command', { p_device: device.id, p_command: a.command, p_params: params });
      if (error) throw new Error(t(`iot.commandErrors.${error.message}`, { defaultValue: error.message }));
    },
    onSuccess: () => {
      setConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ['device_commands', device.id] });
    },
  });

  const requestStatus = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('fp_device_command', { p_device: device.id, p_command: 'request_status', p_params: {} });
      if (error) throw new Error(t(`iot.commandErrors.${error.message}`, { defaultValue: error.message }));
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['device_commands', device.id] }),
  });

  const run = (a: Action) => (a.dangerous ? setConfirm(a) : send.mutate(a));

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">{t('iot.commands')}</h2>
        <Button variant="secondary" className="px-3 py-1 text-xs" loading={requestStatus.isPending} onClick={() => requestStatus.mutate()}>
          {t('iot.requestStatus')}
        </Button>
      </div>
      {!online && actions.length > 0 && <p className="mt-2 text-sm text-status-warn">{t('iot.offlineNoCommands')}</p>}

      {actions.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {actions.map((a) => {
            const key = a.command + ':' + a.dataPoint;
            const needsValue = a.fixedValue === undefined;
            const v = values[key] ?? '';
            const outOfRange = needsValue && v !== '' && ((a.min !== null && Number(v) < a.min) || (a.max !== null && Number(v) > a.max));
            const allowed = canWrite(a);
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {a.label} {a.dangerous && <AlertTriangle size={13} className="inline text-status-warn" aria-label={t('iot.dangerous')} />}
                  </p>
                  {needsValue && (a.min !== null || a.max !== null) && (
                    <p className="text-xs text-ink-muted">{t('iot.range', { min: a.min ?? '…', max: a.max ?? '…' })}</p>
                  )}
                  {!allowed && <p className="text-xs text-ink-muted">{a.dangerous ? t('iot.needsAdmin') : t('iot.needsManager')}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {needsValue && (
                    <Input
                      type="number"
                      className="w-24"
                      value={v}
                      min={a.min ?? undefined}
                      max={a.max ?? undefined}
                      onChange={(e) => setValues((s) => ({ ...s, [key]: e.target.value }))}
                      disabled={!allowed || !online}
                      aria-label={a.label}
                    />
                  )}
                  <Button
                    className="px-3 py-1.5 text-xs"
                    variant={a.dangerous ? 'danger' : 'primary'}
                    disabled={!allowed || !online || (needsValue && (v === '' || outOfRange))}
                    loading={send.isPending && send.variables === a}
                    onClick={() => run(a)}
                  >
                    {t('iot.send')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(commands.data ?? []).length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('iot.recentCommands')}</h3>
          <ul className="mt-1 text-sm">
            {(commands.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
                <span className="text-ink">
                  {c.command}
                  {c.params?.value !== undefined ? ` = ${String(c.params.value)}` : ''}
                  <span className="text-ink-muted"> · {ago(c.requested_at, lng)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {c.error && <span className="max-w-[16rem] truncate text-xs text-status-crit" title={c.error}>{c.error}</span>}
                  <Pill className={STATUS_CLASS[c.status]}>{t(`iot.commandStatus.${c.status}`)}</Pill>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl border border-line bg-white p-5 shadow-lg">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <AlertTriangle size={18} className="text-status-crit" /> {t('iot.confirmTitle')}
            </p>
            <p className="mt-2 text-sm text-ink-muted">{t('iot.confirmBody', { action: confirm.label, device: device.name })}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>{t('iot.cancel')}</Button>
              <Button variant="danger" loading={send.isPending} onClick={() => send.mutate(confirm)}>{t('iot.confirm')}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
