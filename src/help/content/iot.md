**IoT (Internet of Things)** connects sensors and meters to FacilityPro: temperatures, pressures, power, water leaks, air quality and more. You see live readings and history, get alerts when something goes out of range, and can create work orders automatically.

**Who can use it:** Administrators and Managers add devices and set rules. Technicians see live data, history and alerts, and acknowledge and resolve alerts.

**Where:** Menu → **Devices**.

## The devices page

![IoT devices](/help/screens/devices.webp)

① Add device · ② Fleet summary · ③ A device

- The **summary** ② counts **Total**, **Online**, **Offline**, **Warning**, **Critical** and **Battery low** devices.
- The tabs switch between **Devices**, **Alerts** (all open alerts) and **Gateways**.
- Filter by building, category, manufacturer or protocol, or search by name.
- Each device shows a green (online) or red (offline) dot, its location, when it last reported, any open alert and its protocol (e.g. *Modbus TCP*, *MQTT*, *LoRaWAN*).

## A device's page

![Device page](/help/screens/device-detail.webp)

① Tabs · ② Live data and history

- **Overview** — device details, the linked asset, **Live data** (latest value of each reading) and a **History** chart (**1 h**, **24 h**, **7 days**, **30 days** or **Custom**). Click a reading to chart it.
- **Alerts** — this device's alerts.
- **Commands** — send control commands (for devices that accept them).
- **Data points** — which readings the device sends and how they are named.
- **Rules** — thresholds that raise alerts.
- **Maintenance** — work on the linked asset.
- **Connection** — device key and connection details (managers).

## Adding a device

1. Click **Add device** ①.
2. Follow the steps: choose the device type and model (or *Other*), give it a **Name**, choose its **Location** and optional **Asset**, and pick the **protocol**.
3. On the last step, copy the **device key** and connection details into your device or gateway.
4. The device shows **Online** when its first reading arrives.

> **Warning:** Treat the device key like a password. If it leaks, open **Connection** and click **Rotate key**.

## Alerts

![Device alerts](/help/screens/device-alerts.webp)

Alerts have a severity (**Info**, **Warning**, **Critical**, **Emergency**) and a status:

1. **Open** — just raised. Click **Acknowledge** to show you are dealing with it.
2. **Acknowledged** — someone is on it.
3. **Resolved** — click **Resolve** and describe what was done.

A device that stops reporting raises an **Offline** alert after the time set for it (e.g. *after 15 minutes*).

## Threshold rules

![Device rules](/help/screens/device-rules.webp)

1. Open the device → **Rules** → **Add rule**.
2. Choose the **metric** (e.g. *pressure*), the **Condition** (e.g. *greater than*) and the **Threshold** (e.g. *11*).
3. Choose the **Action**:
   - **Alert only**,
   - **Notify** — also send notifications to the roles you choose,
   - **Work order** — create a work request automatically,
   - **Notify + work order**.
4. Set the **Severity**, a **Cooldown (min)** so repeated readings don't flood you, and optionally **Escalate if not acknowledged (min)**.

In the demo, *Condenser pressure high* on CH-01 raised a critical alert. That alert became the work order *Chiller CH-01 high condenser pressure*.

## Energy and meters

Power and energy meters (e.g. *Main energy meter (MSB-01)*) appear like any other device, with live load and history. A device can also **mirror to meter**: its readings feed an asset meter, which can trigger [meter-based maintenance](/help/guide/preventive-maintenance#meter-based-schedules).
