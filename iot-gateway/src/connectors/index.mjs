// Connector registry: protocol (fp_devices.protocol) → implementation.
// To add a protocol or a manufacturer's cloud API, implement Connector
// (../connector.mjs) and register it here. Manufacturer devices that speak a
// standard protocol need no code: their register maps / data points live in
// the platform catalog (fp_iot_device_models).
//
// Planned: bacnet_ip (Phase 2), opcua (Phase 2), knx / bacnet_mstp (Phase 3).
// LoRaWAN runs through the network server's webhook into iot-ingest, not
// through this gateway.

import { ModbusConnector } from './modbus.mjs';
import { MqttConnector } from './mqtt.mjs';

export const connectors = {
  modbus_tcp: ModbusConnector,
  modbus_rtu: ModbusConnector,
  mqtt: MqttConnector,
};

export function createConnector(device, ctx) {
  const Impl = connectors[device.protocol];
  return Impl ? new Impl(device, ctx) : null;
}
