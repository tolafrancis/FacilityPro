// IoT platform data (migration 0077): normalised, manufacturer-neutral.
// The apps only ever see canonical metrics, units and statuses; protocol and
// vendor details stay in the integration layer.
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useOrg } from '../contexts/OrgContext';
import type { I18nText } from './database.types';

export type DeviceStatus = 'online' | 'offline' | 'never' | 'inactive';
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';
export type DeviceCategory = 'energy' | 'hvac' | 'water' | 'environment' | 'occupancy' | 'safety' | 'asset_monitoring' | 'gateway' | 'other';
export const ALERT_SEVERITIES: AlertSeverity[] = ['info', 'warning', 'critical', 'emergency'];
export const CATEGORIES: DeviceCategory[] = ['energy', 'hvac', 'environment', 'water', 'occupancy', 'safety', 'asset_monitoring', 'gateway', 'other'];
export const PROTOCOLS = [
  'mqtt', 'http', 'webhook', 'modbus_tcp', 'modbus_rtu', 'lorawan', 'bacnet_ip', 'bacnet_mstp', 'opcua', 'websocket', 'knx', 'zigbee', 'vendor_api',
] as const;
export type IotProtocol = (typeof PROTOCOLS)[number];
/** Protocols handled end to end today; the rest can be registered and fed through a gateway or webhook. */
export const SUPPORTED_PROTOCOLS: IotProtocol[] = ['mqtt', 'http', 'webhook', 'modbus_tcp', 'modbus_rtu', 'lorawan'];

export interface DirectoryDevice {
  id: string;
  org_id: string;
  site_id: string | null;
  location_id: string | null;
  asset_id: string | null;
  gateway_id: string | null;
  device_type_id: string | null;
  model_id: string | null;
  name: string;
  kind: string | null;
  protocol: IotProtocol | null;
  external_id: string | null;
  active: boolean;
  last_seen_at: string | null;
  offline_after_minutes: number | null;
  firmware_version: string | null;
  created_at: string;
  battery_pct: number | null;
  signal_rssi: number | null;
  device_type: string | null;
  category: DeviceCategory | null;
  model: string | null;
  manufacturer: string | null;
  status: DeviceStatus;
  alert_severity: AlertSeverity | null;
  open_alerts: number;
  battery_low: boolean;
}

export interface LatestValue {
  device_id: string;
  metric: string;
  value: number | null;
  unit: string | null;
  ts: string;
  quality: 'good' | 'uncertain' | 'bad';
}

export interface DataPoint {
  id: string;
  org_id: string;
  device_id: string;
  key: string;
  metric: string;
  name: string | null;
  unit: string | null;
  scale: number;
  offset: number;
  source: Record<string, unknown>;
  writable: boolean;
  dangerous: boolean;
  min_value: number | null;
  max_value: number | null;
  discovered: boolean;
  active: boolean;
}

export interface DeviceAlert {
  id: string;
  org_id: string;
  device_id: string;
  rule_id: string | null;
  severity: AlertSeverity;
  status: 'open' | 'acknowledged' | 'resolved';
  title: string;
  message: string | null;
  metric: string | null;
  value: number | null;
  occurrences: number;
  opened_at: string;
  last_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
  escalated_at: string | null;
  request_id: string | null;
}

export type CommandStatus = 'pending' | 'sent' | 'succeeded' | 'failed' | 'expired' | 'cancelled';
export interface DeviceCommand {
  id: string;
  device_id: string;
  command: string;
  params: Record<string, unknown>;
  status: CommandStatus;
  dangerous: boolean;
  requested_by: string | null;
  requested_at: string;
  expires_at: string;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface ModelCommand {
  code: string;
  label?: string;
  data_point: string;
  value?: number;
  dangerous?: boolean;
}

export interface DeviceType { id: string; org_id: string | null; code: string; category: DeviceCategory; name_i18n: I18nText; metrics: string[] }
export interface Manufacturer { id: string; org_id: string | null; name: string }
export interface DeviceModel {
  id: string;
  org_id: string | null;
  manufacturer_id: string;
  device_type_id: string | null;
  model: string;
  protocols: IotProtocol[];
  data_points: { key: string; metric?: string; unit?: string; writable?: boolean }[];
  commands: ModelCommand[];
  notes: string | null;
}
export interface Quantity { code: string; canonical_unit: string | null; category: string; name_i18n: I18nText }

export interface Gateway {
  id: string;
  org_id: string;
  site_id: string | null;
  location_id: string | null;
  name: string;
  gateway_key: string;
  protocols: string[];
  serial: string | null;
  firmware_version: string | null;
  last_seen_at: string | null;
  active: boolean;
}

export interface HistoryPoint { bucket: string; avg_value: number | null; min_value: number | null; max_value: number | null; n: number }

function useOrgId() {
  return useOrg().currentOrg?.id;
}

export function useDeviceDirectory() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['device_directory', orgId],
    enabled: !!orgId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_device_directory').select('*').eq('org_id', orgId!).order('name');
      if (error) throw error;
      return data as DirectoryDevice[];
    },
  });
}

export function useDirectoryDevice(id: string | undefined) {
  return useQuery({
    queryKey: ['device_directory_row', id],
    enabled: !!id,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_device_directory').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as DirectoryDevice | null;
    },
  });
}

