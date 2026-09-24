// FacilityPro edge gateway. Runs on-site (industrial PC, Raspberry Pi,
// container on the building network), reads Modbus TCP/RTU and local-MQTT
// devices, and forwards readings to the platform with store-and-forward.
//
// Env:
//   FACILITYPRO_URL       https://<project-ref>.supabase.co          (required)
//   FACILITYPRO_API_KEY   the project's publishable / anon key       (required)
//   GATEWAY_KEY           this gateway's key (Devices → Gateways)    (required)
//   BUFFER_FILE           file that keeps unsent readings across restarts (optional)
//   BUFFER_MAX            max buffered readings (default 50000)
//   CONFIG_SYNC_MS        config refresh / heartbeat (default 60000)
//   COMMAND_POLL_MS       how often to look for commands (default 5000)
//   MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD   local broker for MQTT devices

import { PlatformApi } from './src/api.mjs';
import { ReadingBuffer } from './src/buffer.mjs';
import { Gateway } from './src/gateway.mjs';

const env = process.env;
const missing = ['FACILITYPRO_URL', 'FACILITYPRO_API_KEY', 'GATEWAY_KEY'].filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing required env: ${missing.join(', ')} (see .env.example)`);
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString(), ...a);
const gateway = new Gateway({
  api: new PlatformApi({ url: env.FACILITYPRO_URL, apiKey: env.FACILITYPRO_API_KEY, gatewayKey: env.GATEWAY_KEY }),
  buffer: new ReadingBuffer({ max: Number(env.BUFFER_MAX ?? 50000), file: env.BUFFER_FILE || null, log }),
  configSyncMs: Number(env.CONFIG_SYNC_MS ?? 60000),
  commandPollMs: Number(env.COMMAND_POLL_MS ?? 5000),
  info: { software: 'facilitypro-iot-gateway/1.0.0', node: process.version, platform: process.platform },
  log,
});

log('FacilityPro gateway starting');
await gateway.start();
log(`gateway ${gateway.gatewayInfo?.name ?? '(config pending)'}: ${gateway.devices.size} device(s)`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    log(`${sig}: flushing and closing`);
    await gateway.stop();
    process.exit(0);
  });
}
