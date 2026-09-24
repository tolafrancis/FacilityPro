// Protocol adapters for the HTTP side of the IoT integration layer
// (docs/IOT_ARCHITECTURE.md). Each adapter turns one vendor/protocol payload
// into FacilityPro readings; normalisation to canonical metrics and units
// happens in the database (fp_device_ingest_internal, migration 0077), so
// adapters stay thin and manufacturer logic never reaches the apps.
//
// Adapters:
//   generic     {metric, value} | {readings:[…]} | {temperature: 22.5, …}
//   topic       broker rule/webhook envelope {topic, payload} on the
//               FacilityPro topic scheme facilitypro/{org}/{site}/{device}/{channel}
//   ttn         The Things Stack v3 uplink webhook
//   chirpstack  ChirpStack v4 HTTP integration "up" event

export interface Reading {
  device?: string;          // external id (DevEUI, serial…) when a gateway reports for many devices
  metric: string;
  value: number | null;
  unit?: string | null;
  ts?: string | null;
  meta?: Record<string, unknown> | null;
}

export type AdapterName = 'generic' | 'topic' | 'ttn' | 'chirpstack';

const RESERVED = new Set(['key', 'device_key', 'device', 'readings', 'metric', 'value', 'unit', 'ts', 'meta', 'topic', 'payload']);

// Booleans become 1/0 (door open, leak, on/off); non-numeric values are skipped.
export function toNumber(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  if (typeof v === 'string' && /^(on|true|open|yes)$/i.test(v)) return 1;
  if (typeof v === 'string' && /^(off|false|closed|no)$/i.test(v)) return 0;
  return undefined;
}

// Every numeric/boolean top-level key becomes a metric; one level of
// nesting is flattened with "_" ({"pm":{"2_5":12}} → pm_2_5).
export function flatten(obj: Record<string, unknown>, ts?: string | null, prefix = ''): Reading[] {
  const out: Reading[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!prefix && RESERVED.has(k)) continue;
    const metric = (prefix ? `${prefix}_${k}` : k).slice(0, 64);
    if (v && typeof v === 'object' && !Array.isArray(v) && !prefix) {
      out.push(...flatten(v as Record<string, unknown>, ts, k));
      continue;
    }
    const n = toNumber(v);
    if (n !== undefined) out.push({ metric, value: n, ts: ts ?? null });
  }
  return out;
}

function readingFrom(r: Record<string, unknown>, fallbackTs?: string | null): Reading | null {
  if (r?.metric == null) return null;
  const n = toNumber(r.value);
  return {
    device: r.device != null ? String(r.device) : undefined,
    metric: String(r.metric).slice(0, 64),
    value: n === undefined ? null : n,
    unit: (r.unit as string) ?? null,
    ts: (r.ts as string) ?? fallbackTs ?? null,
    meta: (r.meta && typeof r.meta === 'object' ? (r.meta as Record<string, unknown>) : null),
  };
}

export function parseGeneric(body: unknown, device?: string): Reading[] {
  if (typeof body === 'number' || typeof body === 'boolean') {
    return [{ metric: 'value', value: toNumber(body) ?? null, device }];
  }
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;
  let out: Reading[];
  if (Array.isArray(b.readings)) {
    out = (b.readings as Record<string, unknown>[]).map((r) => readingFrom(r, b.ts as string)).filter((r): r is Reading => !!r);
  } else if (typeof b.metric === 'string') {
    out = [readingFrom(b)].filter((r): r is Reading => !!r);
  } else {
    out = flatten(b, (b.ts as string) ?? null);
  }
  const dev = device ?? (b.device != null ? String(b.device) : undefined);
  return out.map((r) => ({ ...r, device: r.device ?? dev }));
}

// facilitypro/{org}/{site}/{device}/{telemetry|state|event|command/ack}
export function parseTopic(topic: string): { org?: string; site?: string; device?: string; channel?: string } | null {
  const parts = topic.split('/').filter(Boolean);
  if (parts[0] !== 'facilitypro' || parts.length < 5) return null;
  return { org: parts[1], site: parts[2], device: parts[3], channel: parts.slice(4).join('/') };
}

