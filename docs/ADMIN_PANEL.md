# FacilityPro admin panel (`/admin`)

The platform owner's console: tenants, their users, plans and billing, support
tickets and the app itself. It lives in the main web app at `/admin`, as its own
code-split bundle (tenants never download it), and runs on the same Supabase
database as the product, so it manages the real tenants.

## Stack decisions

| Area | Choice | Why |
|---|---|---|
| Data & API | Supabase Postgres, row-level security, SQL functions (RPC) | Same data as the product; every permission is enforced in the database, not just the UI |
| Schema | SQL migrations in `supabase/migrations/` (0083+) | The project's existing migration system; no Prisma layer to keep in sync |
| Validation | Zod on every admin response and form (client); checks and `check` constraints in the database | Invalid input is refused where it matters, the database |
| UI | React + Vite + Tailwind + TanStack Query, lucide icons, hand-built SVG charts | The app's existing stack; no chart library needed |
| Billing | Stripe **and** PayPal, plus manual invoices | Provider ids on plans/subscriptions/invoices; checkout + webhooks come with the Billing module |
| Tests | Vitest (`npm test`) for permissions/formatting; SQL suites (`supabase/security-tests/`) for RLS and functions | |

## Folder structure

```
src/admin/
  AdminApp.tsx            routes + per-route permission guard (lazy-loaded)
  AdminContext.tsx        staff role (from the database), can(), theme (light/dark/auto)
  permissions.ts          roles × permissions (mirror of the SQL matrix)
  permissions.test.ts     unit tests; also checks the mirror matches the migration
  nav.ts                  menu: each item names the permission it needs
  components/
    AdminShell.tsx        collapsible sidebar, top bar (⌘K search, notifications, profile/theme)
    ui.tsx                PageHeader, Card, Skeleton, EmptyState, ErrorState, Badge
    charts.tsx            TimeSeriesChart (area/bar, crosshair tooltip, keyboard, table view), BarList
    DateRangePicker.tsx   presets + custom range, kept in the URL
  lib/
    queries.ts            data hooks (Zod-validated)
    format.ts             money, numbers, %, relative time, event labels (+ tests)
  pages/
    Overview.tsx          main dashboard
public/locales/{en,vi}/admin.json   all admin text, English and Vietnamese
supabase/migrations/0083_admin_platform.sql
supabase/security-tests/admin_platform.sql
```

Later modules add `src/admin/pages/<Module>.tsx`, their data hooks, and a
migration where they need new functions.

## Roles and permissions

Enforced by `fp_admin_can(permission)` in every policy and admin function; the UI
reads the same matrix (`fp_admin_permissions()`) to hide what a role can't use.

| Permission | Super admin | Admin | Support | Analyst |
|---|:-:|:-:|:-:|:-:|
| dashboard.view | ✓ | ✓ | ✓ | ✓ |
| tenants.view | ✓ | ✓ | ✓ | |
| tenants.manage (create, edit, suspend, delete, plan) | ✓ | ✓ | | |
| tenants.impersonate | ✓ | | ✓ | |
| users.view / users.manage | ✓ / ✓ | ✓ / ✓ | ✓ / – | |
| billing.view / billing.manage | ✓ / ✓ | | | |
| tickets.view / tickets.manage | ✓ / ✓ | ✓ / – | ✓ / ✓ | |
| reports.view | ✓ | ✓ | | ✓ |
| announcements.manage | ✓ | ✓ | | |
| audit.view | ✓ | ✓ | | |
| monitoring.view | ✓ | ✓ | | |
| platform.manage, security.manage, team.manage | ✓ | | | |

Staff accounts are rows in `fp_platform_admins (user_id, role, display_name,
disabled_at)`. A disabled account has no access.

## Database schema (0083)

- **Roles**: `fp_platform_admins.role`, `fp_admin_role_permissions(role)`, `fp_admin_role()`,
  `fp_admin_can(perm)`, `fp_admin_permissions()`.
- **Tenants** (`fp_organizations`): `suspended_at`, `suspended_reason`, `deleted_at` (soft delete),
  `contact_name/email/phone`, `address`, `currency`, `subdomain` (unique), `brand_color`, `last_active_at`.
  Tenants can't change these; staff with `tenants.view` can read every organisation.
- **Activity**: `fp_daily_activity (day, org_id, user_id)` for DAU/MAU, written once a day by the
  tenant app through `fp_record_activity(org)`.
- **Events** (`fp_platform_events`): sign-up, upgrade/downgrade, cancellation, reactivation, trial,
  payment failed/succeeded, suspended/unsuspended, deleted — written by triggers; the activity feed.
- **Billing**: `fp_plans` + yearly price, Stripe price ids, PayPal plan ids, feature list;
  `fp_subscriptions` + billing interval, provider customer/subscription ids, trial end, coupon,
  cancelled at; `fp_platform_invoices` (number, amount, status open/paid/failed/refunded/void,
  provider stripe/paypal/manual, attempts, refunds); `fp_coupons`.
- **Support**: `fp_support_tickets` (number, status, priority, assignee, SLA due, first response,
  solved) and `fp_ticket_messages` (with internal notes).
- **Platform**: `fp_feature_flags` (features and modules; global switch, rollout %),
  `fp_feature_flag_overrides` (per tenant), `fp_flag_enabled(key, org)`, `fp_org_flags(org)`;
  `fp_announcements` (all / plans / tenants); `fp_message_templates` (email/SMS, per language);
  `fp_platform_settings` (one row: app, languages, timezone, email sender, maintenance mode,
  mobile versions, admin security policy) and `fp_app_status()` (public: maintenance + versions).
- **Notes**: `fp_admin_notes` (internal notes per tenant).
- **Audit**: `fp_admin_audit (admin_id, action, target_type, target_id, org_id, ip, before, after, at)`,
  written by a trigger on every admin table; nobody can edit it.
- **Dashboard**: `fp_admin_overview(from, to)` returns KPIs, series (bucketed by day/week/month),
  plans, top tenants, activity and health in one call.

## Setup

1. Apply the migrations (0083 and later) as usual.
2. Make yourself a super admin (SQL editor):
   ```sql
   insert into fp_platform_admins (user_id, role)
   select id, 'super_admin' from auth.users where email = 'you@example.com';
   ```
3. Open `https://<your-domain>/admin`. Other staff are added from **Admin team**
   (or with the same insert and a role of `admin`, `support` or `analyst`).

No new environment variables are needed for the panel itself. Stripe and PayPal
keys are Edge Function secrets, added with the Billing module.

## Build status

| Module | Status |
|---|---|
| Foundation: schema, RBAC, layout, theme, toasts, skeletons | Done |
| 1. Main dashboard | Done |
| 2. Tenant management | Next |
| 3. Users · 4. Plans & billing (Stripe + PayPal) · 5. App management · 6. Support · 7. Analytics · 8. Audit & security · 9. Monitoring · 10. Admin team | Planned, schema in place |
| Demo seed data (20 tenants, 200 users, invoices, tickets, logs) | With tenant management, for local/staging only |