/** Latest value per metric, updated live over Supabase Realtime (RLS applies). */
export function useDeviceLatest(deviceId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!deviceId) return;
    const channel = supabase
      .channel(`device_latest:${deviceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fp_device_latest', filter: `device_id=eq.${deviceId}` },
        (payload) => {
          const row = payload.new as LatestValue | undefined;
          if (!row?.metric) return;
          queryClient.setQueryData<LatestValue[]>(['device_latest', deviceId], (old) => {
            const rest = (old ?? []).filter((r) => r.metric !== row.metric);
            return [...rest, row].sort((a, b) => a.metric.localeCompare(b.metric));
          });
          void queryClient.invalidateQueries({ queryKey: ['device_directory_row', deviceId] });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [deviceId, queryClient]);

  return useQuery({
    queryKey: ['device_latest', deviceId],
    enabled: !!deviceId,
    refetchInterval: 60000, // fallback when Realtime is unavailable
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_device_latest').select('*').eq('device_id', deviceId!).order('metric');
      if (error) throw error;
      return data as LatestValue[];
    },
  });
}

export function useDeviceHistory(deviceId: string | undefined, metric: string | null, from: string, to: string | null) {
  return useQuery({
    queryKey: ['device_history', deviceId, metric, from, to],
    enabled: !!deviceId && !!metric,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_device_history', {
        p_device: deviceId,
        p_metric: metric,
        p_from: from,
        p_to: to ?? new Date().toISOString(),
        p_points: 240,
      });
      if (error) throw error;
      return (data ?? []) as HistoryPoint[];
    },
  });
}

/** One device's alerts, or (no id) the org's unresolved alerts. */
export function useDeviceAlerts(deviceId?: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['device_alerts', deviceId ?? `org:${orgId}`],
    enabled: !!(deviceId || orgId),
    refetchInterval: 30000,
    queryFn: async () => {
      let q = supabase.from('fp_device_alerts').select('*').order('opened_at', { ascending: false }).limit(200);
      q = deviceId ? q.eq('device_id', deviceId) : q.eq('org_id', orgId!).neq('status', 'resolved');
      const { data, error } = await q;
      if (error) throw error;
      return data as DeviceAlert[];
    },
  });
}

export function useDeviceCommands(deviceId: string | undefined) {
  return useQuery({
    queryKey: ['device_commands', deviceId],
    enabled: !!deviceId,
    // Poll quickly while a command is in flight.
    refetchInterval: (query) =>
      (query.state.data as DeviceCommand[] | undefined)?.some((c) => c.status === 'pending' || c.status === 'sent') ? 3000 : 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_device_commands')
        .select('id, device_id, command, params, status, dangerous, requested_by, requested_at, expires_at, completed_at, result, error')
        .eq('device_id', deviceId!)
        .order('requested_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as DeviceCommand[];
    },
  });
}

export function useDataPoints(deviceId: string | undefined) {
  return useQuery({
    queryKey: ['data_points', deviceId],
    enabled: !!deviceId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_device_data_points').select('*').eq('device_id', deviceId!).order('key');
      if (error) throw error;
      return data as DataPoint[];
    },
  });
}

export function useIotCatalog() {
  return useQuery({
    queryKey: ['iot_catalog'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [types, manufacturers, models, quantities] = await Promise.all([
        supabase.from('fp_iot_device_types').select('id, org_id, code, category, name_i18n, metrics'),
        supabase.from('fp_iot_manufacturers').select('id, org_id, name').order('name'),
        supabase.from('fp_iot_device_models').select('id, org_id, manufacturer_id, device_type_id, model, protocols, data_points, commands, notes').order('model'),
        supabase.from('fp_iot_quantities').select('code, canonical_unit, category, name_i18n').order('code'),
      ]);
      const err = types.error ?? manufacturers.error ?? models.error ?? quantities.error;
      if (err) throw err;
      return {
        types: types.data as DeviceType[],
        manufacturers: manufacturers.data as Manufacturer[],
        models: models.data as DeviceModel[],
        quantities: quantities.data as Quantity[],
      };
    },
  });
}

export function useGateways(enabled = true) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['gateways', orgId],
    enabled: !!orgId && enabled,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_iot_gateways').select('*').eq('org_id', orgId!).order('name');
      if (error) throw error;
      return data as Gateway[];
    },
  });
}

// ---- presentation helpers ---------------------------------------------------

export const SEVERITY_CLASS: Record<AlertSeverity, string> = {
  info: 'bg-blue-50 text-status-info',
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-status-crit',
  emergency: 'bg-status-crit text-white',
};

export const STATUS_DOT: Record<DeviceStatus, string> = {
  online: 'fill-status-ok text-status-ok',
  offline: 'fill-status-crit text-status-crit',
  never: 'fill-line text-line',
  inactive: 'fill-line text-line',
};

export function formatValue(v: number | null, unit?: string | null) {
  if (v === null || v === undefined) return '—';
  const n = Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : Number(v.toFixed(2)).toString();
  return unit ? `${n} ${unit}` : n;
}

/** "8 seconds ago" style, for last-seen and stale-data warnings. */
export function ago(iso: string | null, lng: string) {
  if (!iso) return null;
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: 'auto' });
  if (Math.abs(s) < 60) return rtf.format(-s, 'second');
  if (Math.abs(s) < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
