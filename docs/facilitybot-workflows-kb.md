# FacilityBot — Workflows Knowledge Base (Analysis & Reference)

> Source root: `https://blog.facilitybot.co/blog/knowledge-base/manager-web-portal/workflows/`
> Individual articles fetched from `blog.facilitybot.co/blog/knowledge-base/workflows/...`.
>
> **Precision note:** FacilityBot's KB articles are written as task walkthroughs, not as a data‑model spec. The overview page ("Automating Workflows") and the "Configuring New & Existing Workflows" page are thin and do **not** enumerate the full trigger/operator/action catalog. The model in Section A is therefore **reconstructed by aggregating the concrete dropdown labels and fields shown across all 15+ individual articles**. Items that could not be confirmed verbatim are marked *(implied)*.

This document is the reference used to align FacilitySpace's **Create workflow** form (`src/pages/Workflows.tsx`) and its template gallery with FacilityBot's vocabulary.

---

## (A) Workflow Data Model Overview

### A.1 General concept

FacilityBot describes workflows as an **"if‑then sentence constructor with dropdown selections."** Each workflow is:

> **IF** an *Event* occurs (optionally narrowed by *Conditions / attributes*) **THEN** perform one or more *Actions*.

The KB calls the builder the **"creator."**

### A.2 Access path (consistent across every article)

1. Log in to the **FacilityBot Manager Portal**.
2. Open the **Features** menu (bottom‑left icons) → select **Workflows**.
3. Click **+ New Workflow** (upper right).
4. Build the workflow in the **creator** using the dropdowns.
5. Click **Save** (upper right).

### A.3 Create‑workflow form structure

| Section | Purpose | Notes |
|---|---|---|
| **Workflow Name** | Free‑text name/title | Per "Configuring" article |
| **Event** (trigger) | Dropdown selecting the triggering event | The "IF" |
| **Trigger config** | Event‑specific fields (meter, sensor, asset field, zone, SOR, request/fault type) | Appears dynamically based on Event |
| **Conditions / Attributes** | "Add another condition" via an **attribute selector**; multiple conditions; multi‑select for types | Narrows the trigger |
| **Actions** | Dropdown selecting the action(s) | The "THEN" |
| **Action config** | Action‑specific fields (recipient email via **+ Add**, account to alert, request type/description/location tag, survey, responder) | Appears dynamically based on Action |
| **Save** | Persists the workflow | Upper‑right button |

### A.4 Event (trigger) catalog — aggregated

| Event (dropdown label) | Trigger config fields | Used by |
|---|---|---|
| **Service Request** | Request type (multi‑select); attribute conditions | Auto‑assign, pending reminder, survey |
| **Fault Report** | Fault Report Type (multi‑select); attribute conditions | Auto‑assign, pending reminder, survey |
| **Asset Field** | Select asset field (e.g. **Warranty Expiry Date**, purchase date); days threshold | Asset useful life, warranty expiry |
| **Chat With Staff** | (none) — fires when a requestor sends/clicks "Chat With Staff" | Chat‑with‑staff email |
| **Low Sentiment** | (none) — fires from AI Automated Sentiment Analysis on requestor text | Low‑sentiment email |
| **Expenditure Budget Exceeded** | Cost centre / location tag; budget type (monthly / annual / total); budget amount | Budget‑exceeded email |
| **Parts Quantity** | Select the part; threshold quantity | Parts low‑stock email |
| **Desk Booking** | Zone selection | Desk booking alert |
| **Sensor Integration** | Select sensor; Trigger Condition (operator + numeric value) | Sensor‑triggered ticket/email/alert |
| **Meter Reading** | Select meter; trigger threshold value | Meter→ticket, meter→email |
| **Service from Schedule of Rate (SOR) Submitted** | Name menu: select the SOR | SOR→expenditure request |
| **Facilities Booking** *(related article)* | Facility/booking selection | Booking alerts |
| **Expenditure Approval Needed** *(related article, implied)* | Cost centre / approval routing | Approval emails |

