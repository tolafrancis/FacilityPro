// FacilityPro MQTT bridge worker (cloud side).
//
// The web app is serverless and cannot hold a persistent MQTT socket, so this
// long-running process does it instead. It periodically reads enabled rows from
// `fp_device_connections`, keeps one live MQTT subscription per row, and forwards
// every received message to the `fp_device_ingest` RPC using the owning device's
// key — exactly the same sink the push/HTTP path uses.
//
// Run it anywhere that can stay online (a small VM, a container, Railway/Fly/
// Render, a Raspberry Pi on-site). It is NOT a Supabase edge function.
//
//   cd mqtt-bridge
//   npm install
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm start
//
// Env:
//   SUPABASE_URL                (required)
//   SUPABASE_SERVICE_ROLE_KEY   (required — service role; bypasses RLS, keep secret)
//   SYNC_INTERVAL_MS            (optional, default 15000) how often config is re-read
//   HEARTBEAT_MS                (optional, default 60000) min gap between last_connected_at writes
//   COMMAND_POLL_MS             (optional, default 5000) how often to look for device commands
//
// Commands (0077): commands for a device reached through this bridge are
// claimed with the device's key, published as {id, type, data_point, value}
// to its command topic (command_topic, or the subscription topic with
// /telemetry → /command) and acknowledged by the device on <command topic>/ack
// with {id, ok, result|error}. Expired commands are never delivered.

import mqtt from 'mqtt';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS ?? 15000);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 60000);
const COMMAND_POLL_MS = Number(process.env.COMMAND_POLL_MS ?? 5000);
const COMMAND_ACK_MS = Number(process.env.COMMAND_ACK_MS ?? 10000);

