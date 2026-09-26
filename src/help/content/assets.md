The **asset register** lists every piece of equipment you maintain: chillers, lifts, pumps, generators, air-conditioners and more. Each asset keeps its details, specifications, meters, documents, QR code and full repair history.

**Who can use it:** Everyone on staff can view assets and report faults on them. Administrators and Managers add, edit and delete them.

**Where:** Menu → **Assets**.

## The asset list

![Asset register](/help/screens/assets.webp)

① Add asset · ② Filters: type, location and status · ③ An asset — click to open

Use the filters ② to show only one type (for example *Chiller*), one location or one status: **In service**, **Retired / disposed** or **All**.

## Adding an asset

![Add asset](/help/screens/asset-new.webp)

1. Click **Add asset**.
2. Enter the **Name** in English (and optionally Tiếng Việt).
3. Choose the **Asset type**. If it is not in the list, type the new name and choose **Other — create new type**.
4. Choose the **Location** (rooms and zones come from [Locations](/help/guide/facilities)).
5. Fill in **Serial number**, **Warranty expiry**, **Manufacturer** and **Model** if you know them.
6. Click **Create asset**.

> **Tip:** Enter the warranty date. Reports and workflows can then warn you before it runs out.

## The asset page

![Asset details](/help/screens/asset-detail.webp)

① Name and type · ② Report fault · ③ Edit / Delete · ④ Tabs · ⑤ Details and specifications

The **Details** tab shows type, location, serial number, warranty, manufacturer, model, purchase date and cost, and **Specifications** (for example *Capacity 350 RT*, *Refrigerant R134a*).

The other tabs:

- **History** — every request and work order raised against this asset, newest first.

  ![History tab](/help/screens/asset-history.webp)

- **Meters** — running hours, trips, kilometres… See [Meters](#meters-and-readings).
- **Documents** — manuals, certificates and reports linked to this asset. Choose one from **Attach an existing document**.
- **QR code** — see [QR codes](#qr-codes-on-equipment).

## Reporting a fault on an asset

1. Open the asset.
2. Click **Report fault** ②. The fault form opens with the asset and its location already filled in.
3. Continue with [Work orders → Step 1](/help/guide/work-orders#step-1-a-fault-is-reported).

## Meters and readings

![Meters tab](/help/screens/asset-meters.webp)

Meters count usage, such as a generator's run hours. They can trigger [meter-based maintenance](/help/guide/preventive-maintenance#meter-based-schedules).

1. Open the asset and click the **Meters** tab.
2. Click **Add meter**. Enter a name and unit (e.g. *h*, *km*, *trips*).
3. To record a reading, type the **Value** and click **Log reading**. The latest value and the reading history are shown.

> **Note:** IoT devices can send meter readings automatically. See [IoT](/help/guide/iot).

## QR codes on equipment

![QR code tab](/help/screens/asset-qr.webp)

1. Open the asset and click **QR code**.
2. Print the code and stick it on the equipment.
3. When **staff** scan it, the asset page opens. When **anyone else** scans it, a fault-report form opens with this asset already chosen. That form only works if public reporting is switched on ([Settings → Workflows](/help/guide/settings#workflows-automation)).

## Editing, retiring or deleting an asset

- Click **Edit** ③ to change any field, including **Status**: *Active*, *Out of service*, *Retired* or *Disposed*.
- Retire rather than delete: the asset's history stays available.
- **Delete** asks for confirmation and cannot be undone.