### A.5 Conditions — operators & attributes (aggregated)

FacilityBot does not publish a master operator list. Confirmed mechanics:

- **Attribute selector** — "add another condition to this workflow" (multiple conditions, multi‑select of types).
- **Attributes / fields:** **Has Been Pending** (duration in minutes), **Is complete** (boolean), **Priority**, **location tags**, request/fault **Type**.
- **Operators / comparisons:**
  - **Falls below** (numeric) — Parts Quantity.
  - **Exceeds / greater than** (numeric threshold) — Meter Reading.
  - **Greater than or equal to (≥)** — Sensor Integration ("Score greater than or equal to 3").
  - **Has been pending for N minutes** (time elapsed) — Service Request / Fault Report.
  - **Is complete = true** (boolean) — survey trigger.
- AND/OR/NOT boolean combinators are **not explicitly documented**; conditions appear additive ("add another condition").

### A.6 Action catalog — aggregated

| Action (dropdown label) | Config fields | Used by |
|---|---|---|
| **Send Email / Send Email To** | Recipient email address(es) via **+ Add** (multiple). No subject/body template documented — content is system‑generated. | Most email workflows |
| **Assign To** | Responder(s); optional availability constraint ("only if responder is available"); optional site check‑in requirement | Auto‑assign workflows |
| **Create Request / Create New Requests** | Request type; request description; location tag | Sensor, meter‑reading ticket |
| **Alert Account** | Account selection | Sensor, desk booking |
| **Send Survey to Requestor** | Survey selection; delivered via messaging platform | Survey after completion |
| **Create Expenditure Request** | (no extra config documented) | SOR responses |
| **Send Approval Email** *(related article, implied)* | Approver recipient | Approval emails |

---

## (B) Per‑Article Breakdown

### B1. Allow Auto Assignment of Requests Based on Availability Status
- **Event:** Service Request **or** Fault Report → pick the specific request/fault type.
- **Conditions:** Responder **availability status** ("assign only if available"); optional **site check‑in** restriction.
- **Action:** **Assign To** → responder(s); toggle availability / site check‑in.

### B2. Automate Sending of Email Based on Asset Useful Life
- **Event:** **Asset Field** → select the field; enter **number of days since purchase date**.
- **Conditions:** Time‑based (days elapsed since purchase date).
- **Action:** **Send Email** → recipient(s). *(Test: set asset purchase date under Features → Assets.)*

### B3. Automatically Send Email When Asset Warranty Expiry Date Is Near
- **Event:** **Asset Field** → field = **Warranty Expiry Date**; enter **number of days before expiry**.
- **Conditions:** Proximity to warranty expiry (days threshold).
- **Action:** **Send Email** → recipient(s).

### B4. Automatically Send an Email Reminder if Request Has Been Pending for Some Time
- **Event:** Service Request **or** Fault Report → specific type.
- **Conditions:** Attribute = **Has Been Pending** → **duration in minutes**.
- **Action:** **Send Email To** → recipient(s) via **+ Add**.

### B5. Automatically Send an Email when Requestors ask to "Chat with Staff"
- **Event:** **Chat With Staff** (requestor clicks/types "Chat With Staff" in a messaging channel, e.g. Telegram).
- **Conditions:** None — fires unconditionally.
- **Action:** **Send Email** → recipient.

### B6. Automatically Send Emails when an Expenditure Budget is Exceeded
- **Event:** **Expenditure Budget Exceeded** → cost centre / location tag; **budget type** (monthly / annual / total); **budget amount**.
- **Conditions:** Spend > configured budget for the selected cost centre/location.
- **Action:** **Send Email** → recipient(s). *(Test: create an expenditure over the limit.)*

