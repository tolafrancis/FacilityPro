# FacilityPro: remaining production-readiness work

Status as of 2026-09-24, branch `claude/mobile-menu-visibility-xbq60v`. It tracks the production-readiness audit (71 findings). Every change is on this branch and has not yet been merged or deployed.

## Where things stand

| Severity | Total | Done | Left |
|---|---|---|---|
| Blocker | 8 | 8 | 0 |
| High | 24 | 24 | 0 |
| Medium | 30 | 29 | 1 (S1-M5 optional part, needs a business decision) |
| Low | 9 | 9 | 0 |

**Correction:** S1-B1 (plan limits) was missing from the first "security blockers" commit, even though it was reported as done. It was implemented later, in migration `0072`.

## Work items

### 1. S5-M1: hard-coded English strings (done)

Every file on the audit's list now has EN/VI translations in `public/locales/{en,vi}/`:

| Area | Namespace |
|---|---|
| Attendance, Tenant experience, Smart assistant, Desks and Facilities, Permits, Documents | `attendance`, `tenant`, `assistant`, `bookings`, `permits`, `documents` |
| Workflows | `workflows` |
| Financial and procurement (`ProcurementManager.tsx`) | `financial` |
| Settings | `settings` |
| Landing page | `landing` |
| Loading screen (`main.tsx`), crash screen (`ErrorBoundary.tsx`), toasts (`Toaster.tsx`) | `common` |

Conventions used, to keep in mind for new screens:
- Each component that renders text has its own `useTranslation(ns)`.
- Stored codes (statuses, trigger/action codes, budget periods) keep their stored value and are translated only for display, e.g. `t(\`status.${x}\`)`. A code containing a dot (`workorder.created`) is looked up with the dot replaced by `_`, because i18next reads `.` as nesting.
- Names from the database are resolved with `resolveI18n(x, lng)`, never `'en'`.
- Text the app writes to the database on the user's behalf (generated workflow names, installed templates, default email text) is written in that user's language. `{{placeholders}}` for the workflow engine are passed through as values so i18next leaves them alone.
- The loading and crash screens use `useSuspense: false`, because they render while translations are still loading or after loading failed.
- `npm run check:i18n` fails when a key is missing in either language. It runs in CI.

### 2. S1-M5 (open: optional, needs a business decision)

Approvals are now restricted: only the assignee or a manager can request one (migration `0071`).

Not done: blocking the `in_progress` transition while an approval is pending. The audit marked this as needed only "if the business needs that". To add it, extend `fp_wo_lifecycle` with a check against `fp_approvals` where `status = 'pending'`.

## Verification limits

- Edge Functions (`supabase/functions/*`) could not be type-checked in the build environment. The network blocked `esm.sh` imports for `deno check`. Only `_shared/scheduler-auth.ts` was checked and unit-tested. Deploy to staging and exercise each function before production.
- Database behaviour is covered by `supabase/security-tests/` (297 checks as of `0075`). CI (`.github/workflows/ci.yml`) runs them, plus the web build and the translation check, on every push.
- UI flows were checked in Chromium against a mocked backend, not a real Supabase project. The S5-M1 pages (Landing, Workflows, Settings, Financial) were smoke-tested this way in EN and VI, with a check for untranslated keys.

## Before going live (operator steps)

See `README.md` and `docs/OPERATIONS.md` for the details.

1. Apply migrations `0059`–`0075` in order, using `supabase db push`. Then run `scripts/check-drift.sh` against production.
2. Make yourself a platform admin: insert your user id into `fp_platform_admins`.
3. Enable `pg_cron` and `pg_net`. Store `project_url` and `service_role_key` in Vault.
4. Set the Edge Function secrets:
   - `RESEND_API_KEY`
   - `OUTBOX_FROM`
   - `APP_URL`
   - `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN`
   - `OPENAI_API_KEY` (optional)
   - `HEALTH_TOKEN`
   - `CRON_SECRET` (optional)
   - `TURNSTILE_SECRET_KEY` (optional)
5. Deploy the Edge Functions:
   - `process-outbox`
   - `run-scheduled-workflows`
   - `score-sentiment`
   - `channel-webhook`
   - `channel-send`
   - `smart-assistant`
   - `public-report`
   - `iot-ingest`
   - `health`
6. Set the web build environment:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_PUBLIC_APP_URL`
   - `VITE_TURNSTILE_SITE_KEY` (optional)
   - `VITE_SENTRY_DSN` (optional)
   - Remove any `VITE_OPENAI_API_KEY`.
7. Rotate the OpenAI key that used to be in the web bundle.
8. Supabase Auth settings:
   - custom SMTP through Resend;
   - the EN/VI templates in `supabase/templates/`;
   - Site URL and Redirect URLs (`https://<domain>/**`);
   - email confirmation turned on.
9. DNS on Hostinger: SPF, DKIM and DMARC records for the sending domain.
10. Backups:
    - turn on PITR (Pro plan);
    - schedule `scripts/backup-storage.mjs` to run daily;
    - do one test restore into staging.
11. Set up an uptime monitor on the `health` function URL.
12. Connect WhatsApp numbers in `fp_channel_accounts` (platform admin only).
