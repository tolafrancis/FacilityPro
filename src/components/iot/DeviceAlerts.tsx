import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { ago, SEVERITY_CLASS, useDeviceAlerts, type DeviceAlert } from '../../lib/iot';
import Pill from '../ui/Pill';

/** Alerts for one device, or (no deviceId) the org's unresolved alerts. */
export default function DeviceAlerts({ deviceId, canAct, deviceName }: { deviceId?: string; canAct: boolean; deviceName?: (id: string) => string }) {
  const { t, i18n } = useTranslation('devices');
  const lng = i18n.resolvedLanguage ?? 'en';
  const queryClient = useQueryClient();
  const alerts = useDeviceAlerts(deviceId);

  const act = useMutation({
    mutationFn: async ({ alert, action }: { alert: DeviceAlert; action: 'acknowledge' | 'resolve' }) => {
      const { error } = await supabase.rpc('fp_device_alert_update', { p_alert: alert.id, p_action: action });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['device_alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['device_directory'] });
      void queryClient.invalidateQueries({ queryKey: ['device_directory_row'] });
    },
  });

  const rows = alerts.data ?? [];
  if (rows.length === 0) return <p className="py-2 text-sm text-ink-muted">{t('iot.noAlerts')}</p>;

  return (
    <ul className="divide-y divide-line">
      {rows.map((a) => (
        <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill className={SEVERITY_CLASS[a.severity]}>{t(`iot.severity.${a.severity}`)}</Pill>
              <Pill className="bg-surface text-ink-muted">{t(`iot.alertStatus.${a.status}`)}</Pill>
              {a.escalated_at && <Pill className="bg-red-50 text-status-crit">{t('iot.escalated')}</Pill>}
            </div>
            <p className="mt-1 text-sm font-medium text-ink">
              {!deviceId && deviceName ? (
                <Link to={`/devices/${a.device_id}`} className="hover:underline">{a.title}</Link>
              ) : (
                a.title
              )}
            </p>
            <p className="text-xs text-ink-muted">
              {a.message}
              {a.occurrences > 1 ? ` · ${t('iot.occurrences', { count: a.occurrences })}` : ''}
              {` · ${ago(a.opened_at, lng)}`}
              {a.request_id && (
                <>
                  {' · '}
                  <Link to={`/requests/${a.request_id}`} className="text-brand hover:underline">{t('iot.workRequest')}</Link>
                </>
              )}
            </p>
          </div>
          {canAct && a.status !== 'resolved' && (
            <div className="flex gap-2">
              {a.status === 'open' && (
                <button type="button" onClick={() => act.mutate({ alert: a, action: 'acknowledge' })} className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface">
                  {t('iot.acknowledge')}
                </button>
              )}
              <button type="button" onClick={() => act.mutate({ alert: a, action: 'resolve' })} className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface">
                {t('iot.resolve')}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