### B7. Automatically Send an Email if a Requestor's Sentiment is Low
- **Event:** **Low Sentiment** (AI Automated Sentiment Analysis; example "Your service is bad").
- **Conditions:** Negative sentiment auto‑detected (threshold not disclosed).
- **Action:** **Send Email** → recipient (service‑recovery alert).

### B8. Automate Sending of Email When Parts Quantity Falls Below Select Amount
- **Event:** **Parts Quantity** → select the part; define **threshold quantity**.
- **Conditions:** Quantity **falls below** threshold (example "below 30").
- **Action:** **Send Email** → recipient(s). *(Test: Features → Parts → Update Quantity.)*

### B9. Automatically Send an Alert when Desk Booking Is Made
- **Event:** **Desk Booking** → select **Zone**.
- **Conditions:** None beyond zone selection.
- **Action:** **Alert Account** (notify a selected account) **or** **Send Email**. *(Test: create a booking via Features → Desks.)*

### B10. Automatically Create a Request Ticket, Send an Email, or Alert an Account When a Sensor Is Triggered
- **Event:** **Sensor Integration** → select the sensor.
- **Conditions:** **Trigger Condition** = operator + numeric threshold (example "Score ≥ 3"); supports JSON test data.
- **Actions (selectable):** **Create Request** (type, location tag, description) / **Alert Account** / **Send Email To**. *(Test: Integrations → Sensors → Send Test Data in JSON.)*

### B11. Automatically Create a New Request Ticket when a Meter Reading Exceeds a Threshold
- **Event:** **Meter Reading** → select meter; set **trigger threshold**.
- **Conditions:** Meter value **exceeds** the numeric threshold.
- **Action:** **Create New Requests** → request type; request description.

### B12. Automate Send an Email when Meter Reading Exceeds a Threshold
- **Event:** **Meter Reading** → select meter; set **trigger value**.
- **Conditions:** Reading surpasses the configured value.
- **Action:** **Send Email To** → recipient(s).

### B13. Automating Workflows (overview / main)
- High‑level. Describes workflows as an **"if‑then sentence constructor with dropdown selections."** Lists five automation categories: (1) assignment of fault reports/service requests, (2) survey after request completion, (3) alerts after a common facility is booked, (4) creation of expenditure requests for SOR responses, (5) sending of expenditure approval emails.
- Does **not** enumerate the full trigger/operator/action catalog — those come from the individual articles (Section A).

### B14. Automate Sending of Survey after Request Completion
- **Event:** Service Request / Fault Report → select request/fault type.
- **Conditions:** Attribute = **Is complete** (boolean — marked complete).
- **Action:** **Send Survey to Requestor** → select survey; delivered via messaging platform.

### B15. Automate Creation of Expenditure Requests for Schedule of Rates Responses
- **Event:** **Service from Schedule of Rate (SOR) Submitted** → from the **Name** menu, select the SOR.
- **Conditions:** None documented; fires whenever a vendor submits a quote response from the selected SOR.
- **Action:** **Create Expenditure Request**. Result: an expenditure request auto‑appears under Expenditures for review/approval.

---

## (C) Consolidated Trigger → Action Mapping

