// supabase/functions/iot-ingest/index.ts
//
// Vendor-neutral HTTP ingestion for the IoT integration layer
// (docs/IOT_ARCHITECTURE.md). Payloads are parsed by protocol adapters
// (_shared/iot-adapters.ts) and normalised in the database (migration 0077:
// data-point mapping, canonical metrics and units).
//
// Deploy:
//   supabase functions deploy iot-ingest --no-verify-jwt
//
// Two kinds of key:
//   * a DEVICE key (x-device-key header, or key/device_key in the body):
//     readings are for that one device.
//   * a GATEWAY key (x-gateway-key header): readings name their device by
//     external id (DevEUI, serial, Modbus id…). Use one for an on-site edge
//     gateway, an MQTT broker rule, or a LoRaWAN network server.
//
// Accepted bodies (auto-detected, or force with ?format=generic|topic|ttn|chirpstack):
//   { "metric": "temperature", "value": 22.5, "unit": "°C" }          single
//   { "readings": [ { "device": "…", "metric": "…", "value": … } ] } batch
//   { "temperature": 22.5, "humidity": 60 }                          flat
//   { "topic": "facilitypro/{org}/{site}/{device}/telemetry", "payload": … }
//                                                  MQTT broker rule / webhook
//   The Things Stack v3 uplink webhook, ChirpStack v4 HTTP integration
//
// Optional per-reading: "unit", "ts" (ISO), "meta" (object).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { detectAdapter, parse, type Reading } from '../_shared/iot-adapters.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Limits for one request. The database also caps each device at 600
// readings a minute and validates every reading (migrations 0063, 0077).
const MAX_BODY_BYTES = 256 * 1024;
const MAX_READINGS = 500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function viaDevice(key: string, readings: Reading[]) {
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
    if (error) {
      errors.push(error.message);
      // A bad key or a device over its rate limit won't get better within
      // this request; stop instead of hammering the database.
      if (/Invalid or inactive device key|rate_limited/.test(error.message)) break;
    } else ok += 1;
  }
  return { ok, errors };
}

async function viaGateway(key: string, readings: Reading[]) {
  const missing = readings.filter((r) => !r.device).length;
  const { data, error } = await supabase.rpc('fp_gateway_ingest', {
    p_key: key,
    p_readings: readings
      .filter((r) => r.device)
      .map((r) => ({ device: r.device, metric: r.metric, value: r.value, unit: r.unit ?? null, ts: r.ts ?? null, meta: r.meta ?? null })),
  });
  if (error) return { ok: 0, errors: [error.message] };
  const res = data as { ingested: number; errors: { device: string; error: string }[] };
  const errors = res.errors.map((e) => `${e.device}: ${e.error}`);
  if (missing) errors.push(`${missing} reading(s) without a device id`);
  return { ok: res.ingested, errors };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  try {
    const url = new URL(req.url);
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: `body larger than ${MAX_BODY_BYTES} bytes` }, 413);
    const body = JSON.parse(raw) as unknown;
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

    // ChirpStack posts every event type to one URL (?event=up|status|join|…).
    const csEvent = url.searchParams.get('event');
    let readings: Reading[];
    if (csEvent && csEvent !== 'up') {
      if (csEvent !== 'status' || !b.deviceInfo) return json({ ignored: csEvent });
      const dev = String((b.deviceInfo as Record<string, unknown>).devEui ?? '');
      readings = typeof b.batteryLevel === 'number'
        ? [{ device: dev, metric: 'battery', value: b.batteryLevel as number, unit: '%', ts: (b.time as string) ?? null }]
        : [];
    } else {
      readings = parse(body, detectAdapter(body, url.searchParams.get('format'))).filter((r) => r.metric);
    }
    if (readings.length === 0) return json({ error: 'no readings' }, 400);
    if (readings.length > MAX_READINGS) return json({ error: `at most ${MAX_READINGS} readings per request` }, 413);

    const gatewayKey = req.headers.get('x-gateway-key') ?? '';
    const deviceKey = req.headers.get('x-device-key') ?? (b.key as string) ?? (b.device_key as string) ?? '';
    if (!gatewayKey && !deviceKey) return json({ error: 'device or gateway key required' }, 401);

    const { ok, errors } = gatewayKey ? await viaGateway(gatewayKey, readings) : await viaDevice(deviceKey, readings);
    const status = ok > 0
      ? 200
      : errors.some((e) => e.includes('rate_limited')) ? 429
      : errors.some((e) => /Invalid or inactive/.test(e)) ? 401
      : 400;
    return json({ ingested: ok, errors }, status);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof SyntaxError ? 400 : 500);
  }
});
