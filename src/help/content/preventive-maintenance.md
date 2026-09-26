**Preventive maintenance (PM)** is planned, repeating work, such as a monthly chiller inspection or a weekly generator test. FacilityPro turns each schedule into a work order at the right time, so nothing is forgotten.

**Who can use it:** Administrators and Managers create and change schedules. Everyone on staff can see them.

**Where:** Menu → **Maintenance** (schedules) and **Checklists** (inspection templates).

## The maintenance page

![Preventive maintenance](/help/screens/maintenance.webp)

① New schedule · ② Generate due now · ③ Calendar · ④ An overdue schedule · ⑤ Required parts · ⑥ Pause / Resume

- The **calendar** ③ marks each day that has work due, with a count.
- Each **schedule card** shows the asset, how often it repeats (**Every 30 days** or **Every 250 units**), its priority and the next due date. Overdue schedules ④ show **Overdue** in red.

## Creating a schedule

![New maintenance schedule](/help/screens/maintenance-new.webp)

1. Click **New schedule** ①.
2. Enter the **Name** (e.g. *Chiller CH-01 monthly inspection*).
3. Choose the **Asset**.
4. Choose the **Trigger**:
   - **On a schedule (days)** — then set **Repeat every (days)** and the **First due date**.
   - **By meter usage** — see [Meter-based schedules](#meter-based-schedules).
5. **Generate this many days early** — how many days before the due date the work order is created. The work order's due date is still the real due date.
6. Optionally choose a **Checklist**, **Assign to** a technician, and set the **Priority**.
7. Click **Create**.

> **Tip:** Due times use your organisation's time zone. The form shows it under the date, e.g. *Due at 09:00 (Asia/Ho_Chi_Minh)*.

## How work orders are generated

- FacilityPro checks schedules automatically and creates a work order when one comes due (minus the lead time).
- To do it straight away, click **Generate due now** ②. A message tells you how many were created, e.g. *"2 work order(s) generated."*, or *"Nothing is due right now."*
- The work order links back to the schedule, gets its checklist, and suggests the schedule's required parts.
- As soon as the work order is generated, the schedule moves on to its next due date. Late work shows on the work order, not on the schedule.

## Meter-based schedules

Use these for work that depends on use, not time. For example, *service the generator every 250 run hours*.

1. Add a meter to the asset first ([Assets → Meters](/help/guide/assets#meters-and-readings)).
2. In **New schedule**, set **Trigger** to **By meter usage**.
3. Choose the **Meter** and enter **Every (units)**, e.g. *250*.
4. A work order is created each time the readings pass the next threshold.

## Required parts kits

1. On a schedule card, click **Required parts** ⑤.
2. Add the parts and quantities the job needs (e.g. *8 × AHU pre-filter G4*).
3. Each generated work order shows these as **Suggested parts**. The technician clicks **Use** to log them. See [Inventory](/help/guide/inventory).

## Pausing, resuming and editing

- **Pause** ⑥ stops a schedule from generating work (e.g. while equipment is out of service). **Resume** starts it again.
- **Edit** changes any setting, including the **Next due date**.

## Checklists (inspection templates)

![A checklist template](/help/screens/checklist-template.webp)

A checklist is a reusable list of checks, attached to PM schedules or to single work orders.

1. Go to **Checklists** → **New checklist** and give it a name.
2. Open it and click **Add item** for each check. Choose its **Type**:
   - **Pass / Fail** — e.g. *No refrigerant leaks*.
   - **Value** — a number to record, e.g. *Chilled water temperature (°C)*.
   - **Photo** — a photo is needed (added under *Photo evidence*).
   - **Text note** — free text.
3. Tick **Required** for checks that must be done before the work order can be resolved.

> **Warning:** A work order with an unfinished required check cannot be marked **Resolved**. The technician sees *"Complete the required checklist items before resolving."*
