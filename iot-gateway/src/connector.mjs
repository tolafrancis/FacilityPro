// The connector contract every protocol / manufacturer integration implements
// (docs/IOT_ARCHITECTURE.md §Connectors). The gateway only talks to devices
// through this interface, so adding a protocol or a vendor API means adding
// one file under connectors/ and registering it; nothing else changes, and
// the apps never see protocol or manufacturer details.
//
// A connector instance serves one device. `device` is what fp_gateway_config
// returns:
//   { id, external_id, name, protocol,
//     connection: { …protocol settings… },
//     data_points: [{ key, metric, unit, writable, source: { …address… } }] }
//
// Readings are raw, in the device's own units and keys; the platform maps
// keys to canonical metrics and converts units (migration 0077).

/**
 * @typedef {{ key: string, value: number|null, unit?: string|null, ts?: string, meta?: object }} RawReading
 * @typedef {{ online: boolean, error?: string|null, details?: object }} DeviceStatus
 * @typedef {{ type: 'write'|'request_status', data_point?: string, value?: number, source?: object }} CommandPayload
 * @typedef {{ ok: boolean, result?: object, error?: string }} CommandResult
 */

export class Connector {
  /** @param {object} device  @param {{ log: (…args: any[]) => void, onReadings?: (readings: RawReading[]) => void }} ctx */
  constructor(device, ctx) {
    this.device = device;
    this.ctx = ctx;
  }

  /** Open the transport (socket, serial port, subscription). */
  async connect() {}

  /** Close it. */
  async disconnect() {}

  /** Devices reachable through this transport, when the protocol supports discovery. */
  async discoverDevices() {
    return [];
  }

  /**
   * Current values of the device's data points (polled protocols). Push
   * protocols (MQTT) report through ctx.onReadings instead and return [].
   * @returns {Promise<RawReading[]>}
   */
  async getTelemetry() {
    return [];
  }

  /** @param {CommandPayload} command @returns {Promise<CommandResult>} */
  async sendCommand(command) {
    return { ok: false, error: `${this.device.protocol}: commands not supported` };
  }

  /** @returns {Promise<DeviceStatus>} */
  async getDeviceStatus() {
    return { online: true };
  }

  /** Seconds between polls (polled protocols). */
  get pollSeconds() {
    return Math.max(5, Number(this.device.connection?.poll_seconds ?? 60) || 60);
  }

  /** How the platform identifies this device in gateway readings. */
  get ref() {
    return this.device.external_id || this.device.id;
  }
}
