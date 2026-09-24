// End-to-end gateway tests against a simulated Modbus TCP energy meter and a
// local MQTT broker, with the platform API faked.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import ModbusRTU from 'modbus-serial';
import mqtt from 'mqtt';
import Aedes from 'aedes';
import { Gateway } from '../src/gateway.mjs';
import { PlatformError } from '../src/api.mjs';
import { ReadingBuffer } from '../src/buffer.mjs';
import { encode } from '../src/codec.mjs';

// ---- a Modbus TCP meter: register map like an iEM3250 (1-based table addresses)
const regs = new Map();
const put = (addr1, value, type) => encode(value, type).forEach((w, i) => regs.set(addr1 - 1 + i, w));
put(3000, 12.5, 'float32');       // current L1, A
put(3028, 230.5, 'float32');      // voltage L1-N, V
put(3060, 4.2, 'float32');        // total active power, kW
put(3204, 1234567, 'int64');      // total active energy, Wh
regs.set(99, 21);                 // setpoint (uint16, 0-based 99), writable

let modbus;
let modbusPort;
let broker;
let brokerServer;
let brokerPort;

async function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

before(async () => {
  modbusPort = await freePort();
  modbus = new ModbusRTU.ServerTCP({
    getHoldingRegister: (addr) => regs.get(addr) ?? 0,
    getInputRegister: () => 0,
    getCoil: () => false,
    setRegister: (addr, value) => { regs.set(addr, value); },
    setCoil: () => {},
  }, { host: '127.0.0.1', port: modbusPort, unitID: 7 });
  await new Promise((r) => modbus.on('initialized', r));

  broker = await Aedes.createBroker();
  brokerPort = await freePort();
  brokerServer = createServer(broker.handle);
  await new Promise((r) => brokerServer.listen(brokerPort, '127.0.0.1', r));
});

after(async () => {
  await new Promise((r) => modbus.close(r));
  await new Promise((r) => brokerServer.close(r));
  await new Promise((r) => broker.close(r));
});

const meter = () => ({
  id: 'dev-meter', external_id: 'MB-1', name: 'Main meter', protocol: 'modbus_tcp',
  connection: { host: '127.0.0.1', port: modbusPort, unit_id: 7, poll_seconds: 60 },
  data_points: [
    { key: 'current_l1', metric: 'current_l1', unit: 'A', writable: false, source: { register_type: 'holding', address: 3000, datatype: 'float32', one_based: true } },
    { key: 'voltage_l1', metric: 'voltage_l1', unit: 'V', writable: false, source: { register_type: 'holding', address: 3028, datatype: 'float32', one_based: true } },
    { key: 'power', metric: 'power', unit: 'kW', writable: false, source: { register_type: 'holding', address: 3060, datatype: 'float32', one_based: true } },
    { key: 'energy', metric: 'energy', unit: 'Wh', writable: false, source: { register_type: 'holding', address: 3204, datatype: 'int64', one_based: true } },
    { key: 'setpoint', metric: 'setpoint', unit: '°C', writable: true, source: { register_type: 'holding', address: 99, datatype: 'uint16' } },
  ],
});

function fakeApi(devices, commands = []) {
  const api = {
    ingested: [], results: [], down: false, queue: [...commands],
    async config() { return { gateway: { id: 'gw', name: 'GW-001' }, devices }; },
    async ingest(batch) {
      if (api.down) throw new PlatformError('network: ECONNREFUSED', 0);
      api.ingested.push(...batch);
      return { ingested: batch.length, errors: [] };
    },
    async claimCommands() { const q = api.queue; api.queue = []; return q; },
    async commandResult(id, ok, result, error) { api.results.push({ id, ok, result, error }); return true; },
  };
  return api;
}

const quiet = () => {};
const running = new Set();
function gateway(opts) {
  const gw = new Gateway(opts);
  running.add(gw);
  return gw;
}
afterEach(async () => {
  for (const gw of running) await gw.stop();
  running.clear();
});

test('Modbus TCP: reads a meter\'s register map and forwards raw readings by external id', async () => {
  const api = fakeApi([meter()]);
  const gw = gateway({ api, log: quiet });
  await gw.syncConfig();
  await gw.pollDue();
  await gw.flush();
  const byKey = Object.fromEntries(api.ingested.map((r) => [r.metric, r]));
  assert.equal(byKey.current_l1.value, 12.5);
  assert.equal(byKey.voltage_l1.value, 230.5);
  assert.ok(Math.abs(byKey.power.value - 4.2) < 1e-6);
  assert.equal(byKey.energy.value, 1234567);
  assert.equal(byKey.energy.unit, 'Wh');             // units are converted by the platform, not here
  assert.ok(api.ingested.every((r) => r.device === 'MB-1'));
});

