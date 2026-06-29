# FacilityPro — Phase 1 (Core CMMS)

Multilingual (English + Vietnamese) CMMS. Phase 1 makes the platform a usable maintenance system: **a fault can be reported and resolved end-to-end, in Vietnamese, with photo evidence.**

**Stack:** React 18 · TypeScript · Vite · Tailwind · Supabase (Postgres + Auth + RLS + Storage) · TanStack Query

---

## What works

**Foundation (Phase 0)**
- Sign up / sign in, create organisation, invite acceptance via token
- Whole-app English ⇄ Vietnamese switch (UI strings + JSONB content)
- Site → Building → Floor → Room/Zone location tree
- Multi-tenant isolation via RLS on every table

**Core CMMS (Phase 1)**
- **Settings** — define bilingual **fault types** and **asset types**, each with a default priority
- **Assets** — registry with bilingual names, type, location, serial/manufacturer/model/warranty; per-asset **QR code** (Asset → QR tab); asset detail with a **history** tab (its requests + work orders)
- **Fault reporting** — `New request` form with severity → priority mapping, optional photo, and **source language captured** (report in Vietnamese and it's stored as `vi`). The QR code encodes `/requests/new?asset=…&location=…` so scanning prefills the form
- **Requests** — list + status filter, detail view, **convert to work order**
- **Work orders** — list + status filter; detail with **assignee** (real org members), **status lifecycle**, instructions, and **before/after photo evidence** (private storage, signed URLs)
- **My Work** — a technician's assigned, open work orders
- **Checklists** — reusable bilingual inspection templates (pass/fail, value, photo, text items); attach one to a work order and complete it with results recorded
- **Preventive maintenance** — recurring schedules per asset, triggered **by calendar interval or by meter usage** (e.g. every 500 running hours); each optionally carrying a checklist and a default assignee; a month calendar of what's due; **Generate due now** creates the work orders (and a `fp_generate_due_pm()` function you can run on a schedule with pg_cron)
- **Parts & inventory** — a parts catalogue with stock balances and reorder levels; log parts used on a work order and stock decrements automatically; low-stock is flagged
- **Meters & readings** — meters per asset with a reading history; meter readings drive meter-based PM
- **Vendors, contracts & licenses** — a supplier directory plus contracts and licenses with expiry tracking (expired / expiring-soon flags)
- **Automation** — SLA targets per priority auto-set a work order's due date, and auto-assignment rules (by priority and/or fault type) set the assignee on creation
- **Reports** — operational KPIs (open/overdue work, average resolution time, PM due, low stock, expiring contracts), CSV export of requests and work orders, and an activity (audit) log
- **In-app notifications** — a notification bell that alerts assignees to new work orders and admins/managers to low stock
- **Generic IoT connectivity** — register any HTTP or MQTT device (vendor-neutral: ESP32/ESP8266, Shelly, Tasmota, Raspberry Pi, PLC/Modbus gateways, LoRaWAN gateways, etc.). Devices authenticate with a per-device key and post a metric + value; readings can mirror into a meter (so meter-based PM runs from live data), and **threshold rules** raise work orders and/or notifications automatically with a cooldown. MQTT devices connect via a broker bridge to a flexible ingest endpoint.
- **Automated fault intake & routing** — occupants scan an asset's QR and report a fault **without an account** (a public, bilingual report page); with auto-conversion on, each report becomes a work order automatically, which the existing triggers then auto-assign and stamp with an SLA due date — scan-to-assigned with no staff step
- **SLA escalation** — a scheduled job flags overdue, unresolved work orders and notifies managers (once each)
- **Expiry reminders** — a scheduled job notifies admins/managers about contracts and licenses nearing expiry (respecting each item's reminder window)
- **Inbox → work order** — turn any conversation into a fault report with one click (the chatbot-to-ticket bridge)
- **Billing & plans** — a plan catalogue with a **PayPal payment link per plan** pasted from the admin editor; subscribe opens the link, activation is recorded manually
- **Omnichannel inbox** — a unified conversations/messages inbox across manual, web, WhatsApp, Zalo, LINE, and email
- **Web-push notifications** — opt-in browser/phone push as a third channel beside email and SMS
- **Offline-first technician PWA** — field writes queue offline and replay on reconnect; a service worker caches the app shell
- **SMS notifications** — opt-in text-message delivery (Twilio)
- **Two-factor authentication** — optional TOTP via Supabase Auth
- **Email notifications** — opt-in email via the outbox + Edge Function (Resend)
- **Approval workflow** — request approval on a work order; managers approve/reject from a queue
- **Printable job sheet** — print or save a per-work-order sheet as PDF from the browser
- **Dashboard** — live counts (open requests, overdue, in-progress, resolved last 30 days) + recent requests
- **Installable PWA** — add to home screen on a phone for the technician flow

The product roadmap (Phases 0–6) is now fully built. Optional future automation: a PayPal Subscriptions webhook to auto-activate, or — for the Vietnam market — a VietQR rail reconciled via SePay/Casso (a `bank-webhook` Edge Function), which slots into the same `fp_subscriptions` model.

---

## Prerequisites

- **Node.js 18+** and npm
- A free **Supabase** project — https://supabase.com
- (Optional) **Supabase CLI** for migrations

---

## 1. Create the Supabase project

1. New project at supabase.com. Choose a region close to your users (**Singapore** for Vietnam/APAC).
2. **Project Settings → API** → copy the **Project URL** and **anon public** key.
3. (Dev convenience) **Authentication → Providers → Email** → optionally turn **off** "Confirm email". Leave on for production.

## 2. Apply the database migrations

**Option A — Supabase CLI (recommended)**

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**Option B — SQL editor**

Run each file in `supabase/migrations/` **in order, 0001 → 0024**, in the dashboard SQL editor.

> Migration **0008** creates the `fp_media` table **and a private storage bucket `fp-media`** with org-scoped access policies (objects are namespaced by org id; access via signed URLs). Migration **0009** adds `fp_org_members()` used to populate the assignee dropdown. Migrations **0010–0011** add checklists and preventive-maintenance schedules plus the `fp_generate_due_pm()` generator. Migration **0013** alters `fp_pm_schedules` (makes `next_due_at` nullable and adds meter-trigger columns) and **replaces** `fp_generate_due_pm()` to handle meter triggers. Migration **0015** adds a `BEFORE INSERT` trigger on `fp_work_orders` (SLA due-date + auto-assignment), and **0016** adds notification triggers. Migration **0017** adds the email outbox (`fp_notification_outbox`) plus a trigger that enqueues an email when an in-app notification lands for a user who opted in, and **0018** adds the approvals workflow. No manual storage setup is needed.

> **Email delivery (optional).** In-app notifications need no setup. To also send emails, deploy the included Edge Function and set two secrets:
>
> ```
> supabase functions deploy process-outbox --no-verify-jwt
> supabase secrets set RESEND_API_KEY=re_xxx
> supabase secrets set OUTBOX_FROM="FacilityPro <notifications@yourdomain.com>"
> ```
>
> Then schedule it (Dashboard → Edge Functions → Schedules, e.g. every 5 minutes) so the outbox drains. Each user opts in under **Security → Email notifications**. The provider call is isolated in one `sendEmail()` function, so SMTP/SES/Postmark — or SMS/push as new channels — drop in without touching the queue.
>
> **SMS (optional).** The same function sends SMS via Twilio when a row's channel is `sms`. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` secrets; users add a mobile number and opt in under **Security → Text messages**.

> **Offline behaviour.** No setup needed. The app registers `public/sw.js` to cache its shell, and field writes (work-order status, checklist completion, parts used, meter readings) are stored in IndexedDB when offline and replayed in order when the connection returns. The header shows a "to sync" indicator with a manual retry. Reads fall back to whatever React Query has cached; brand-new data isn't available offline.

> **Web push (optional).** Generate a VAPID keypair (`npx web-push generate-vapid-keys`). Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` as Edge Function secrets, and expose the public key to the web app as `VITE_VAPID_PUBLIC_KEY` (in `.env`). Users then see **Security → Push notifications** and can enable it per device; push rides the same outbox/Edge Function as email and SMS.

> **Inbox / channels (optional).** The inbox works immediately for manually logged conversations and outbound replies. To connect automated channels, deploy `channel-webhook` (inbound) and `channel-send` (outbound) and point your WhatsApp Cloud API / Zalo / LINE webhook at `channel-webhook`. Each function documents its secrets at the top; the WhatsApp Cloud API shape is implemented and the others slot in alongside it.

> **Billing (PayPal links).** Migration 0022 seeds three editable plans. As an org admin, open **Billing**, click the pencil on a plan, and paste its **PayPal payment link** (a PayPal.me link, a payment link, or a subscription link) plus price and limits. The plan's **Subscribe** button then opens that link in PayPal; once a customer has paid, an admin clicks **Mark active** to set the plan and period. No webhook is needed for this paste-a-link flow. To automate activation later, add a PayPal Subscriptions webhook (or, for Vietnam, a VietQR `bank-webhook` reconciled by SePay/Casso) that updates `fp_subscriptions` — the data model already supports it.

> **Automation (0023).** Two org switches under **Settings → Automation** (admin): *Allow public fault reports* exposes a public report page and shows the link to share (asset QR codes already point at it), and *Auto-create work orders* turns each new report straight into a work order. Public reporting is anonymous but locked down — the only anon entry points are two SECURITY DEFINER functions that refuse any org which hasn't switched it on. Two scheduled jobs round it out; enable them once with pg_cron:
>
> ```
> select cron.schedule('fp-escalate', '0 * * * *', $$ select fp_escalate_overdue(); $$);
> select cron.schedule('fp-expiry',   '0 7 * * *', $$ select fp_send_expiry_reminders(); $$);
> ```
>
> Escalation and reminders post in-app notifications, which fan out to email/SMS/push for anyone opted in. (0023 also revokes the cron functions from `anon` so they can't be triggered publicly.)

> **IoT devices (0024).** Open **Devices**, add a device, and copy its **key** plus the ready-made `curl` examples from the device page. There are two ways in: a device can POST directly to `…/rest/v1/rpc/fp_device_ingest` (anon apikey + its device key), or to the `iot-ingest` Edge Function, which accepts single, batch, or flat MQTT-style JSON. For **MQTT**, run a broker (EMQX, HiveMQ Cloud, AWS IoT Core, Mosquitto) and point its rule/webhook at `iot-ingest` — the device key travels in the `x-device-key` header or the body. The endpoint is vendor-neutral: anything that can send `{metric, value}` works (ESP32/ESP8266 with Tasmota or ESPHome, Shelly, Sonoff, Raspberry Pi, Modbus/PLC→MQTT gateways, LoRaWAN gateways like Dragino/Milesight via their network server). Map a device to a meter to feed meter-based PM from live data, and add **threshold rules** to auto-raise work orders / notifications (with a per-rule cooldown). Deploy the function with `supabase functions deploy iot-ingest --no-verify-jwt`.

## 3. Configure environment variables

```powershell
Copy-Item .env.example .env.local
```

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

## 4. Install and run

```powershell
npm install
npm run dev
```

Open http://localhost:5173

### First-run path (the Phase 1 exit criterion)

1. Sign up → create your organisation.
2. Build a location or two under **Locations**.
3. Go to **Settings** → add a couple of **fault types** and **asset types** (bilingual names).
4. **Assets** → add an asset (pick a type + location). Open it → **QR** tab → that QR points at a prefilled fault form.
5. Switch the app to **VI** (top-right). Go to **Requests → New**, file a fault **in Vietnamese**, attach a photo.
6. Open the request → **convert to work order** → assign a technician.
7. As the technician (**My Work** / work-order detail) → set **In progress**, add a **before** photo, then an **after** photo, mark **Resolved**.
8. The **Dashboard** counts update; the **asset's history** shows the whole trail.

## 5. Build for production

```powershell
npm run build
```

Deploy `dist/` to Hostinger (cPanel/FTP) or Vercel. The SPA `.htaccess` and PWA `manifest.webmanifest` ship inside `dist/` automatically.
**Reminder:** rebuild before every upload and clear the browser cache after deploying.

---

## How the multilingual layers work

- **UI strings** → `public/locales/{en,vi}/{namespace}.json` (namespaces: common, auth, locations, settings, assets, requests, workorders).
- **User-created content** (fault/asset type names, location names) → JSONB `{"en":…,"vi":…}`, resolved at read time via `resolveI18n()`.
- **Inbound fault text** → stored verbatim with `source_lng`; on-demand translation for staff is a Tier-3 item.

## Project structure (Phase 1 additions in **bold**)

```
supabase/migrations/   0001–0011 foundation→PM, **0012 parts**, **0013 meters (+meter PM)**, **0014 vendors/contracts**, **0015 SLA+auto-assign**, **0016 notifications**, **0017 email channel**, **0018 approvals**, **0019 SMS channel**, **0020 web push**, **0021 inbox**, **0022 billing**, **0023 automation workflows**, **0024 IoT**
supabase/functions/     process-outbox (email/SMS/push), channel-webhook (inbound), channel-send (outbound), iot-ingest (device telemetry)
public/sw.js            app-shell service worker (offline)
src/lib/sync.ts         offline write queue + replay; src/contexts/SyncContext.tsx
src/lib/               supabase, database.types, **ui** (status/colour maps), **media** (upload/signed URLs), **queries** (TanStack hooks)
src/components/ui/      Button, Input, **Pill**, **Select**, **BilingualName**
src/pages/             SignIn, SignUp, Onboarding, AcceptInvite, Dashboard, Locations,
                       **Settings, Assets, AssetDetail, Requests, NewRequest,
                       RequestDetail, WorkOrders, WorkOrderDetail, MyWork**
```

## Notes

- Production bundle is ~587 kB (165 kB gzipped). When the app grows, code-split by route with dynamic `import()`.
- Offline sync for the technician PWA is a Phase 2 item; the app is installable now but expects connectivity.