| # | Workflow | Trigger (Event) | Key Condition | Action(s) |
|---|---|---|---|---|
| 1 | Auto Assignment Based on Availability Status | Service Request / Fault Report | Responder available; (opt.) site check‑in | **Assign To** responder |
| 2 | Email Based on Asset Useful Life | Asset Field | Days since purchase date | **Send Email** |
| 3 | Email When Warranty Expiry Near | Asset Field (Warranty Expiry Date) | Days before expiry | **Send Email** |
| 4 | Email Reminder if Request Pending | Service Request / Fault Report | Has Been Pending ≥ N minutes | **Send Email To** |
| 5 | Email when "Chat with Staff" | Chat With Staff | (none) | **Send Email** |
| 6 | Emails when Expenditure Budget Exceeded | Expenditure Budget Exceeded | Spend > budget (monthly/annual/total) | **Send Email** |
| 7 | Email if Requestor Sentiment is Low | Low Sentiment (AI) | Negative sentiment detected | **Send Email** |
| 8 | Email when Parts Quantity Below Amount | Parts Quantity | Quantity falls below threshold | **Send Email** |
| 9 | Alert when Desk Booking Made | Desk Booking (Zone) | (none) | **Alert Account** / **Send Email** |
| 10 | Ticket/Email/Alert when Sensor Triggered | Sensor Integration | Trigger Condition ≥ value | **Create Request** / **Alert Account** / **Send Email To** |
| 11 | New Ticket when Meter Exceeds Threshold | Meter Reading | Reading exceeds threshold | **Create New Requests** |
| 12 | Email when Meter Exceeds Threshold | Meter Reading | Reading exceeds trigger value | **Send Email To** |
| 13 | Automating Workflows (overview) | — | — | (overview only) |
| 14 | Survey after Request Completion | Service Request / Fault Report | Is complete | **Send Survey to Requestor** |
| 15 | Expenditure Requests for SOR Responses | Service from Schedule of Rate (SOR) Submitted | SOR quote submitted | **Create Expenditure Request** |

---

## (D) How FacilitySpace Maps to This

FacilitySpace's workflow engine (`supabase/migrations/0028_workflow_engine.sql`) stores `trigger_type text`, `conditions jsonb`, `actions jsonb` — flexible enough to represent the full FacilityBot model. The **Create workflow** form in `src/pages/Workflows.tsx` adopts FacilityBot's vocabulary:

**Events (trigger_type):** `service_request`, `fault_report`, `asset_field`, `chat_with_staff`, `low_sentiment`, `expenditure_budget_exceeded`, `parts_quantity`, `desk_booking`, `facilities_booking`, `sensor_integration`, `meter_reading`, `sor_submitted`, `expenditure_approval`.

**Condition fields:** `priority`, `type`, `location_tag`, `has_been_pending`, `is_complete`, `days_since_purchase`, `days_before_expiry`, `quantity`, `meter_value`, `sensor_score`, `budget_amount`, `zone`.

**Operators:** `equals`, `not`, `contains`, `in`, `exceeds` (>), `gte` (≥), `falls_below` (<), `pending_for` (N minutes), `is_true`.

**Actions:** `send_email`, `assign`, `create_request`, `alert_account`, `send_survey`, `create_expenditure`, `send_approval_email`.

All 15 FacilityBot workflows ship as installable templates in the template gallery.

### Entity pickers
The Create workflow form uses **context-aware entity pickers** (mirroring the Settings auto-assignment rule builder) rather than free text:
- **Action target** adapts to the action: members (Send Email / Assign / Alert / Approval), fault types (Create Request), or **surveys** (Send Survey to Requestor).
- **Condition value** adapts to the field: priority list, fault types, locations, true/false, or numeric inputs.

**Surveys** are a first-class entity (`fp_surveys`, see migration `0029_surveys.sql` and the **Surveys** page) — matching FacilityBot, where "Survey Name" is populated from the dedicated Surveys feature. A survey holds a name and a list of feedback questions, distinct from a maintenance checklist.

**Desks** are a first-class entity (`fp_desks` + `fp_desk_bookings`, see migration `0031_desks.sql` and the **Desks** page). Desks are grouped by zone (an `fp_locations` row of kind `zone`); a booking records who reserved a desk and when — backing the "Alert when Desk Booking Is Made" workflow.

**Facilities** are a first-class entity (`fp_facilities` + `fp_facility_bookings`, see migration `0032_facilities.sql` and the **Facilities** page). A facility optionally belongs to a location and has a capacity; a booking records who reserved it and when — backing the "Alert after Facilities Booking" workflow. The workflow `facility` condition reads these via `useFacilities`.

