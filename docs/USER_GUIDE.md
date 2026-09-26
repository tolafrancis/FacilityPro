# User guide, Help Center, tour and demo data

This document explains how FacilityPro's in-app help is built and how to regenerate it.

## What users see

| Piece | Where | Source |
| --- | --- | --- |
| **Help Center** | Menu → *User guide* (`/help`) | `src/pages/HelpCenter.tsx` |
| **User guide**, 14 sections | `/help/guide/<id>` | `src/help/content/*.md`, indexed in `src/help/guide.ts` |
| **Feature directory** (50 features) | `/help/features` | `src/help/features.ts` |
| **Role quick-starts** (Administrator, Manager, Technician, Occupant, Vendor) | `/help/quick-start/<role>` | `src/help/content/qs-*.md` |
| **Known issues** | `/help/known-issues` | `src/help/content/known-issues.md` |
| **"? Help" panel** on every important page | Top bar → *Help* | `src/components/help/HelpButton.tsx`, texts in `src/help/pageHelpData.ts` |
| **Guided tour** | Starts itself on the first visit to the home screen; restart from *Help → Take the tour* | `src/components/help/ProductTour.tsx`, steps in `src/help/tour.ts` |
| **Screenshots** with numbered markers ①②③ | `public/help/screens/*.webp` (+ `manifest.json` with each image's legend) | captured from the running app |
| **DEMO DATA banner** | Any organisation with `settings.demo = true` | `src/components/AppShell.tsx` |

One search box (`src/lib/helpSearch.ts`) covers the guide (split per `##` section), the quick-starts, the known issues and the feature directory. It ignores Vietnamese accents.

### Tour behaviour

- It starts by itself once, on `/`, for people who haven't finished or dismissed the current `TOUR_VERSION` (`src/lib/tour.ts`).
- The buttons are **Next**, **Previous**, **Skip tour** and **Finish**; the arrow keys and Esc also work.
- **Skip** hides it for the rest of the browser session.
- **Don't show this tour again**, or finishing it, stores `{version, done|dismissed}` per user in two places:
  - the account's `user_metadata.fp_tour`, so it follows the user to other devices;
  - `localStorage` under `fp.tour.<userId>`.
- Steps depend on the role: 9 for staff, 8 for technicians, 7 for occupants. A step whose target isn't visible (for example the side menu on a phone) is shown in the centre instead.
- To show the tour to everyone again after a big UI change, raise `TOUR_VERSION`.

### Keeping the help accurate

`src/help/pageHelp.test.ts` fails the build if:

- a link inside the guide, a page-help entry or a feature points at a guide section or `#heading` that doesn't exist;
- a referenced screenshot file is missing;
- a feature's *Related* id doesn't exist;
- a main page has no "? Help" entry.

## Demo organisation — "Harbourview Properties (Demo)"

`supabase/seed/tenant_demo.sql` creates one fully populated, **fictional** organisation. Every person uses a `@harbourview-demo.test` address, and every company, place and number is invented. It contains:

- 3 sites, 38 locations and 24 assets with specifications, plus meters and readings;
- 11 PM schedules (calendar and meter-based) with checklists and parts kits;
- 84 work orders: 14 current ones telling a story, plus 70 historical ones spread over six months, with labour, parts, checklist results and an approval;
- requests from several channels;
- 15 parts, 3 of them low on stock, with their stock movements;
- 7 vendors with contracts (one expiring soon) and licences (one expired);
- purchase orders with a receipt, invoices, payments, budgets, cost centers and expenditures;
- documents, desks, facilities and bookings, permits, attendance, surveys and announcements;
- workflows: five routing rules, a reminder and a low-stock email;
- inbox conversations and notifications;
- IoT: a gateway and 9 devices (one offline) with 7 days of 30-minute readings, rules and alerts.

Dates are relative to when you run it, so the demo always looks current.

The seed is for local, staging or dedicated demo databases only, never production. It refuses to run unless you opt in:

```sql
set fp.allow_demo_seed = 'yes';
-- optional: make an existing (signed-up) account the demo's administrator
set fp.demo_owner_email = 'you@example.com';
\i supabase/seed/tenant_demo.sql
```

Remove it with `supabase/seed/tenant_demo_remove.sql`, under the same opt-in.

## Regenerating screenshots and re-validating

The scripts in `scripts/help/` drive the built app against a local database seeded with the demo. You need:

- Postgres with all migrations and the demo seed loaded;
- PostgREST;
- a small proxy on `:54321` that stands in for Supabase auth;
- a build with `VITE_SUPABASE_URL=http://127.0.0.1:54321`.

The scripts:

- `node scripts/help/run.cjs shots` — captures every screenshot into `public/help/screens/` as WebP, with numbered markers drawn on the real elements, and writes `manifest.json` with each image's legend.
- `node scripts/help/run.cjs crawl` — opens every page as each of the 5 roles and reports console errors, failed API calls and error screens.
- `node scripts/help/run.cjs workflows` — performs the documented workflows end to end through the UI and checks the database after each step.
- `node scripts/help/run.cjs help` — tests the tour, the "? Help" panel on 29 pages, and the Help Center (search, links, anchors, screenshots, phone layout).

The latest results are in `docs/USER_GUIDE_VALIDATION.md`.
