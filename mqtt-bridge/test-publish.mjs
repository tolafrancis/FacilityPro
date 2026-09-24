// One-shot test publisher for the FacilityPro MQTT bridge.
//
// Publishes a single sample reading to the broker/topic of a device's saved
// "Broker connection", so you can watch the whole path light up:
//   this script → broker → bridge worker → fp_device_ingest → app
//
// Usage (from mqtt-bridge/, with .env holding SUPABASE_URL + SERVICE_ROLE key):
//   npm run test-publish -- <deviceNameOrId> [metric] [value] [unit]
//   node --env-file=.env test-publish.mjs "Cold room temp sensor" temperature 23.4 C
//
// It reads the broker coordinates from fp_device_connections for that device
// (host, port, protocol, topic, username, password), so the worker must already
// be subscribed to the same broker for the reading to flow through.
//
// Alternatively, skip the DB lookup and target a broker directly via env:
//   BROKER_HOST=broker.hivemq.com BROKER_TOPIC=sensors/coldroom/temp \
//   node test-publish.mjs - temperature 22.5 C

import mqtt from 'mqtt';
import { createClient } from '@supabase/supabase-js';

const [, , deviceArg, metricArg, valueArg, unitArg] = process.argv;
const metric = metricArg || 'temperature';
const value = valueArg !== undefined ? Number(valueArg) : 22.5;
const unit = unitArg || 'C';

const DEFAULT_PORT = { mqtt: 1883, mqtts: 8883, ws: 80, wss: 443 };

async function resolveTarget() {
  // Direct mode: broker coordinates straight from env, no DB needed. Triggered by
  // passing "-" as the device arg or simply omitting it while BROKER_HOST is set.
  if ((!deviceArg || deviceArg === '-') && process.env.BROKER_HOST) {
    const protocol = process.env.BROKER_PROTOCOL || 'mqtt';
    return {
      protocol,
      host: process.env.BROKER_HOST,
      port: Number(process.env.BROKER_PORT || DEFAULT_PORT[protocol] || 1883),
      topic: process.env.BROKER_TOPIC,
      username: process.env.BROKER_USERNAME || null,
      password: process.env.BROKER_PASSWORD || null,
      label: 'env',
    };
  }

  if (!deviceArg) {
    throw new Error('Pass a device name/id, or set BROKER_HOST + BROKER_TOPIC. See header for usage.');
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run via `npm run test-publish`, which loads .env).');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Find the device by id (uuid) or by a name match.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceArg);
  const q = supabase.from('fp_devices').select('id, name');
  const { data: devices, error: devErr } = isUuid
    ? await q.eq('id', deviceArg)
    : await q.ilike('name', `%${deviceArg}%`);
  if (devErr) throw new Error(`device lookup: ${devErr.message}`);
  if (!devices || devices.length === 0) throw new Error(`No device matching "${deviceArg}".`);
  if (devices.length > 1) throw new Error(`"${deviceArg}" matched ${devices.length} devices — be more specific or use the id.`);
  const device = devices[0];

  const { data: conn, error: connErr } = await supabase
    .from('fp_device_connections')
    .select('*')
    .eq('device_id', device.id)
    .maybeSingle();
  if (connErr) throw new Error(`connection lookup: ${connErr.message}`);
  if (!conn) throw new Error(`Device "${device.name}" has no Broker connection configured. Add one in the app first.`);

  return { ...conn, label: device.name };
}

// Publish to the resolved broker, resolving with an exit code. We set
// process.exitCode (not process.exit) and let handles drain — abruptly exiting
// while the Supabase/broker sockets are still closing trips a libuv assertion
// on Windows.
function publish(target) {
  return new Promise((resolve) => {
    const url = `${target.protocol}://${target.host}:${target.port}`;
    const payload = JSON.stringify({ metric, value, unit });
    console.log(`Publishing to ${url}  topic="${target.topic}"  (${target.label})`);
    console.log(`Payload: ${payload}`);

    const client = mqtt.connect(url, {
      username: target.username || undefined,
      password: target.password || undefined,
      connectTimeout: 15000,
      reconnectPeriod: 0, // one shot — don't loop
    });

    const done = (code, end = () => client.end()) => {
      clearTimeout(timer);
      end();
      resolve(code);
    };

    const timer = setTimeout(() => {
      console.error('Timed out connecting to broker.');
      done(1, () => client.end(true));
    }, 16000);

    client.on('connect', () => {
      client.publish(target.topic, payload, { qos: Number(target.qos ?? 0) }, (err) => {
        if (err) {
          console.error('Publish failed:', err.message);
          return done(1, () => client.end(true));
        }
        console.log('Published OK. Watch the worker log for ingest, then check the device in the app.');
        done(0);
      });
    });

    client.on('error', (err) => {
      console.error('Broker error:', err.message);
      done(1, () => client.end(true));
    });
  });
}

async function main() {
  let target;
  try {
    target = await resolveTarget();
    if (!target.host || !target.topic) throw new Error('Resolved target is missing host or topic.');
  } catch (e) {
    console.error('Error:', e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }
  process.exitCode = await publish(target);
}

await main();
