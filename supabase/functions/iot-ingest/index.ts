// supabase/functions/iot-ingest/index.ts
//
// A vendor-neutral ingestion endpoint for IoT devices. Two ways in:
//
//  1. Direct RPC (simplest) — a device POSTs to
//        https://<ref>.supabase.co/rest/v1/rpc/fp_device_ingest
//     with the anon apikey + its device key. Good for ESP32/ESP8266, Shelly,
//     Tasmota, Raspberry Pi, anything that can do an HTTP POST.
//
//  2. This function — a forgiving endpoint that accepts several payload shapes
//     and is the recommended sink for MQTT brokers. Point your broker's rule /
//     webhook (EMQX rule engine, HiveMQ data hub, AWS IoT Core rule, Mosquitto
//     bridge) at this URL; it normalises the message and writes each reading.
//
// Deploy:
//   supabase functions deploy iot-ingest --no-verify-jwt
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Auth: the DEVICE key (not a user). Send it as the `x-device-key` header or as
// `key` / `device_key` in the body. The key alone authorises writes for that
// device's org — keep it secret and rotate from the Devices page if leaked.
//
// Accepted bodies:
//   { "metric": "temperature", "value": 22.5, "unit": "C" }          // single
//   { "readings": [ { "metric": "temperature", "value": 22.5 }, … ] } // batch
//   { "temperature": 22.5, "humidity": 60 }                           // flat MQTT
//
// Optional per-reading: "unit", "ts" (ISO), "meta" (object).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const RESERVED = new Set(['key', 'device_key', 'readings', 'metric', 'value', 'unit', 'ts', 'meta']);

interface Reading {
  metric: string;
  value: number | null;
  unit?: string | null;
  ts?: string | null;
  meta?: Record<string, unknown> | null;
}

function normalise(body: Record<string, unknown>): Reading[] {
  if (Array.isArray(body.readings)) {
    return (body.readings as Record<string, unknown>[]).map((r) => ({
      metric: String(r.metric),
      value: r.value == null ? null : Number(r.value),
      unit: (r.unit as string) ?? null,
      ts: (r.ts as string) ?? null,
      meta: (r.meta as Record<string, unknown>) ?? null,
    }));
  }
  if (typeof body.metric === 'string') {
    return [
      {
        metric: body.metric,
        value: body.value == null ? null : Number(body.value),
        unit: (body.unit as string) ?? null,
        ts: (body.ts as string) ?? null,
        meta: (body.meta as Record<string, unknown>) ?? null,
      },
    ];
  }
  // Flat MQTT-style object: every numeric top-level key becomes a metric.
  const out: Reading[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (RESERVED.has(k)) continue;
    const n = Number(v);
    if (!Number.isNaN(n)) out.push({ metric: k, value: n, ts: (body.ts as string) ?? null });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const key =
      req.headers.get('x-device-key') ??
      (body.key as string) ??
      (body.device_key as string) ??
      '';
    if (!key) return new Response('device key required', { status: 401 });

    const readings = normalise(body).filter((r) => r.metric);
    if (readings.length === 0) return new Response('no readings', { status: 400 });

    let ok = 0;
    const errors: string[] = [];
    for (const r of readings) {
      const { error } = await supabase.rpc('fp_device_ingest', {
        p_key: key,
        p_metric: r.metric,
        p_value: r.value,
        p_unit: r.unit ?? null,
        p_ts: r.ts ?? new Date().toISOString(),
        p_meta: r.meta ?? null,
      });
      if (error) errors.push(error.message);
      else ok += 1;
    }

    const status = ok > 0 ? 200 : 401;
    return new Response(JSON.stringify({ ingested: ok, errors }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
    });
  }
});
