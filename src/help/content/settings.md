Settings shape how FacilityPro works for your organisation: your profile, the lists people choose from, response targets, automation, integrations, TV screens and your plan.

**Who can use it:** Administrators and Managers (the **Team & roles** tab is Administrators only).

**Where:** Menu → **Settings**, **Workflows** and **Billing**.

## General

![General settings](/help/screens/settings-general.webp)

- **Name** — your organisation's name, shown at the top of every page.
- **Default language** — the language for new members (each person can switch EN / VI).
- **Timezone** — used for due dates and maintenance schedules, e.g. *Asia/Ho_Chi_Minh*.
- **Currency** — a three-letter code such as *VND* or *USD*, used for every amount.
- **Score inbox messages' sentiment with AI** — off by default. When on, incoming tenant messages are analysed to spot unhappy customers.

Click **Save** after changing anything.

## Catalogs

![Catalogs](/help/screens/settings-catalogs.webp)

The lists people choose from when reporting and recording work.

- **Fault types** — e.g. *Water leak*, each with a default priority (*Low* to *Critical*). New requests of that type get that priority.
- **Asset types** — e.g. *Chiller*, *Lift / elevator*.
- Use **+ Add** to add, the **pencil** to edit, the **power** icon to switch a type off or on (a switched-off type disappears from forms but stays on old records), and the **bin** to delete.
- **Load default types** adds a standard starter list.

## SLA targets

![SLA targets](/help/screens/settings-sla.webp)

Set the **Resolution hours** for each priority, e.g. *Critical 4*, *High 24*, *Medium 72*, *Low 168*. New work orders get their due date from these automatically. Click **Save** on each row.

## Team & roles

See [User management](/help/guide/user-management#team-roles).

## TV displays

![TV displays](/help/screens/settings-displays.webp)

A TV display board shows live work orders (status, priority, date, location, assignee) on any screen, such as a smart TV in the control room, without signing in.

1. Go to **Settings → TV displays** and click **New display**.
2. Give it a **Name** (e.g. *Lobby TV*) and choose the **Site** (or **All sites**).
3. Choose the **Columns to show** (New, In progress, On hold, Done), how long to **Keep finished work on screen**, the **Priorities**, and the **Details on each job** (priority, due date & overdue, location, assignee's first name, asset, when opened).
4. Choose the **Layout** (*Status columns* or *List*), **Colours** (*Dark* or *Light*) and **Screen language**, then click **Create display**.
5. Copy the link and open it in the TV's browser, then click **Full screen**. It updates by itself and pages through the jobs when there are many.
6. If the link leaks, create a new link for the board; the old link stops working at once.

## Integrations

![Integrations](/help/screens/settings-integrations.webp)

- **IoT & sensors** — manage devices from the [Devices page](/help/guide/iot).
- **WhatsApp** and **Zalo** — shows whether your business account is connected. Contact FacilityPro support to connect it.
- **Email, SMS & push delivery** — shows how messages are delivered, with your own **Email me my notifications** switch.

## Workflows (automation)

![Workflows](/help/screens/workflows.webp)

Go to **Workflows** in the menu.

**Automation** (at the top):

- **Allow public fault reports** — anyone with the QR code or link can report a fault without signing in. The **Public report link** is shown underneath.
- **Auto-create work orders** — every new request becomes a work order at once. Routing workflows and SLA targets then apply.

**Create workflow**:

1. Choose a **Trigger**, e.g. *Service Request*, *Fault Report*, *Work Order Created*, *Parts Quantity*, *Meter Reading*, *Sensor Integration*, *Desk Booking* or *Asset Field (warranty / useful life)*.
2. Fill in the **Trigger settings**, e.g. *When pending too long: 60 minutes*, or a fault type or priority.
3. Optionally set a **Cooldown (minutes)** and **Additional filters**.
4. Add **Actions**: *Send Email*, *Send SMS*, *Send Push*, *Assign To*, *Create Request*, *Alert Account*, *Send Survey*, *Create Expenditure* or *Send Approval Email*.
5. Save. The workflow appears in the **Workflow library** with its run count and last run. Use **Disable** to pause it.

> **Tip:** Start from the **templates** in the library, such as *Auto-assign work orders*, *Email when warranty expiry is near* or *Survey after request completion*.

## Billing

![Billing](/help/screens/billing.webp)

**Billing** (Administrators) shows your plan (*Free*, *Pro* or *Business*), what is included and how much you use, with options to upgrade or manage payment.
