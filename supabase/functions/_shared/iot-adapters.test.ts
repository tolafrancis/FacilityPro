// deno test supabase/functions/_shared/iot-adapters.test.ts
import { detectAdapter, parse, parseTopic } from './iot-adapters.ts';

function eq(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}\n     got ${a}`);
}

Deno.test('generic: single, batch and flat bodies', () => {
  eq(parse({ metric: 'temperature', value: 22.5, unit: '°C' }, 'generic').map((r) => [r.metric, r.value, r.unit]), [['temperature', 22.5, '°C']]);
  eq(parse({ readings: [{ device: 'A', metric: 'co2', value: '812' }] }, 'generic').map((r) => [r.device, r.metric, r.value]), [['A', 'co2', 812]]);
  eq(parse({ temperature: 21, door: true, label: 'x', pm: { '2_5': 12 } }, 'generic').map((r) => [r.metric, r.value]),
     [['temperature', 21], ['door', 1], ['pm_2_5', 12]]);
});

Deno.test('topic: FacilityPro topic scheme names the device', () => {
  eq(parseTopic('facilitypro/org1/site1/FCU-201/telemetry'), { org: 'org1', site: 'site1', device: 'FCU-201', channel: 'telemetry' });
  eq(parseTopic('other/x'), null);
  const body = { topic: 'facilitypro/org1/site1/FCU-201/telemetry', payload: '{"temperature":23.1,"humidity":55}' };
  eq(detectAdapter(body), 'topic');
  eq(parse(body, 'topic').map((r) => [r.device, r.metric, r.value]), [['FCU-201', 'temperature', 23.1], ['FCU-201', 'humidity', 55]]);
  const ev = { topic: 'facilitypro/o/s/LEAK-1/event', payload: { event: 'leak', value: true } };
  eq(parse(ev, 'topic').map((r) => [r.device, r.metric, r.value]), [['LEAK-1', 'leak', 1]]);
});

Deno.test('ttn: decoded payload, DevEUI and radio metadata', () => {
  const body = {
    end_device_ids: { device_id: 'lht65-1', dev_eui: '70B3D57ED0000001' },
    uplink_message: {
      f_cnt: 42,
      received_at: '2026-09-24T09:30:00Z',
      decoded_payload: { TempC_SHT: 24.8, Hum_SHT: 61.2 },
      rx_metadata: [{ gateway_ids: { gateway_id: 'gw-1' }, rssi: -97, snr: 7.5 }],
    },
  };
  eq(detectAdapter(body), 'ttn');
  const r = parse(body, 'ttn');
  eq(r.map((x) => [x.device, x.metric, x.value, x.ts]), [
    ['70B3D57ED0000001', 'TempC_SHT', 24.8, '2026-09-24T09:30:00Z'],
    ['70B3D57ED0000001', 'Hum_SHT', 61.2, '2026-09-24T09:30:00Z'],
    ['70B3D57ED0000001', 'rssi', -97, '2026-09-24T09:30:00Z'],
    ['70B3D57ED0000001', 'snr', 7.5, '2026-09-24T09:30:00Z'],
  ]);
  eq(r[0].meta, { lorawan: { f_cnt: 42, gateway: 'gw-1' } });
});

Deno.test('chirpstack: object and rxInfo', () => {
  const body = {
    deviceInfo: { devEui: '24e124136b000001', deviceName: 'am307' },
    time: '2026-09-24T09:31:00Z',
    fCnt: 7,
    object: { temperature: 25.1, co2: 1040 },
    rxInfo: [{ gatewayId: 'ug65', rssi: -80, snr: 9 }],
  };
  eq(detectAdapter(body), 'chirpstack');
  eq(parse(body, 'chirpstack').map((r) => [r.device, r.metric, r.value]), [
    ['24e124136b000001', 'temperature', 25.1], ['24e124136b000001', 'co2', 1040],
    ['24e124136b000001', 'rssi', -80], ['24e124136b000001', 'snr', 9],
  ]);
});
