// FacilityPro platform API as seen by a gateway: key-authenticated RPCs
// (migration 0077). The gateway never holds a user session or the service
// role key; its key can only report readings for its own org's devices and
// handle the commands addressed to it.

export class PlatformError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
  // Worth retrying later (network, overload), as opposed to a rejected request.
  get retriable() {
    return !this.status || this.status >= 500 || this.status === 429;
  }
}

export class PlatformApi {
  /** @param {{ url: string, apiKey: string, gatewayKey: string, fetch?: typeof fetch }} opts */
  constructor({ url, apiKey, gatewayKey, fetch: f }) {
    this.url = url.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.gatewayKey = gatewayKey;
    this.fetch = f ?? globalThis.fetch;
  }

  async rpc(fn, args) {
    const headers = { apikey: this.apiKey, 'Content-Type': 'application/json' };
    // Legacy JWT keys also go in Authorization; new sb_publishable_ keys don't.
    if (this.apiKey.startsWith('eyJ')) headers.Authorization = `Bearer ${this.apiKey}`;
    let res;
    try {
      res = await this.fetch(`${this.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
    } catch (e) {
      throw new PlatformError(`network: ${e instanceof Error ? e.message : e}`, 0);
    }
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) throw new PlatformError(body?.message ?? `HTTP ${res.status}`, res.status);
    return body;
  }

  config(info) {
    return this.rpc('fp_gateway_config', { p_key: this.gatewayKey, p_info: info ?? null });
  }

  /** @param {{ device: string, metric: string, value: number|null, unit?: string|null, ts?: string, meta?: object }[]} readings */
  ingest(readings) {
    return this.rpc('fp_gateway_ingest', { p_key: this.gatewayKey, p_readings: readings });
  }

  claimCommands(limit = 20) {
    return this.rpc('fp_iot_claim_commands', { p_key: this.gatewayKey, p_limit: limit });
  }

  commandResult(id, ok, result, error) {
    return this.rpc('fp_iot_command_result', {
      p_key: this.gatewayKey, p_command: id, p_ok: ok, p_result: result ?? null, p_error: error ?? null,
    });
  }
}
