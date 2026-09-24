// Modbus TCP and RTU connector. connection_config:
//   TCP: { host, port: 502, unit_id: 1, poll_seconds: 60, timeout_ms: 3000 }
//   RTU: { serial_port: "/dev/ttyUSB0", baud_rate: 9600, parity: "none",
//          data_bits: 8, stop_bits: 1, unit_id: 1, poll_seconds: 60 }
// Data point source: { register_type: holding|input|coil|discrete, address,
//                      datatype, word_order: big|little, one_based }
//
// Many devices usually share one link (several meters behind one Modbus TCP
// gateway, or on one RS-485 bus), so links are pooled per transport and
// requests on a link are serialised.

import ModbusRTU from 'modbus-serial';
import { Connector } from '../connector.mjs';
import { address, decode, encode, planReads, wordCount } from '../codec.mjs';

const links = new Map(); // transport key -> { client, queue, users, connecting }

function transportKey(c, protocol) {
  return protocol === 'modbus_rtu'
    ? `rtu:${c.serial_port}:${c.baud_rate ?? 9600}:${c.parity ?? 'none'}`
    : `tcp:${c.host}:${c.port ?? 502}`;
}

async function openLink(key, c, protocol) {
  let link = links.get(key);
  if (!link) {
    link = { client: new ModbusRTU(), queue: Promise.resolve(), users: 0, connecting: null };
    links.set(key, link);
  }
  link.users += 1;
  return link;
}

async function ensureOpen(link, c, protocol) {
  if (link.client.isOpen) return;
  if (!link.connecting) {
    link.connecting = (protocol === 'modbus_rtu'
      ? link.client.connectRTUBuffered(c.serial_port, {
          baudRate: Number(c.baud_rate ?? 9600),
          parity: c.parity ?? 'none',
          dataBits: Number(c.data_bits ?? 8),
          stopBits: Number(c.stop_bits ?? 1),
        })
      : link.client.connectTCP(c.host, { port: Number(c.port ?? 502) })
    ).finally(() => { link.connecting = null; });
  }
  await link.connecting;
}

// Runs fn with exclusive use of the link.
function exclusive(link, fn) {
  const run = link.queue.then(fn, fn);
  link.queue = run.catch(() => {});
  return run;
}

export class ModbusConnector extends Connector {
  constructor(device, ctx) {
    super(device, ctx);
    const c = device.connection ?? {};
    if (device.protocol === 'modbus_rtu' ? !c.serial_port : !c.host) {
      throw new Error(`${device.name}: connection needs ${device.protocol === 'modbus_rtu' ? 'serial_port' : 'host'}`);
    }
    this.key = transportKey(c, device.protocol);
    this.unitId = Number(c.unit_id ?? 1);
    this.timeout = Number(c.timeout_ms ?? 3000);
    this.lastError = null;
  }

  async connect() {
    this.link = await openLink(this.key, this.device.connection, this.device.protocol);
  }

  async disconnect() {
    if (!this.link) return;
    this.link.users -= 1;
    if (this.link.users <= 0) {
      links.delete(this.key);
      await new Promise((resolve) => (this.link.client.isOpen ? this.link.client.close(resolve) : resolve()));
    }
    this.link = null;
  }

  async #io(fn) {
    return exclusive(this.link, async () => {
      await ensureOpen(this.link, this.device.connection, this.device.protocol);
      this.link.client.setID(this.unitId);
      this.link.client.setTimeout(this.timeout);
      return fn(this.link.client);
    });
  }

  async getTelemetry() {
    const points = (this.device.data_points ?? []).filter((p) => p.source && p.source.address !== undefined);
    if (!points.length) return [];
    const ts = new Date().toISOString();
    const out = [];
    try {
      for (const plan of planReads(points)) {
        const res = await this.#io((cl) => {
          switch (plan.type) {
            case 'input': return cl.readInputRegisters(plan.start, plan.length);
            case 'coil': return cl.readCoils(plan.start, plan.length);
            case 'discrete': return cl.readDiscreteInputs(plan.start, plan.length);
            default: return cl.readHoldingRegisters(plan.start, plan.length);
          }
        });
        for (const { p, start } of plan.items) {
          const off = start - plan.start;
          const value = plan.type === 'coil' || plan.type === 'discrete'
            ? (res.data[off] ? 1 : 0)
            : decode(res.data.slice(off, off + wordCount(p.source.datatype ?? 'uint16')).map(Number), p.source.datatype ?? 'uint16', p.source.word_order);
          if (Number.isFinite(value)) out.push({ key: p.key, value, unit: p.unit ?? null, ts });
        }
      }
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      // A dead socket is reopened on the next poll.
      if (this.link?.client.isOpen && /timed out|ECONNRESET|EPIPE|closed/i.test(this.lastError)) this.link.client.close(() => {});
      throw e;
    }
    return out;
  }

  async sendCommand(command) {
    if (command.type === 'request_status') {
      const readings = await this.getTelemetry();
      this.ctx.onReadings?.(readings);
      return { ok: true, result: { readings: readings.length } };
    }
    const src = command.source ?? {};
    const type = src.register_type ?? 'holding';
    if (type === 'input' || type === 'discrete') return { ok: false, error: `${type} registers are read-only` };
    const addr = address(src);
    await this.#io((cl) => {
      if (type === 'coil') return cl.writeCoil(addr, !!command.value);
      const words = encode(Number(command.value), src.datatype ?? 'uint16', src.word_order);
      return words.length === 1 ? cl.writeRegister(addr, words[0]) : cl.writeRegisters(addr, words);
    });
    return { ok: true, result: { written: command.value, address: addr } };
  }

  async getDeviceStatus() {
    return { online: !this.lastError, error: this.lastError };
  }
}
