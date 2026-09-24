// JSON payload → readings, same rules as the cloud adapters
// (supabase/functions/_shared/iot-adapters.ts): single {metric, value},
// batch {readings:[…]}, or flat {temperature: 22.5, …}; booleans become 1/0.

const RESERVED = new Set(['key', 'device_key', 'device', 'readings', 'metric', 'value', 'unit', 'ts', 'meta', 'topic', 'payload', 'id']);

export function toNumber(v) {
  if (v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  if (typeof v === 'string' && /^(on|true|open|yes)$/i.test(v)) return 1;
  if (typeof v === 'string' && /^(off|false|closed|no)$/i.test(v)) return 0;
  return undefined;
}

export function flatten(body, prefix = '') {
  if (!prefix && Array.isArray(body.readings)) {
    return body.readings
      .filter((r) => r && r.metric != null)
      .map((r) => ({ metric: String(r.metric), value: toNumber(r.value) ?? null, unit: r.unit ?? null, ts: r.ts ?? body.ts ?? null }));
  }
  if (!prefix && typeof body.metric === 'string') {
    return [{ metric: body.metric, value: toNumber(body.value) ?? null, unit: body.unit ?? null, ts: body.ts ?? null }];
  }
  const out = [];
  for (const [k, v] of Object.entries(body)) {
    if (!prefix && RESERVED.has(k)) continue;
    const metric = (prefix ? `${prefix}_${k}` : k).slice(0, 64);
    if (v && typeof v === 'object' && !Array.isArray(v) && !prefix) {
      out.push(...flatten(v, k));
      continue;
    }
    const n = toNumber(v);
    if (n !== undefined) out.push({ metric, value: n, ts: body.ts ?? null });
  }
  return out;
}
