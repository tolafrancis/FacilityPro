# FacilityPro edge gateway

The on-site part of the IoT integration layer ([docs/IOT_ARCHITECTURE.md](../docs/IOT_ARCHITECTURE.md)).
It runs inside the building (industrial PC, Raspberry Pi, small VM, Docker host), talks to
devices that can't reach the internet themselves, and forwards their readings to FacilityPro.

```
Modbus TCP meters ─┐
RS-485 Modbus RTU ─┼─► edge gateway ──HTTPS──► FacilityPro (fp_gateway_ingest)
local MQTT broker ─┘        ▲                          │
                            └──── commands ◄───────────┘ (fp_iot_claim_commands)
```

- **Connectors** per protocol (`src/connectors/`): Modbus TCP, Modbus RTU and MQTT today, all
  behind one interface (`src/connector.mjs`). BACnet/IP and OPC UA are next (see the roadmap).
- **No manufacturer code.** A Schneider iEM3250 or any other Modbus meter is a *register map*
  in the platform catalog (a device model), so a new meter model needs no gateway release.
- **Store-and-forward.** Readings are buffered (on disk with `BUFFER_FILE`) while the internet
  is down and sent afterwards with their original timestamps. The platform stores each
  (device, metric, timestamp) once, so re-sending is safe.
- **Commands.** The gateway collects commands addressed to it (setpoints, on/off, modes,
  status requests), checks they haven't expired, executes them (Modbus register or coil
  write, MQTT publish) and reports the result. Expired commands are never executed.
- **Least privilege.** The gateway holds only its **gateway key**: it can report readings for
  its own organisation's devices and handle its own commands. It never has a user session or
  the service-role key, and device secrets never leave the platform.

## Set up

1. In FacilityPro, open **Devices → Gateways**, add a gateway and copy its key.
2. Add devices with protocol **Modbus TCP / Modbus RTU / MQTT**, choose this gateway, and
   fill in the connection:
   - Modbus TCP: `{"host": "192.168.1.50", "port": 502, "unit_id": 1, "poll_seconds": 60}`
   - Modbus RTU: `{"serial_port": "/dev/ttyUSB0", "baud_rate": 9600, "parity": "none", "unit_id": 3}`
   - MQTT: `{"url": "mqtt://192.168.1.10:1883"}`: the device publishes JSON to
     `facilitypro/{org_id}/{site_id}/{external_id}/telemetry` and receives commands on
     `…/command` (acknowledging on `…/command/ack` with `{"id", "ok", "result"}`).
3. Pick a device **model** (for example Schneider iEM3250) to load its register map, or
   add data points with a `source` such as
   `{"register_type": "holding", "address": 3028, "datatype": "float32", "one_based": true}`.
   Datatypes: `bool, int16, uint16, int32, uint32, float32, int64, uint64, float64`;
   `word_order: "little"` for meters that send the low word first.
4. Run the gateway:

```bash
cd iot-gateway
cp .env.example .env        # FACILITYPRO_URL, FACILITYPRO_API_KEY, GATEWAY_KEY
npm ci --omit=dev
npm start
```

Docker: `docker build -t facilitypro-iot-gateway . && docker run -d --restart unless-stopped --env-file .env -v facilitypro-gw:/data facilitypro-iot-gateway`
(add `--build-arg WITH_SERIAL=true` and `--device /dev/ttyUSB0` for Modbus RTU).
systemd: see `systemd/facilitypro-iot-gateway.service`.

The gateway only makes **outbound** connections (HTTPS to FacilityPro, Modbus/MQTT on the
local network), so it needs no inbound firewall rules.

## Tests

```bash
npm test
```

They run the gateway against a simulated Modbus TCP energy meter and a local MQTT broker:
register decoding, store-and-forward through an outage, command writes, expired commands,
an unreachable device, MQTT telemetry and acknowledged commands.

## Adding a connector

Implement `Connector` (`connect`, `disconnect`, `getTelemetry`, `sendCommand`,
`getDeviceStatus`, optionally `discoverDevices`) in `src/connectors/<protocol>.mjs` and
register it in `src/connectors/index.mjs`. Return raw readings (`{key, value, unit}`); the
platform maps keys to canonical metrics and converts units.
