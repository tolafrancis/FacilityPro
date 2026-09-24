// The edge gateway loop:
//   * config sync (heartbeat): fp_gateway_config → devices + data points;
//     connectors are created, kept or replaced as the config changes;
//   * polling: each polled device is read on its own interval;
//   * store-and-forward: readings go through the buffer to fp_gateway_ingest
//     in batches, retried while the platform is unreachable;
//   * commands: claimed from the platform, checked against their expiry,
//     executed by the device's connector, result reported back.

import { PlatformError } from './api.mjs';
import { ReadingBuffer } from './buffer.mjs';
import { createConnector as defaultCreateConnector } from './connectors/index.mjs';

const BATCH = 500;

export class Gateway {
  /**
   * @param {{ api: import('./api.mjs').PlatformApi, log?: Function, buffer?: ReadingBuffer,
   *           createConnector?: Function, configSyncMs?: number, flushMs?: number, commandPollMs?: number,
   *           info?: object }} opts
   */
  constructor(opts) {
    this.api = opts.api;
    this.log = opts.log ?? ((...a) => console.log(new Date().toISOString(), ...a));
    this.buffer = opts.buffer ?? new ReadingBuffer({ log: this.log });
    this.createConnector = opts.createConnector ?? defaultCreateConnector;
    this.configSyncMs = opts.configSyncMs ?? 60000;
    this.flushMs = opts.flushMs ?? 5000;
    this.commandPollMs = opts.commandPollMs ?? 5000;
    this.commandTimeoutMs = opts.commandTimeoutMs ?? 30000;
    this.info = opts.info ?? {};
    this.devices = new Map(); // device id -> { device, sig, connector, nextPollAt, polling }
    this.timers = [];
    this.flushing = false;
  }

  #sig(d) {
    return JSON.stringify([d.protocol, d.external_id, d.connection, d.data_points]);
  }

  #enqueue(entry, readings) {
    const device = entry.connector.ref;
    this.buffer.push(readings.map((r) => ({
      device, metric: r.key, value: r.value, unit: r.unit ?? null, ts: r.ts ?? new Date().toISOString(), meta: r.meta ?? null,
    })));
  }

  async syncConfig() {
    let cfg;
    try {
      cfg = await this.api.config({ ...this.info, buffered: this.buffer.size, devices: this.devices.size });
    } catch (e) {
      this.log(`config sync failed: ${e.message}`);
      return false;
    }
    this.gatewayInfo = cfg.gateway;
    const wanted = new Map(cfg.devices.map((d) => [d.id, d]));

    for (const [id, entry] of this.devices) {
      const d = wanted.get(id);
      if (!d || this.#sig(d) !== entry.sig) {
        await entry.connector.disconnect().catch(() => {});
        this.devices.delete(id);
        this.log(`device ${entry.device.name}: ${d ? 'reconfigured' : 'removed'}`);
      }
    }
    for (const [id, d] of wanted) {
      if (this.devices.has(id)) continue;
      let connector;
      try {
        const entry = { device: d, sig: this.#sig(d), nextPollAt: 0, polling: false };
        connector = this.createConnector(d, {
          log: (m) => this.log(`[${d.name}] ${m}`),
          onReadings: (readings) => this.#enqueue(entry, readings),
        });
        if (!connector) {
          this.log(`device ${d.name}: protocol ${d.protocol ?? '(none)'} is not handled by this gateway`);
          continue;
        }
        entry.connector = connector;
        await connector.connect();
        this.devices.set(id, entry);
        this.log(`device ${d.name}: ${d.protocol} ready`);
      } catch (e) {
        this.log(`device ${d.name}: ${e.message}`);
      }
    }
    return true;
  }

  async pollDue(now = Date.now()) {
    const due = [...this.devices.values()].filter((e) => !e.polling && e.nextPollAt <= now);
    await Promise.all(due.map(async (entry) => {
      entry.polling = true;
      try {
        const readings = await entry.connector.getTelemetry();
        if (readings.length) this.#enqueue(entry, readings);
      } catch (e) {
        this.log(`[${entry.device.name}] read failed: ${e.message}`);
      } finally {
        entry.polling = false;
        entry.nextPollAt = Date.now() + entry.connector.pollSeconds * 1000;
      }
    }));
  }

  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.buffer.size) {
        const batch = this.buffer.peek(BATCH);
        try {
          const res = await this.api.ingest(batch);
          if (res?.errors?.length) this.log(`ingest: ${res.errors.length} reading(s) rejected, e.g. ${JSON.stringify(res.errors[0])}`);
          this.buffer.shift(batch.length);
        } catch (e) {
          if (e instanceof PlatformError && !e.retriable) {
            this.log(`ingest rejected (${e.status}): ${e.message}; dropping ${batch.length} reading(s)`);
            this.buffer.shift(batch.length);
          } else {
            this.log(`ingest failed, keeping ${this.buffer.size} reading(s) buffered: ${e.message}`);
            break;
          }
        }
      }
    } finally {
      this.flushing = false;
      try {
        this.buffer.persist();
      } catch (e) {
        this.log(`buffer persist failed: ${e.message}`);
      }
    }
  }

  async runCommands() {
    let commands;
    try {
      commands = await this.api.claimCommands(20);
    } catch (e) {
      if (!(e instanceof PlatformError && e.retriable)) this.log(`command claim failed: ${e.message}`);
      return;
    }
    for (const c of commands ?? []) {
      let outcome;
      const entry = this.devices.get(c.device_id);
      if (new Date(c.expires_at).getTime() < Date.now()) {
        outcome = { ok: false, error: 'expired before execution' };
      } else if (!entry) {
        outcome = { ok: false, error: 'device not handled by this gateway' };
      } else {
        try {
          // A device that never answers must not hold up the others.
          outcome = await Promise.race([
            entry.connector.sendCommand({ id: c.id, ...c.payload }),
            new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'timed out' }), this.commandTimeoutMs).unref?.()),
          ]);
        } catch (e) {
          outcome = { ok: false, error: e.message };
        }
      }
      this.log(`command ${c.command} → ${entry?.device.name ?? c.device_id}: ${outcome.ok ? 'ok' : outcome.error}`);
      try {
        await this.api.commandResult(c.id, outcome.ok, outcome.result, outcome.error);
      } catch (e) {
        this.log(`command result not reported: ${e.message}`);
      }
    }
    if (commands?.length) await this.flush(); // e.g. request_status readings
  }

  async start() {
    await this.syncConfig();
    const every = (ms, fn) => {
      let busy = false;
      const t = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          await fn();
        } finally {
          busy = false;
        }
      }, ms);
      this.timers.push(t);
    };
    every(this.configSyncMs, () => this.syncConfig());
    every(1000, () => this.pollDue());
    every(this.flushMs, () => this.flush());
    every(this.commandPollMs, () => this.runCommands());
  }

  async stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    await this.flush();
    for (const entry of this.devices.values()) await entry.connector.disconnect().catch(() => {});
    this.devices.clear();
  }
}
