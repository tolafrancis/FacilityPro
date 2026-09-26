A **request** is a report that something is wrong ("the air-conditioning in Suite 1201 is not cooling"). A **work order** is the job to fix it: who does it, by when, what they used and how it ended. This page follows one job from start to finish.

**Where:** Menu → **Requests**, **Work orders**, **My work**, **Approvals**.

## The life of a job at a glance

1. **Reported** — a tenant or staff member reports a fault. It becomes a **request** (status *New*).
2. **Work order created** — a manager clicks **Create work order**, or it happens automatically.
3. **Assigned** — a technician (or a vendor) is chosen. Status: **Assigned**.
4. **In progress** — the technician starts work, logs parts and time and fills in the checklist.
5. **On hold** (optional) — paused, for example while waiting for parts.
6. **Resolved** — the technician finishes and records what was done.
7. **Verified** — a manager checks the work.
8. **Closed** — the job is complete. It can be **reopened** if the fault comes back.

The request follows its work order, so the person who reported the fault always sees the current status.

> **Note:** Only the moves allowed next are offered. Technicians move their own jobs from *Assigned* to *Resolved*. Only managers and administrators **verify**, **close** and **reopen** closed work.

## Step 1: A fault is reported

![Report a fault](/help/screens/request-new.webp)

① Summary · ② Fault type · ③ Severity · ④ Location · ⑤ Description · ⑥ Photo · ⑦ Submit report

1. Click **Report a fault** (tenants) or **Create → Report a fault** (staff), or **Report fault** on an asset.
2. Write a short **Summary** ①, e.g. *Pantry sink leaking under cabinet*.
3. Choose the **Fault type** ② and **Severity** ③.
4. Choose the **Location** ④. Staff can also pick an **Asset type** and **Asset**.
5. Describe the problem ⑤ and add a **Photo** ⑥ if you can.
6. Click **Submit report** ⑦.

Other ways faults arrive:

- a **QR code** on equipment or a **public report link** (no sign-in needed; switch on under [Workflows](/help/guide/settings#workflows-automation)),
- **Zalo, WhatsApp or email** conversations in the [Inbox](/help/guide/notifications#inbox-conversations-with-tenants),
- an **IoT alert** from a sensor ([IoT](/help/guide/iot#alerts)).

## Step 2: Turning a request into a work order

![Requests list](/help/screens/requests.webp)

① New request · ② Search · ③ Filter by status or location · ④ A request

1. Open **Requests** and click the request.
2. Check the details and click **Create work order**.
3. The work order opens with the title, location, asset, fault type and priority copied across. Its **due date** is set from your [SLA targets](/help/guide/settings#sla-targets).

> **Tip:** With **Auto-create work orders** switched on ([Workflows](/help/guide/settings#workflows-automation)), every new request becomes a work order at once, and routing rules can assign it. In the demo, water leaks go straight to Kenji (Plumbing).

A manager can also change a request's status directly, for example to **Rejected** if it is not a maintenance job.

## Step 3: Assigning the work

![Work order header](/help/screens/wo-detail-top.webp)

① Status · ② Assignee · ③ Vendor · ④ Print job sheet · ⑤ Timeline

1. Open the work order.
2. Choose the technician in **Assignee** ②. The status changes to **Assigned** and the technician is notified.
3. If a contractor does the job, choose them in **Vendor** ③ (or leave **In-house**). The vendor's active contracts are listed underneath.
4. Optionally set the **Cost center**.

> **Tip:** Click **Print job sheet** ④ for a printable sheet with the details, instructions, closing details, parts, labour and signature lines. Use **Print / Save as PDF** on that page. It is handy for contractors.

## Step 4: Doing the work (technician)

Technicians find their jobs under **My work**.

![My work](/help/screens/my-work.webp)

1. Open the job and change **Status** ① to **→ In progress**. The start time is recorded in the timeline ⑤.
2. Scroll down to record the work:

![Recording the work](/help/screens/wo-detail-work.webp)

① Closing details · ② Approval · ③ Checklist · ④ Parts used · ⑤ Labour

3. **Checklist** ③ — tick Pass/Fail, enter values and notes, then **Save checklist**. If no checklist is attached, a manager can choose one from **Attach a checklist…**.
4. **Parts used** ④ — choose the part, enter the **Quantity** and click **Log part**. Stock goes down automatically ([Inventory](/help/guide/inventory)).
5. **Labor** ⑤ — enter the **Minutes** worked and click **Log labor**. The technician's hourly rate is filled in; the cost is calculated.
6. **Photo evidence** — add **Before** and **After** photos.

> **Note:** The work order's **Cost** is the labour cost plus the parts used.

### Putting work on hold

Choose **→ On hold**. You are asked why (e.g. *Waiting for run capacitor, PO sent*). The reason shows on the work order. Choose **→ In progress** to continue.

## Step 5: Resolving the work

1. Under **Closing details** ①, choose the **Cause of failure** (*Wear and tear, Misuse, Manufacturing defect, External cause, Unknown*) and the **Completion code** (*Repaired, Replaced, No fault found, Deferred*).
2. Enter **Downtime (minutes)** if the equipment was out of use.
3. Change **Status** to **→ Resolved**.

> **Warning:** You cannot resolve without a **completion code**, or while required checklist items are unfinished. The page tells you what is missing.

## Step 6: Verifying and closing (manager)

1. Open the resolved work order and check the checklist, photos, parts and labour.
2. Choose **→ Verified**, then **→ Closed**. (You can close straight from *Resolved*.)
3. If the fault comes back, choose **↺ Reopen**. The work order goes back to *In progress* and the reopen count goes up.

![A closed work order](/help/screens/wo-closed.webp)

## Approvals for expensive work

1. On the work order, click **Request approval** ② and add a note (for example the quote).
2. Administrators and managers see it under **Approvals**, with **Approve** and **Reject**.

![Approvals](/help/screens/approvals.webp)

① Approve · ② Reject

> **Note:** An approval records the decision. It does not stop anyone changing the work order's status, so agree in your team that nobody starts until it is approved.

## Finding work orders

![Work orders list](/help/screens/work-orders.webp)

① Search · ② Filters · ③ TV display · ④ A work order

- **Search** ① looks in titles and instructions.
- **Filters** ② narrow the list by **Status**, **Location**, **Assignee** and **Priority**.
- **TV display** ③ sets up a wall screen showing live job status ([Settings → TV displays](/help/guide/settings#tv-displays)).
- The list shows 25 jobs per page. Use **Previous** / **Next** at the bottom.
