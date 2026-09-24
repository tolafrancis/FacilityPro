// MQTT connector for devices on a broker the gateway can reach (usually a
// broker on the building network). connection_config:
//   { url: "mqtts://broker.local:8883", topic, command_topic, qos: 1 }
// topic defaults to the FacilityPro scheme
//   facilitypro/{org_id}/{site_id or "-"}/{external_id}/telemetry
// and command_topic to …/command, so a shared broker can confine each
// organisation to its own prefix with topic ACLs. Broker credentials come from the
// gateway's own environment (MQTT_USERNAME / MQTT_PASSWORD), never from the
// platform. Commands are published as {id, data_point, value}; a device
// confirms by publishing {id, ok, result|error} to <command_topic>/ack.

import mqtt from 'mqtt';
import { Connector } from '../connector.mjs';
import { flatten } from '../payload.mjs';

const clients = new Map(); // url -> { client, users, handlers: Set<fn> }

export class MqttConnector extends Connector {
  constructor(device, ctx) {
    super(device, ctx);
    const c = device.connection ?? {};
    this.url = c.url ?? process.env.MQTT_URL;
    if (!this.url) throw new Error(`${device.name}: connection needs url (or MQTT_URL on the gateway)`);
    const base = `facilitypro/${device.org_id ?? '-'}/${device.site_id ?? '-'}/${this.ref}`;
    this.topic = c.topic ?? `${base}/telemetry`;
    this.commandTopic = c.command_topic ?? `${base}/command`;
    if (/[+#]/.test(this.commandTopic)) throw new Error(`${device.name}: command_topic cannot contain wildcards`);
    this.qos = [0, 1, 2].includes(Number(c.qos)) ? Number(c.qos) : 1;
    this.pending = new Map(); // command id -> resolve
  }

  async connect() {
    let shared = clients.get(this.url);
    if (!shared) {
      const client = mqtt.connect(this.url, {
        username: process.env.MQTT_USERNAME || undefined,
        password: process.env.MQTT_PASSWORD || undefined,
        reconnectPeriod: 5000,
        connectTimeout: 15000,
        clean: false, // keep QoS 1 messages across reconnects
        clientId: `facilitypro-gw-${process.pid}-${Math.random().toString(16).slice(2, 8)}`,
      });
      shared = { client, users: 0, handlers: new Set() };
      client.on('message', (topic, payload) => shared.handlers.forEach((h) => h(topic, payload)));
      client.on('error', (e) => this.ctx.log(`mqtt ${this.url}: ${e.message}`));
      clients.set(this.url, shared);
    }
    shared.users += 1;
    this.shared = shared;
    this.handler = (topic, payload) => this.#onMessage(topic, payload);
    shared.handlers.add(this.handler);
    shared.client.subscribe([this.topic, `${this.commandTopic}/ack`], { qos: this.qos });
  }

  async disconnect() {
    if (!this.shared) return;
    this.shared.handlers.delete(this.handler);
    this.shared.client.unsubscribe([this.topic, `${this.commandTopic}/ack`]);
    this.shared.users -= 1;
    if (this.shared.users <= 0) {
      clients.delete(this.url);
      this.shared.client.end(true);
    }
    this.shared = null;
  }

  #matches(filter, topic) {
    const f = filter.split('/');
    const t = topic.split('/');
    for (let i = 0; i < f.length; i++) {
      if (f[i] === '#') return true;
      if (f[i] !== '+' && f[i] !== t[i]) return false;
    }
    return f.length === t.length;
  }

  #onMessage(topic, payload) {
    let body;
    try {
      body = JSON.parse(payload.toString('utf8'));
    } catch {
      body = payload.toString('utf8').trim();
    }
    if (this.#matches(`${this.commandTopic}/ack`, topic)) {
      const done = body && this.pending.get(body.id);
      if (done) {
        this.pending.delete(body.id);
        done({ ok: body.ok !== false, result: body.result ?? undefined, error: body.error ?? undefined });
      }
      return;
    }
    if (!this.#matches(this.topic, topic)) return;
    const ts = new Date().toISOString();
    let readings;
    if (typeof body === 'number' || (typeof body === 'string' && body !== '' && !Number.isNaN(Number(body)))) {
      readings = [{ key: topic.split('/').pop() || 'value', value: Number(body), ts }];
    } else if (body && typeof body === 'object') {
      readings = flatten(body).map((r) => ({ key: r.metric, value: r.value, unit: r.unit ?? null, ts: r.ts ?? ts }));
    } else {
      return;
    }
    if (readings.length) this.ctx.onReadings?.(readings);
  }

  async sendCommand(command) {
    if (!this.shared) return { ok: false, error: 'not connected' };
    const msg = { id: command.id, type: command.type, data_point: command.data_point, value: command.value };
    await this.shared.client.publishAsync(this.commandTopic, JSON.stringify(msg), { qos: 1 });
    // Wait briefly for the device's ack; without one the command counts as delivered.
    const ack = await new Promise((resolve) => {
      this.pending.set(command.id, resolve);
      setTimeout(() => {
        if (this.pending.delete(command.id)) resolve(null);
      }, Number(process.env.COMMAND_ACK_MS ?? 10000));
    });
    return ack ?? { ok: true, result: { delivered: true, acknowledged: false } };
  }

  async getDeviceStatus() {
    return { online: !!this.shared?.client.connected };
  }
}
