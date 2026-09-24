// supabase/functions/iot-api/index.ts
//
// Versioned REST facade over the IoT layer (docs/IOT_ARCHITECTURE.md §API),
// for the mobile app, integrators and scripts. Every call runs with the
// caller's own JWT, so the same RLS and role checks as the web app apply:
// tenants and sites are isolated by the database, not by this code.
//
// Deploy: supabase functions deploy iot-api
// Base:   https://<ref>.supabase.co/functions/v1/iot-api/v1
//
//   GET    /v1/devices                     ?site_id&location_id&device_type&category&protocol&manufacturer&status
//   POST   /v1/devices                     (org admin) body: device fields; "apply_model": true copies the model's data points
//   GET    /v1/devices/{id}
//   PATCH  /v1/devices/{id}                (org admin)
//   DELETE /v1/devices/{id}                (org admin)
//   GET    /v1/devices/{id}/status         status, health and latest values
//   GET    /v1/devices/{id}/telemetry      ?metric&from&to&limit      raw readings
//   GET    /v1/devices/{id}/history        ?metric&from&to&points     bucketed min/avg/max
//   GET    /v1/devices/{id}/data-points
//   GET    /v1/devices/{id}/alerts         ?status=open|acknowledged|resolved
//   POST   /v1/alerts/{id}/acknowledge | /v1/alerts/{id}/resolve
//   GET    /v1/devices/{id}/commands
//   POST   /v1/devices/{id}/commands       body: {command, params, ttl_seconds}
//   GET    /v1/gateways                    (org admin / manager)
//   GET    /v1/catalog                     device types, manufacturers, models, quantities

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// PostgREST / RPC errors → HTTP.
function fail(error: { message: string; code?: string }) {
  const m = error.message;
  const status =
    /not_found/.test(m) || error.code === 'PGRST116' ? 404
    : /not_allowed|permission denied|row-level security/.test(m) || error.code === '42501' ? 403
    : /rate_limited/.test(m) ? 429
    : /device_offline|device_inactive/.test(m) ? 409
    : 400;
  return json({ error: m }, status);
}