**Finance entities are now wired into the workflow form.** The condition value reads real records via `useRates` / `useBudgets` (and zones via `useLocations`):
- `schedule_of_rate` → **Schedule of Rate** picker (`fp_finance_rates`) — for the SOR-submitted workflow.
- `cost_centre` → **Cost Centre / Budget** picker (`fp_finance_budgets`) — for the budget-exceeded workflow.
- `zone` → **Zone** picker (`fp_locations` of kind `zone`) — for the desk-booking workflow.

### Gaps / future work
- **Email subject/body:** FacilityBot exposes only recipients (content system‑generated); FacilitySpace stores a recipient in the action `target` plus an optional free‑text message in `value`. A richer email template editor is future work.
- **Multiple conditions / multiple actions:** the current form supports a single condition and a single action. FacilityBot's "+ Add condition" and multi‑action support are future enhancements.
- **Remaining backing entities:** Every entity referenced by the 15 workflows now has a table and (where the form needs it) an entity picker. The only FacilityBot Feature still without a table is **Visitors**, which no workflow uses. Assets, meters, and sensors/devices have tables but are still represented as numeric/free-text in the workflow form; bind them to entity pickers when needed.
### Execution (wired in `0033_workflow_execution.sql`)
`fp_run_workflows()` now evaluates conditions and executes actions, and domain events are connected to it via AFTER triggers:

| Event source | Trigger fired | Context provided |
|---|---|---|
| `fp_requests` insert | `service_request` (is_complete=false) | priority, type, location_tag, status |
| `fp_requests` → resolved/closed | `service_request` (is_complete=true) | priority, type, location_tag, status |
| `fp_meter_readings` insert | `meter_reading` | meter_value, meter |
| `fp_parts` stock decrease | `parts_quantity` | quantity, part |
| `fp_desk_bookings` insert | `desk_booking` | zone, desk, booker |
| `fp_facility_bookings` insert | `facilities_booking` | facility, location, booker |
| `fp_finance_expenditures` insert | `expenditure_budget_exceeded` | budget_amount, category |

**Condition evaluation** (`fp_eval_condition`) supports equals/not/contains/in/exceeds/gte/falls_below/pending_for/is_true against the event context (AND logic). **Actions** (`fp_run_workflow_action`): `create_request` and `create_expenditure` insert real rows; `send_email` / `send_approval_email` / `alert_account` / `assign` / `send_survey` write an in-app `fp_notifications` row (resolving the target to a user_id / email / admins+managers). Every run is recorded in `fp_workflow_runs` (success / skipped / failed) and surfaced in the Workflows page run history.

Safeguards: a transaction-local `fp.in_workflow` guard prevents workflow-created rows from re-triggering workflows, and each workflow's actions run in an isolated sub-block so a failing action records on the run without rolling back the user's original operation.

### Email delivery (wired in `0034_workflow_delivery_and_scheduler.sql`)
Workflow `send_email` / `send_approval_email` actions now reach the chosen address:
- If the action target is an **email address** (member or external), it is enqueued directly into `fp_notification_outbox` (channel `email`).
- If the target is a **user_id / blank**, an in-app notification is written, which the `0017` `fp_enqueue_email` trigger turns into an outbox email when that user has opted in.

Delivery itself is the existing **`supabase/functions/process-outbox`** Edge Function (Resend), scheduled per its header docs. So end-to-end email now works once `RESEND_API_KEY` / `OUTBOX_FROM` secrets are set and process-outbox is scheduled.

### Scheduler for time-based triggers (wired in `0034`)
`fp_run_scheduled_workflows()` fires triggers that have no source event, deduping per (workflow, entity) via `fp_workflow_runs.trigger_ref`:

| Condition field | Trigger | Fires when |
|---|---|---|
| `has_been_pending` (pending_for) | `service_request` / `fault_report` | request still open past N minutes |
| `days_since_purchase` | `asset_field` | `current_date − purchase_date ≥ N` (useful life) |
| `days_before_expiry` | `asset_field` | `warranty_expiry − current_date ≤ N` (warranty near) |