export function parseTopicEnvelope(body: Record<string, unknown>): Reading[] {
  const topic = String(body.topic ?? '');
  let payload: unknown = body.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = toNumber(payload) ?? null;
    }
  }
  const t = parseTopic(topic);
  const device = t?.device;
  if (t?.channel === 'event' && payload && typeof payload === 'object') {
    // {"event":"leak","value":true,"severity":"critical"}
    const p = payload as Record<string, unknown>;
    const name = String(p.event ?? p.type ?? 'event').slice(0, 64);
    return [{ device, metric: name, value: toNumber(p.value ?? true) ?? 1, ts: (p.ts as string) ?? null, meta: { event: p } }];
  }
  if (typeof payload === 'number' || payload === null) {
    const metric = (topic.split('/').filter(Boolean).pop() || 'value').slice(0, 64);
    return payload === null ? [] : [{ device, metric, value: payload }];
  }
  return parseGeneric(payload, device);
}

// The Things Stack v3: uplink_message.decoded_payload (from the device's codec).
export function parseTTN(body: Record<string, unknown>): Reading[] {
  const ids = (body.end_device_ids ?? {}) as Record<string, unknown>;
  const up = (body.uplink_message ?? {}) as Record<string, unknown>;
  const decoded = up.decoded_payload as Record<string, unknown> | undefined;
  const device = String(ids.dev_eui ?? ids.device_id ?? '');
  if (!device || !decoded) return [];
  const ts = (up.received_at as string) ?? (body.received_at as string) ?? null;
  const rx = ((up.rx_metadata as Record<string, unknown>[]) ?? [])[0] ?? {};
  const out = flatten(decoded, ts).map((r) => ({ ...r, device }));
  if (typeof rx.rssi === 'number') out.push({ device, metric: 'rssi', value: rx.rssi, unit: 'dBm', ts });
  if (typeof rx.snr === 'number') out.push({ device, metric: 'snr', value: rx.snr, unit: 'dB', ts });
  const gw = (rx.gateway_ids as Record<string, unknown>)?.gateway_id;
  return out.map((r) => ({ ...r, meta: { lorawan: { f_cnt: up.f_cnt ?? null, gateway: gw ?? null } } }));
}

// ChirpStack v4 HTTP integration, event=up: object = decoded payload.
export function parseChirpStack(body: Record<string, unknown>): Reading[] {
  const info = (body.deviceInfo ?? {}) as Record<string, unknown>;
  const decoded = body.object as Record<string, unknown> | undefined;
  const device = String(info.devEui ?? '');
  if (!device || !decoded) return [];
  const ts = (body.time as string) ?? null;
  const rx = ((body.rxInfo as Record<string, unknown>[]) ?? [])[0] ?? {};
  const out = flatten(decoded, ts).map((r) => ({ ...r, device }));
  if (typeof rx.rssi === 'number') out.push({ device, metric: 'rssi', value: rx.rssi, unit: 'dBm', ts });
  if (typeof rx.snr === 'number') out.push({ device, metric: 'snr', value: rx.snr, unit: 'dB', ts });
  return out.map((r) => ({ ...r, meta: { lorawan: { f_cnt: body.fCnt ?? null, gateway: rx.gatewayId ?? null } } }));
}

export function detectAdapter(body: unknown, hint?: string | null): AdapterName {
  if (hint === 'generic' || hint === 'topic' || hint === 'ttn' || hint === 'chirpstack') return hint;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (b.end_device_ids && b.uplink_message) return 'ttn';
    if (b.deviceInfo && 'object' in b) return 'chirpstack';
    if (typeof b.topic === 'string' && 'payload' in b) return 'topic';
  }
  return 'generic';
}

export function parse(body: unknown, adapter: AdapterName): Reading[] {
  const b = (body ?? {}) as Record<string, unknown>;
  switch (adapter) {
    case 'ttn':
      return parseTTN(b);
    case 'chirpstack':
      return parseChirpStack(b);
    case 'topic':
      return parseTopicEnvelope(b);
    default:
      return parseGeneric(body);
  }
}
