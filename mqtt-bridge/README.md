# FacilitySpace MQTT bridge

A small, always-on worker that lets the app **pull** data from MQTT brokers.

The app's built-in device path is **push**: a device or broker POSTs readings to
`fp_device_ingest` / the `iot-ingest` edge function. That needs the device to
reach *out* to Supabase. Sometimes you instead want the app to **connect out to a
broker and subscribe** — that requires a persistent socket, which serverless
functions can't hold. This worker is that persistent piece.

## What it does

1. Every `SYNC_INTERVAL_MS` it reads enabled rows from `fp_device_connections`
   (configured per device on the **Device → Broker connection** panel in the app).
2. For each row it opens an MQTT connection to `protocol://host:port`, authenticates
   with the optional username/password, and subscribes to `topic` at the chosen QoS.
3. Every received message is normalised into one or more readings and forwarded to
   `fp_device_ingest` using that device's `device_key` — so meters, threshold rules,
   work orders and notifications all fire exactly as they do for the push path.
4. It writes `last_connected_at` / `last_error` back to the row so the app's panel
   can show live status.

Connections are reconciled on every sync: editing a row reconnects it, disabling or
deleting it (or deactivating the device) drops the subscription.

## Accepted payloads (per message)

```jsonc
{ "metric": "temperature", "value": 22.5, "unit": "C" }      // single
{ "readings": [ { "metric": "temperature", "value": 22.5 } ] } // batch
{ "temperature": 22.5, "humidity": 60 }                       // flat — each numeric key is a metric
22.5                                                          // bare number — metric = last topic segment
```

## Run

```bash
cd mqtt-bridge
npm install
cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm start
```

Or pass env inline:

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npm start
```

Keep it running with your process manager of choice. It auto-reconnects to brokers
and re-reads config, so it's safe to leave up. Ready-made options below.

### Docker (recommended)

```bash
cd mqtt-bridge
cp .env.example .env          # fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
docker compose up -d          # build + run, restarts unless stopped
docker compose logs -f        # watch it connect
```

The image opens no inbound ports — it only makes outbound connections (to Supabase
and your broker). To rebuild after a code change: `docker compose up -d --build`.

### systemd (bare-metal / VM, no Docker)

Put the repo's `mqtt-bridge/` at `/opt/facilityspace/mqtt-bridge`, run
`npm install --omit=dev`, create `.env`, then:

```bash
sudo cp systemd/facilityspace-mqtt-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now facilityspace-mqtt-bridge
journalctl -u facilityspace-mqtt-bridge -f
```

Edit `User`/`WorkingDirectory`/`ExecStart` in the unit if your paths differ.

### Managed worker (Railway / Fly / Render)

Point the platform at this `mqtt-bridge/` directory (it has a `Dockerfile`), set the
two env vars in the dashboard, and run it as a **worker / background** service — not
a web service, since it serves no HTTP.

## Test the path end-to-end

`test-publish.mjs` sends one sample reading so you can watch publish → worker →
app without a real device. It reads the broker/topic from the device's saved
**Broker connection**, so configure that in the app first and keep `npm start`
running in another terminal.

```bash
# by device name (or id) — looks up the broker from the DB:
npm run test-publish -- "Cold room temp sensor" temperature 23.4 C

# or target a broker directly, no DB lookup:
BROKER_HOST=broker.hivemq.com BROKER_TOPIC=sensors/coldroom/temp \
  npm run test-publish -- - temperature 22.5 C
```

Args: `<deviceNameOrId> [metric] [value] [unit]` (defaults: `temperature 22.5 C`).
On success the worker logs an ingest and the reading appears under the device's
**Recent readings**.

## Troubleshooting

Symptoms map to causes as follows. The worker logs each connection with a `[<id>]`
prefix, and writes the latest failure to `fp_device_connections.last_error` (shown
on the device's **Broker connection** panel in the app).

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Missing required env: SUPABASE_SERVICE_ROLE_KEY` | Key not in `mqtt-bridge/.env`, or you're running from the wrong directory | Put the **service_role** key (Dashboard → Settings → API) in `mqtt-bridge/.env`; run from `mqtt-bridge/` so `--env-file` finds it. Don't use the anon key. |
| `Missing required env: SUPABASE_URL` | URL missing/blank | Set `SUPABASE_URL=https://<ref>.supabase.co` (no `VITE_` prefix, no trailing slash). |
| `config fetch failed: relation "fp_device_connections" does not exist` | Migration not applied | Apply `0043_device_broker_connections.sql` (`supabase db push`). |
| `config fetch failed: Invalid API key` / `JWT` errors | Wrong/expired key, or anon key used | Re-copy the **service_role** key. |
| Worker starts but never logs `connected` | No enabled connection, or device inactive | Add a **Broker connection** in the app and tick **Enabled**; ensure the device's **Active** box is on. |
| `[id] error: connect ECONNREFUSED` / `ETIMEDOUT` / `ENOTFOUND` | Wrong host/port, broker down, or firewall | Verify host/port (1883 mqtt, 8883 mqtts, 443 wss); confirm outbound egress to the broker is allowed. |
| `[id] error: Connection refused: Not authorized` (code 5) | Bad broker username/password | Fix credentials on the Broker connection panel. |
| `[id] error: ... self signed certificate` (mqtts) | Broker uses an untrusted/self-signed cert | Use a broker with a valid cert, or front it with one; this worker does not disable TLS verification. |
| Connects + subscribes, but no readings appear | Topic mismatch, or payload shape not understood | Confirm the device publishes to the **exact** subscribed topic (MQTT wildcards `+`/`#` are allowed in the subscription, not the publish); send one of the accepted payload shapes above. Try `npm run test-publish`. |
| `ingest: Invalid or inactive device key` | Device was deactivated, or its key was rotated | Re-activate the device / re-check it exists; the worker re-reads the key each sync. |
| Readings show but no work order / notification fires | No matching threshold rule, or still in cooldown | Add/inspect a **threshold rule** on the device; remember the per-rule cooldown. |
| Edited a connection but nothing changed | Worker hasn't re-synced yet | Wait up to `SYNC_INTERVAL_MS` (default 15s); the worker reconnects changed rows automatically. |

Watch logs live: `npm start` (foreground) or `docker compose logs -f`. Bump
verbosity of your broker side too — most brokers log auth/subscription rejections.

## Security notes

- Uses the **service role** key and therefore bypasses RLS. Run it only in a trusted
  backend environment; never bundle the key into the web app.
- Broker passwords are stored in `fp_device_connections` and are readable by org
  admins/managers (same trust level as the device key). If you need stronger secrecy,
  encrypt them at rest and decrypt here before connecting.

## Prerequisites

- Migration `0043_device_broker_connections.sql` applied to the database.
- Node 18+ (uses ESM + global `fetch` via `@supabase/supabase-js`).