Run it on a schedule via `pg_cron` (`select fp_run_scheduled_workflows();`) or the deployable **`supabase/functions/run-scheduled-workflows`** Edge Function (see its header for cron/schedule options).

### Engine v2 (wired in `0035_workflow_engine_v2.sql`)
- **Org-scoped engine:** `fp_run_workflows(p_org, …)` only runs the firing org's workflows (fixes cross-tenant firing).
- **AND / OR conditions:** `fp_eval_condition` honours `conditions.logic` (`and` | `or`); the form lets you add multiple conditions and choose Match ALL / ANY, plus multiple actions.
- **Accurate budget-exceeded:** `fp_wf_on_expenditure` sums real spend per `fp_finance_budgets` row for its period (monthly/annual/quarterly/total) and fires once per budget per period (deduped on `trigger_ref`).
- **SMS / push actions:** `send_sms` (phone target) and `send_push` (member target) enqueue `sms`/`push` rows in `fp_notification_outbox` (delivered by process-outbox).
- **External triggers:** approval-needed (`fp_approvals` insert) and chat-with-staff (`fp_conversations` insert) fire via DB triggers; `low_sentiment` / `sor_submitted` and any custom event can be emitted from app/integration code via the `fp_emit_workflow_event(p_org, trigger, ref, context)` RPC.

### Event sources wired (in `0036_workflow_event_sources.sql`)
- **sensor_integration:** emitted from `fp_device_ingest` on every reading with a value (context `sensor_score`, `metric`, `device`) — covers both the `iot-ingest` Edge Function and direct device RPC. Run rows are only created when the org has an active sensor workflow.
- **low_sentiment:** DB trigger on inbound `fp_messages` using a negative-keyword heuristic (placeholder). A real AI pass should instead call `fp_emit_workflow_event(org, 'low_sentiment', ref, '{"sentiment":"low"}')`.
- **sor_submitted:** DB trigger on `fp_finance_procurement` insert (a quote/RFQ against the rate schedule), context `service`/`vendor`/`amount`.

Every one of the 15 KB workflows now has a live trigger path (event-driven, scheduled, or emitted).

### Polish (wired in `0037_workflow_polish.sql`)
- **Real AI sentiment:** `fp_messages` has `sentiment` / `sentiment_score`; the **`score-sentiment`** Edge Function classifies inbound messages with Claude (`claude-haiku-4-5-20251001`) and writes the score, and the DB emits `low_sentiment` when a message is marked `low` (replaces the keyword heuristic). Set `ANTHROPIC_API_KEY` and schedule the function.
- **Sensor / event cooldown:** `fp_workflows.cooldown_minutes` (exposed in the form) throttles event-driven firing — within the cooldown, `fp_run_workflows` skips the workflow without creating a run row. The sensor template ships a 15-minute cooldown.
- **Per-trigger config:** changing the Trigger pre-fills sensible default conditions and shows a contextual hint; the condition catalog gained **Device / Sensor** and **Meter** pickers (`useDevices` / `useMetersAll`) so sensor/meter workflows can be scoped to a specific entity.

### Trigger sub-form + email templating (wired in `0038_workflow_templating.sql`)
- **Trigger settings sub-form:** the Create-workflow form shows trigger-specific primary fields (e.g. meter + threshold, device + score, warranty days, pending minutes) right under the Trigger; these become the workflow's primary condition rules at save, with the generic **Additional filters** section for extra criteria.
- **Email subject/body templating:** email actions take a **Subject** and **Body** with `{{placeholders}}` (e.g. `{{priority}}`, `{{type}}`, `{{status}}`) filled from the event context at send time via `fp_render_template`; the same rendering applies to SMS/push/alert/create-request bodies. Unresolved placeholders are stripped.

The workflow build is feature-complete against the FacilityBot reference; remaining items are purely optional product polish.