test('store-and-forward: readings survive a platform outage and are sent afterwards', async () => {
  const api = fakeApi([meter()]);
  const gw = gateway({ api, log: quiet, buffer: new ReadingBuffer({ log: quiet }) });
  await gw.syncConfig();
  api.down = true;
  await gw.pollDue();
  await gw.flush();
  assert.equal(api.ingested.length, 0);
  assert.equal(gw.buffer.size, 5);
  api.down = false;
  await gw.flush();
  assert.equal(api.ingested.length, 5);
  assert.equal(gw.buffer.size, 0);
});

test('commands: a write reaches the register; an expired command is never executed', async () => {
  const soon = new Date(Date.now() + 60000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  const api = fakeApi([meter()], [
    { id: 'c1', device_id: 'dev-meter', command: 'set_setpoint', expires_at: soon,
      payload: { type: 'write', data_point: 'setpoint', value: 23, source: { register_type: 'holding', address: 99, datatype: 'uint16' } } },
    { id: 'c2', device_id: 'dev-meter', command: 'set_setpoint', expires_at: past,
      payload: { type: 'write', data_point: 'setpoint', value: 30, source: { register_type: 'holding', address: 99, datatype: 'uint16' } } },
    { id: 'c3', device_id: 'dev-meter', command: 'write', expires_at: soon,
      payload: { type: 'write', data_point: 'x', value: 1, source: { register_type: 'input', address: 5, datatype: 'uint16' } } },
  ]);
  const gw = gateway({ api, log: quiet });
  await gw.syncConfig();
  await gw.runCommands();
  assert.equal(regs.get(99), 23);
  assert.deepEqual(api.results.map((r) => [r.id, r.ok]), [['c1', true], ['c2', false], ['c3', false]]);
  assert.match(api.results[1].error, /expired/);
  assert.match(api.results[2].error, /read-only/);
});

test('request_status reads the device immediately', async () => {
  const api = fakeApi([meter()], [
    { id: 'c4', device_id: 'dev-meter', command: 'request_status', expires_at: new Date(Date.now() + 60000).toISOString(), payload: { type: 'request_status' } },
  ]);
  const gw = gateway({ api, log: quiet });
  await gw.syncConfig();
  await gw.runCommands();
  assert.equal(api.results[0].ok, true);
  assert.equal(api.ingested.length, 5);
});

test('an unreachable Modbus device is reported and retried, without stopping the others', async () => {
  const dead = { ...meter(), id: 'dev-dead', external_id: 'MB-DEAD', name: 'Dead meter',
    connection: { host: '127.0.0.1', port: await freePort(), unit_id: 1, timeout_ms: 500 } };
  const logs = [];
  const api = fakeApi([meter(), dead]);
  const gw = gateway({ api, log: (m) => logs.push(String(m)) });
  await gw.syncConfig();
  await gw.pollDue();
  await gw.flush();
  assert.equal(api.ingested.filter((r) => r.device === 'MB-1').length, 5);
  assert.ok(logs.some((l) => l.includes('Dead meter') && l.includes('read failed')));
});

test('MQTT: a device publishing on the FacilityPro topic appears as readings; commands are published and acknowledged', async () => {
  const dev = { id: 'dev-fcu', org_id: 'org', site_id: 'site', external_id: 'FCU-201', name: 'FCU 201', protocol: 'mqtt',
    connection: { url: `mqtt://127.0.0.1:${brokerPort}` }, data_points: [] };
  const api = fakeApi([dev]);
  const gw = gateway({ api, log: quiet });
  await gw.syncConfig();

  // The simulated thermostat: publishes telemetry, obeys commands.
  const thermostat = await mqtt.connectAsync(`mqtt://127.0.0.1:${brokerPort}`);
  await thermostat.subscribeAsync('facilitypro/org/site/FCU-201/command');
  thermostat.on('message', (topic, payload) => {
    const cmd = JSON.parse(payload.toString());
    thermostat.publish('facilitypro/org/site/FCU-201/command/ack', JSON.stringify({ id: cmd.id, ok: true, result: { setpoint: cmd.value } }));
  });
  await new Promise((r) => setTimeout(r, 200)); // gateway subscription settles
  await thermostat.publishAsync('facilitypro/org/site/FCU-201/telemetry', JSON.stringify({ temperature: 24.8, humidity: 55, power: true }), { qos: 1 });
  await new Promise((r) => setTimeout(r, 200));
  await gw.flush();
  assert.deepEqual(api.ingested.map((r) => [r.device, r.metric, r.value]),
    [['FCU-201', 'temperature', 24.8], ['FCU-201', 'humidity', 55], ['FCU-201', 'power', 1]]);

  api.queue.push({ id: 'c5', device_id: 'dev-fcu', command: 'set_setpoint', expires_at: new Date(Date.now() + 60000).toISOString(),
    payload: { type: 'write', data_point: 'setpoint', value: 22 } });
  await gw.runCommands();
  assert.deepEqual(api.results[0], { id: 'c5', ok: true, result: { setpoint: 22 }, error: undefined });

  await thermostat.endAsync();
});