const DEVICE_FIELDS = new Set([
  'name', 'kind', 'asset_id', 'location_id', 'site_id', 'device_type_id', 'model_id', 'protocol', 'external_id',
  'gateway_id', 'connection_config', 'meter_id', 'metric_map', 'offline_after_minutes', 'active',
]);
function pick(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).filter(([k]) => DEVICE_FIELDS.has(k)));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function route(db: SupabaseClient, req: Request, parts: string[], q: URLSearchParams): Promise<Response> {
  const [resource, id, sub, action] = parts;
  const method = req.method;
  const body = method === 'POST' || method === 'PATCH' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
  if (id && !UUID.test(id)) return json({ error: 'invalid id' }, 400);

  if (resource === 'catalog' && method === 'GET') {
    const [types, manufacturers, models, quantities] = await Promise.all([
      db.from('fp_iot_device_types').select('id, org_id, code, category, name_i18n, metrics').order('category'),
      db.from('fp_iot_manufacturers').select('id, org_id, name, website').order('name'),
      db.from('fp_iot_device_models').select('id, org_id, manufacturer_id, device_type_id, model, protocols, data_points, commands, notes').order('model'),
      db.from('fp_iot_quantities').select('code, canonical_unit, category, name_i18n').order('code'),
    ]);
    const err = types.error ?? manufacturers.error ?? models.error ?? quantities.error;
    if (err) return fail(err);
    return json({ device_types: types.data, manufacturers: manufacturers.data, models: models.data, quantities: quantities.data });
  }

  if (resource === 'gateways' && method === 'GET' && !id) {
    const { data, error } = await db.from('fp_iot_gateways')
      .select('id, org_id, site_id, location_id, name, protocols, serial, firmware_version, last_seen_at, active');
    return error ? fail(error) : json({ data });
  }

  if (resource === 'alerts' && id && method === 'POST' && (sub === 'acknowledge' || sub === 'resolve')) {
    const { data, error } = await db.rpc('fp_device_alert_update', { p_alert: id, p_action: sub, p_note: (body.note as string) ?? null });
    return error ? fail(error) : json({ updated: data });
  }

  if (resource !== 'devices') return json({ error: 'not found' }, 404);

  // /v1/devices
  if (!id) {
    if (method === 'GET') {
      let query = db.from('fp_device_directory').select('*').order('name');
      for (const f of ['site_id', 'location_id', 'device_type', 'category', 'protocol', 'manufacturer', 'status']) {
        const v = q.get(f);
        if (v) query = query.eq(f, v);
      }
      const { data, error } = await query;
      return error ? fail(error) : json({ data });
    }
    if (method === 'POST') {
      const { data, error } = await db.from('fp_devices').insert({ ...pick(body), org_id: body.org_id }).select('id').single();
      if (error) return fail(error);
      if (body.apply_model) {
        const { error: e2 } = await db.rpc('fp_device_apply_model', { p_device: data.id });
        if (e2) return fail(e2);
      }
      return json({ id: data.id }, 201);
    }
    return json({ error: 'method not allowed' }, 405);
  }

  // /v1/devices/{id}
  if (!sub) {
    if (method === 'GET') {
      const { data, error } = await db.from('fp_device_directory').select('*').eq('id', id).maybeSingle();
      if (error) return fail(error);
      return data ? json({ data }) : json({ error: 'not found' }, 404);
    }
    if (method === 'PATCH') {
      const { data, error } = await db.from('fp_devices').update(pick(body)).eq('id', id).select('id');
      if (error) return fail(error);
      return data?.length ? json({ updated: true }) : json({ error: 'not found or not allowed' }, 404);
    }
    if (method === 'DELETE') {
      const { data, error } = await db.from('fp_devices').delete().eq('id', id).select('id');
      if (error) return fail(error);
      return data?.length ? json({ deleted: true }) : json({ error: 'not found or not allowed' }, 404);
    }
    return json({ error: 'method not allowed' }, 405);
  }

  if (method === 'GET' && sub === 'status') {
    const [dev, latest] = await Promise.all([
      db.from('fp_device_directory')
        .select('id, name, status, last_seen_at, battery_pct, signal_rssi, firmware_version, gateway_id, protocol, alert_severity, open_alerts')
        .eq('id', id).maybeSingle(),
      db.from('fp_device_latest').select('metric, value, unit, ts, quality').eq('device_id', id),
    ]);
    if (dev.error) return fail(dev.error);
    if (!dev.data) return json({ error: 'not found' }, 404);
    return json({ data: { ...dev.data, latest: latest.data ?? [] } });
  }

  if (method === 'GET' && sub === 'telemetry') {
    let query = db.from('fp_telemetry').select('metric, value, unit, ts').eq('device_id', id)
      .order('ts', { ascending: false }).limit(Math.min(Number(q.get('limit') ?? 500) || 500, 5000));
    if (q.get('metric')) query = query.eq('metric', q.get('metric')!);
    if (q.get('from')) query = query.gte('ts', q.get('from')!);
    if (q.get('to')) query = query.lt('ts', q.get('to')!);
    const { data, error } = await query;
    return error ? fail(error) : json({ data });
  }

  if (method === 'GET' && sub === 'history') {
    const metric = q.get('metric');
    if (!metric) return json({ error: 'metric required' }, 400);
    const { data, error } = await db.rpc('fp_device_history', {
      p_device: id,
      p_metric: metric,
      p_from: q.get('from') ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      p_to: q.get('to') ?? new Date().toISOString(),
      p_points: Number(q.get('points') ?? 200) || 200,
    });
    return error ? fail(error) : json({ data });
  }

  if (method === 'GET' && sub === 'data-points') {
    const { data, error } = await db.from('fp_device_data_points')
      .select('id, key, metric, name, unit, scale, offset, source, writable, dangerous, min_value, max_value, discovered, active')
      .eq('device_id', id).order('key');
    return error ? fail(error) : json({ data });
  }

  if (method === 'GET' && sub === 'alerts') {
    let query = db.from('fp_device_alerts').select('*').eq('device_id', id).order('opened_at', { ascending: false }).limit(200);
    if (q.get('status')) query = query.eq('status', q.get('status')!);
    const { data, error } = await query;
    return error ? fail(error) : json({ data });
  }

  if (sub === 'commands') {
    if (method === 'GET') {
      const { data, error } = await db.from('fp_device_commands')
        .select('id, command, params, status, dangerous, requested_by, requested_at, expires_at, sent_at, completed_at, result, error')
        .eq('device_id', id).order('requested_at', { ascending: false }).limit(100);
      return error ? fail(error) : json({ data });
    }
    if (method === 'POST' && !action) {
      if (typeof body.command !== 'string') return json({ error: 'command required' }, 400);
      const { data, error } = await db.rpc('fp_device_command', {
        p_device: id,
        p_command: body.command,
        p_params: (body.params as Record<string, unknown>) ?? {},
        p_ttl_seconds: Number(body.ttl_seconds ?? 120) || 120,
      });
      return error ? fail(error) : json({ id: data, status: 'pending' }, 202);
    }
  }

  return json({ error: 'not found' }, 404);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authorization = req.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) return json({ error: 'not_signed_in' }, 401);

  const url = new URL(req.url);
  // …/iot-api/v1/<resource>/<id>/<sub>/<action>
  const path = url.pathname.split('/').filter(Boolean);
  const v = path.indexOf('v1');
  if (v < 0) return json({ error: 'use /iot-api/v1/…' }, 404);
  try {
    return await route(db, req, path.slice(v + 1), url.searchParams);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
