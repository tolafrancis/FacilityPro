# FacilityPro: remaining production-readiness work

Status as of 2026-09-24, branch `claude/mobile-menu-visibility-xbq60v`. It tracks the production-readiness audit (71 findings). Every change is on this branch and has not yet been merged or deployed.

## Where things stand

| Severity | Total | Done | Left |
|---|---|---|---|
| Blocker | 8 | 8 | 0 |
| High | 24 | 24 | 0 |
| Medium | 30 | 28 | 2 (S5-M1 partly done, S1-M5 optional part) |
| Low | 9 | 9 | 0 |

**Correction:** S1-B1 (plan limits) was missing from the first "security blockers" commit, even though it was reported as done. It was implemented later, in migration `0072`.

## Left to do

### 1. S5-M1: hard-coded English strings (in progress)

**Done** (each page has a namespace in `public/locales/{en,vi}/`):
- Attendance (`attendance`)
- Tenant experience (`tenant`)
- Smart assistant (`assistant`)
- Desks and Facilities (`bookings`)
- Permits (`permits`)
- Documents (`documents`)

**Still English-only.** The last column is the rough number of candidate strings found by the scanner, including some false positives.

| File | Suggested namespace | Strings |
|---|---|---|
| `src/pages/Workflows.tsx` | `workflows` | ~126 |
| `src/pages/Financial.tsx` | `financial` | ~68 |
| `src/pages/Settings.tsx` | `settings` (exists) | ~63 |
| `src/pages/Landing.tsx` | `landing` | ~51 |
| `src/components/ProcurementManager.tsx` | `financial` | ~38 |
| `src/main.tsx` | `common` | loading fallback "Loading…" |
| `src/components/ErrorBoundary.tsx` | `common` | 2 strings, e.g. "Something went wrong." |
| `src/components/Toaster.tsx` | `common` | 1 string |

**How to do each file:**
1. Add `const { t } = useTranslation('<ns>')` to every component in the file that renders text. Dialogs and sub-panels need their own call.
2. Replace JSX text, `placeholder`, `title` and `aria-label` values, and `confirm`/`setMessage` strings.
3. Values stored in the database, such as status or action codes, keep their stored value. Translate them only for display, e.g. `t(\`status.${x}\`)`.
4. Use `resolveI18n(x, lng)`, not `'en'`.
5. Add the EN and VI keys, then run `npm run check:i18n`. It fails if a key is missing in either language.

**Finding the strings:** a scanner that lists candidate strings per file was used and could be recreated. It matched:
- JSX text between tags;
- `placeholder`, `title`, `aria-label`, `label` and `alt` attributes;
- string literals passed to `confirm`, `alert`, `prompt`, `setMessage`, `setError` and `notifyError`.

### 2. S1-M5 (optional, business decision)

Approvals are now restricted: only the assignee or a manager can request one (migration `0071`).

Not done: blocking the `in_progress` transition while an approval is pending. The audit marked this as needed only "if the business needs that". To add it, extend `fp_wo_lifecycle` with a check against `fp_approvals` where `status = 'pending'`.

## Verification limits

- Edge Functions (`supabase/functions/*`) could not be type-checked in the build environment. The network blocked `esm.sh` imports for `deno check`. Only `_shared/scheduler-auth.ts` was checked and unit-tested. Deploy to staging and exercise each function before production.
- Database behaviour is covered by `supabase/security-tests/` (297 checks as of `0075`). CI (`.github/workflows/ci.yml`) runs them, plus the web build and the translation check, on every push.
- UI flows were checked in Chromium against a mocked backend, not a real Supabase project.

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
