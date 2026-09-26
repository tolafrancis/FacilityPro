# User guide — validation report

- **Date:** 26 September 2026.
- **Environment:** the built app (production build) against a local Postgres with every migration up to `0094`, loaded with the demo organisation *Harbourview Properties (Demo)* (`supabase/seed/tenant_demo.sql`).
- **Method:** real browser sessions (Chromium) signed in as each demo user. Every instruction in the guide was performed through the UI, and the database was checked after each step.
- **Re-run:** `node scripts/help/run.cjs crawl|workflows|help` (see `docs/USER_GUIDE.md`).

## Summary

| Check | Result |
| --- | --- |
| Every page opened as each role (Administrator, Manager, Technician, Occupant, Vendor) — 144 page loads | **144 / 144 OK**: no console errors, no failed API calls, no error screens |
| Documented workflows performed end to end through the UI | **29 / 29 passed** |
| Tour, "? Help" panel on 29 pages, Help Center (search, links, anchors, screenshots, feature directory, phone layout) | **56 / 56 passed** |
| Content integrity: every guide link and `#anchor` resolves, every screenshot exists, every related feature exists (`src/help/pageHelp.test.ts`) | **passed** |
| Unit tests (`npm test`) | **77 / 77 passed** |
| Database / security suites (`supabase/security-tests`) | **32 / 32 suites passed**, including the new `broadcast_drafts.sql` |
| Translations (`npm run check:i18n`) | **OK**: en, vi × 23 namespaces |

Screenshots: 58 WebP files (3.3 MB), captured from the running app. 28 of them carry 112 numbered markers placed on the real elements. The legend for each image is in `public/help/screens/manifest.json` and matches the numbered lists in the guide. The annotated images were reviewed one by one.

## Workflows performed (guide instruction → result)

1. **Occupant** reports a fault with summary, fault type, location and description → a request is created and shown under *My requests*. *(Work orders → Step 1)*
2. With **Auto-create work orders** on, the request becomes a work order, and the *Route: Water leaks → Kenji* workflow assigns it → status **Assigned**. *(Step 2, Workflows)*
3. **Manager** reassigns the work order and back → the assignee changes. *(Step 3)*
4. **Technician** sees it in *My work* and moves it to **In progress**. *(Step 4)*
5. The technician logs 2 × *Pipe coupling DN25* → stock falls from 40 to 38. *(Step 4, Inventory)*
6. The technician logs 40 minutes of labour → recorded. *(Step 4)*
7. **→ Resolved** without a completion code is refused, with the message shown in the guide. *(Step 5 warning)*
8. With the cause and completion code set, **→ Resolved** works, and the request follows (Resolved). *(Step 5)*
9. **Manager** moves it **→ Verified → Closed**. The cost equals labour plus parts. *(Step 6)*
10. **Generate due now** creates 2 preventive work orders and shows "2 work order(s) generated." *(Preventive maintenance)*
11. **Approve** the pending CT-01 motor approval → approved. *(Approvals)*
12. **Restock** *Run capacitor* by 10 → stock 0 → 10. *(Inventory)*
13. **Acknowledge** the car-park leak IoT alert on the device's Alerts tab → acknowledged. *(IoT)*
14. Bell → **Mark all read** → no unread notifications left. *(Notifications)*
15. **Settings → General** shows currency *VND* and saves. *(Settings)*
16. Locations show **Add site / building / floor / room / zone** as documented. *(Facilities)*
17. **Add asset** creates the asset. *(Assets)*
18. **New vendor** creates the vendor. *(Vendors)*
19. A received purchase order shows **24 / 24** received. *(Inventory → Purchase orders; this was broken before, see below)*
20. The tenant home shows published announcements and hides drafts. *(Notifications; this was broken before)*
21. The asset page shows manufacturer, model and specifications. *(Assets; added)*
22. **Export work orders (CSV)** downloads the file with all rows. *(Reports)*

The tour, contextual help and Help Center checks cover:

- The tour auto-starts once. Next, Previous, arrow keys, Skip and Finish all work, and Restart works from Help.
- Finishing, or ticking "Don't show again", is stored per user and holds in new tabs without affecting other users.
- The tour has 9 steps for staff, 8 for technicians and 7 for occupants, and fits a phone screen.
- The "? Help" panel shows the right text on 29 pages, and its guide link opens the right section and heading.
- Search finds results, including without accents, and shows a message when nothing matches.
- In-app cross-links and the "On this page" table of contents work.
- All screenshots in the 14 sections load.
- The feature directory's search, area filter, deep links, the fields of each entry (purpose, who, where, prerequisites, steps, related) and "Open this page" all work.
- All 5 quick-starts and the known-issues page render; an unknown page shows *Not found*.
- The Help Center pages don't scroll sideways on a phone, and there are no console errors.

## Problems found during testing and fixed

| # | Problem | Fix |
| --- | --- | --- |
| 1 | **Tenants could see draft announcements.** The tenant home listed unpublished broadcasts, and RLS let every member read drafts. | Migration `0094_broadcast_drafts.sql`: drafts are readable by admins and managers only. The tenant query also filters `is_published`. Test suite `broadcast_drafts.sql` (fails before, passes after). |
| 2 | **Purchase orders always showed 0 received.** Since `0059` added an org-aware FK, the receipt-lines embed was ambiguous and PostgREST refused it (PGRST201). "Received" stayed 0 / N and receiving could over-count. | The query names the FK (`fp_proc_rlines_receipt_org_fk`, confirmed present in production). |
| 3 | The asset page hid manufacturer, model, purchase date/cost and specifications. | They are now shown on the Details tab (EN/VI labels). The warranty is shown as a date. |
| 4 | Report amounts overflowed their cards (large VND values). | The amount column grows to fit. |
| 5 | Part unit cost was shown as a raw number (`185000`). | Formatted in the organisation's currency. |
| 6 | Tenant experience showed drafts without saying so. | A **Draft** label. |

## Feature requires attention (not fixed; listed in the in-app *Known issues*)

- **Vendor role** has technician-level access to all staff data, and there is no vendor-only portal.
- People are identified by **email address**; there is no display name.
- **Untranslated screens:** parts of Settings, Workflows, Financial, Tenant experience, Documents, Permits, Attendance, Desks, Facilities, fault-form dialogs and search lists are English only.
- **Help Center content is English**; the UI chrome is translated.
- **Approvals don't block** work-order progress.
- **Announcement audience** is a label only, not targeting.
- Some **dates are unformatted** (bookings, permits), and the **attendance card** layout breaks with long emails.
- Internal: the unused `useAssignmentRules` hook still reads the deprecated `fp_assignment_rules` table (0039 moved assignment into Workflows). It has no user impact.

## Not verified here (need outside services)

- Delivery of email, SMS and push; replies on Zalo and WhatsApp.
- AI features: Smart assistant, AI blog drafts, sentiment scoring.
- Payment checkout.
- Live IoT ingestion from real devices (the demo uses stored readings).

Their screens were opened and checked.

## Demo data

- **Safety:** the seed is refused unless `fp.allow_demo_seed = 'yes'`, runs in one transaction and refuses to load twice. It was **not** run against production.
- **Removal:** `tenant_demo_remove.sql` was tested; it leaves no orphan rows.
- **Consistency:** stock balances, work-order costs, statuses and timestamps are consistent, the same as the app's triggers would produce.