const missingEnv = [
  ['SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missingEnv.length) {
  console.error(`Missing required env: ${missingEnv.join(', ')}. Set them in mqtt-bridge/.env`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// connection.id -> { client, sig, heartbeatAt }
const live = new Map();

const RESERVED = new Set(['key', 'device_key', 'readings', 'metric', 'value', 'unit', 'ts', 'meta']);

// Turn a broker payload into one or more { metric, value, unit, ts, meta } readings.
// Mirrors the iot-ingest edge function, plus a convenience for bare numeric payloads
// (metric = last topic segment).
function normalise(raw, topic) {
  const text = raw.toString('utf8').trim();
  if (!text) return [];

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  // Bare number, e.g. "22.5" published straight to a topic.
  if (typeof body === 'number' || (typeof body === 'string' && body !== '' && !Number.isNaN(Number(body)))) {
    const metric = (topic.split('/').filter(Boolean).pop() || 'value').toLowerCase();
    return [{ metric, value: Number(body) }];
  }
  if (typeof body !== 'object' || body === null) return [];

  if (Array.isArray(body.readings)) {
    return body.readings
      .filter((r) => r && r.metric != null)
      .map((r) => ({
        metric: String(r.metric),
        value: r.value == null ? null : Number(r.value),
        unit: r.unit ?? null,
        ts: r.ts ?? null,
        meta: r.meta ?? null,
      }));
  }
  if (typeof body.metric === 'string') {
    return [
      {
        metric: body.metric,
        value: body.value == null ? null : Number(body.value),
        unit: body.unit ?? null,
        ts: body.ts ?? null,
        meta: body.meta ?? null,
      },
    ];
  }
  // Flat object: every numeric top-level key becomes a metric.
  const out = [];
  for (const [k, v] of Object.entries(body)) {
    if (RESERVED.has(k)) continue;
    const n = Number(v);
    if (!Number.isNaN(n)) out.push({ metric: k, value: n, ts: body.ts ?? null });
  }
  return out;
}

async function setStatus(id, fields) {
  const { error } = await supabase.from('fp_device_connections').update(fields).eq('id', id);
  if (error) console.error(`[${id}] status update failed:`, error.message);
}

function signature(c) {
  return JSON.stringify([c.protocol, c.host, c.port, c.topic, c.command_topic, c.username, c.password, c.client_id, c.qos, c.device_key]);
}

// Where commands go: explicit command_topic, else …/telemetry → …/command.
function commandTopic(c) {
  if (c.command_topic) return c.command_topic;
  if (/[+#]/.test(c.topic)) return null;
  return c.topic.replace(/\/telemetry$/, '') + '/command';
}

async function reportCommand(c, id, ok, result, error) {
  const { error: e } = await supabase.rpc('fp_iot_command_result', {
    p_key: c.device_key, p_command: id, p_ok: ok, p_result: result ?? null, p_error: error ?? null,
  });
  if (e) console.error(`[${c.id}] command ${id} result not recorded:`, e.message);
}

async function deliverCommands(c, entry) {
  if (!entry.client.connected) return;
  const { data, error } = await supabase.rpc('fp_iot_claim_commands', { p_key: c.device_key, p_limit: 20 });
  if (error) {
    console.error(`[${c.id}] command claim failed:`, error.message);
    return;
  }
  const topic = commandTopic(c);
  for (const cmd of data ?? []) {
    if (!topic) {
      await reportCommand(c, cmd.id, false, null, 'no command topic configured for this connection');
      continue;
    }
    if (new Date(cmd.expires_at).getTime() < Date.now()) {
      await reportCommand(c, cmd.id, false, null, 'expired before delivery');
      continue;
    }
    const p = cmd.payload ?? {};
    try {
      await entry.client.publishAsync(topic, JSON.stringify({ id: cmd.id, type: p.type, data_point: p.data_point, value: p.value }), { qos: 1 });
    } catch (e) {
      await reportCommand(c, cmd.id, false, null, `publish failed: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    // Delivered; wait briefly for the device's ack.
    entry.pending.set(cmd.id, setTimeout(() => {
      entry.pending.delete(cmd.id);
      void reportCommand(c, cmd.id, true, { delivered: true, acknowledged: false });
    }, COMMAND_ACK_MS));
    console.log(`[${c.id}] command ${cmd.command} published to ${topic}`);
  }
}

function connect(c) {
  const url = `${c.protocol}://${c.host}:${c.port}`;
  const client = mqtt.connect(url, {
    username: c.username || undefined,
    password: c.password || undefined,
    clientId: c.client_id || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 15000,
  });

  const entry = { client, sig: signature(c), heartbeatAt: 0, pending: new Map(), conn: c };
  live.set(c.id, entry);
  const ackTopic = commandTopic(c) ? `${commandTopic(c)}/ack` : null;

  client.on('connect', () => {
    console.log(`[${c.id}] connected ${url}, subscribing ${c.topic} (qos ${c.qos})`);
    client.subscribe(ackTopic ? [c.topic, ackTopic] : c.topic, { qos: c.qos }, (err) => {
      if (err) {
        console.error(`[${c.id}] subscribe failed:`, err.message);
        void setStatus(c.id, { last_error: `subscribe: ${err.message}` });
      } else {
        void setStatus(c.id, { last_connected_at: new Date().toISOString(), last_error: null });
        entry.heartbeatAt = Date.now();
      }
    });
  });

  client.on('message', async (topic, payload) => {
    if (ackTopic && topic === ackTopic) {
      let ack;
      try {
        ack = JSON.parse(payload.toString('utf8'));
      } catch {
        return;
      }
      const timer = ack && entry.pending.get(ack.id);
      if (timer) {
        clearTimeout(timer);
        entry.pending.delete(ack.id);
        await reportCommand(c, ack.id, ack.ok !== false, ack.result ?? null, ack.error ?? null);
      }
      return;
    }
    const readings = normalise(payload, topic).filter((r) => r.metric);
    if (readings.length === 0) return;

    for (const r of readings) {
      const { error } = await supabase.rpc('fp_device_ingest', {
        p_key: c.device_key,
        p_metric: r.metric,
        p_value: r.value ?? null,
        p_unit: r.unit ?? null,
        p_ts: r.ts ?? new Date().toISOString(),
        p_meta: r.meta ?? null,
      });
      if (error) {
        console.error(`[${c.id}] ingest failed:`, error.message);
        void setStatus(c.id, { last_error: `ingest: ${error.message}` });
        return;
      }
    }

    // Throttled heartbeat so a chatty topic doesn't hammer the DB.
    if (Date.now() - entry.heartbeatAt > HEARTBEAT_MS) {
      entry.heartbeatAt = Date.now();
      void setStatus(c.id, { last_connected_at: new Date().toISOString(), last_error: null });
    }
  });

  client.on('error', (err) => {
    console.error(`[${c.id}] error:`, err.message);
    void setStatus(c.id, { last_error: err.message });
  });

  return entry;
}

function disconnect(id) {
  const entry = live.get(id);
  if (!entry) return;
  console.log(`[${id}] disconnecting`);
  for (const t of entry.pending.values()) clearTimeout(t);
  entry.client.end(true);
  live.delete(id);
}

async function sync() {
  const { data, error } = await supabase
    .from('fp_device_connections')
    .select('*, device:fp_devices(device_key, active)')
    .eq('enabled', true);

  if (error) {
    console.error('config fetch failed:', error.message);
    return;
  }

  // Flatten: only keep rows whose device is active and has a key.
  const wanted = new Map();
  for (const row of data ?? []) {
    const key = row.device?.device_key;
    if (!key || row.device?.active === false) continue;
    wanted.set(row.id, { ...row, device_key: key });
  }

  // Drop connections that vanished, were disabled, or changed.
  for (const id of [...live.keys()]) {
    const c = wanted.get(id);
    if (!c || live.get(id).sig !== signature(c)) disconnect(id);
  }

  // Open anything wanted that isn't currently live.
  for (const [id, c] of wanted) {
    if (!live.has(id)) connect(c);
  }
}

async function loop() {
  try {
    await sync();
  } catch (e) {
    console.error('sync threw:', e instanceof Error ? e.message : String(e));
  }
}

console.log(`FacilityPro MQTT bridge starting (sync every ${SYNC_INTERVAL_MS}ms).`);
await loop();
setInterval(loop, SYNC_INTERVAL_MS);

let delivering = false;
setInterval(async () => {
  if (delivering) return;
  delivering = true;
  try {
    for (const entry of live.values()) await deliverCommands(entry.conn, entry);
  } catch (e) {
    console.error('command delivery threw:', e instanceof Error ? e.message : String(e));
  } finally {
    delivering = false;
  }
}, COMMAND_POLL_MS);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n${sig} — closing ${live.size} connection(s).`);
    for (const id of [...live.keys()]) disconnect(id);
    process.exit(0);
  });
}
