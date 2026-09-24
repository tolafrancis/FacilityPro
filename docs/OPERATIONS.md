# FacilityPro operations runbook

Steps that live outside the code: checking production matches the
migrations, backups and restores, email deliverability and monitoring.
Do each **Before launch** item once, and repeat the **Routine** items on
their schedule.

---

## 1. Production matches the migrations (drift check)

Anything changed by hand in the SQL editor (a policy tweak, an index, a
skipped migration) makes production differ from what the repository says,
and later migrations can then fail or behave differently.

**Before launch, and after every release:**

```bash
PROD_DB_URL='postgresql://postgres.<ref>:<db-password>@<pooler-host>:5432/postgres' \
PGHOST=<local postgres> PGUSER=postgres scripts/check-drift.sh
```

- `PROD_DB_URL`: Supabase dashboard → **Connect** → *Session pooler* URI.
- It needs a local Postgres 15+ (Docker: `docker run -e POSTGRES_PASSWORD=x -p 5432:5432 postgres:15`).
- It applies every migration to a fresh local database (proving they run
  cleanly in order), then compares tables, columns, constraints, indexes,
  RLS policies, functions and triggers with production. Production is only
  read.
- **No lines after "Differences"** = in sync. Otherwise, each `>` line exists
  only in production (a hand-made change: turn it into a new migration or
  drop it) and each `<` line only in the migrations (a migration that wasn't
  applied: apply it).

Going forward, apply migrations with `supabase db push` rather than pasting
files into the SQL editor. CI (`.github/workflows/ci.yml`) runs every
migration on a fresh database plus the security suites on each push.

---

## 2. Backups and restore

### Before launch
1. **Upgrade to Supabase Pro** and enable **Point-in-Time Recovery**
   (Dashboard → Database → Backups → PITR). Pro alone gives daily backups
   kept 7 days; PITR restores to any second in the retention window.
2. **Storage files aren't in database backups.** Copy them off-site:
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
     node scripts/backup-storage.mjs /backups/facilitypro-storage
   ```
   Run it daily (cron on any always-on machine, or a scheduled CI job with
   the key as a secret). It only downloads new or changed files. Keep the
   copies in a different account or on an encrypted drive.
3. **Do one test restore** (below) into a staging project and write down
   how long it took.

### Restore runbook
1. **Decide the target time**: just before the bad change or data loss.
   `fp_audit_log` shows who changed what and when.
2. **Restore into a new project first, not over production**, unless
   production is unusable. Dashboard → Database → Backups → *Restore to a new
   project* (PITR: pick the time). Check the data there.
3. **Choose the recovery:**
   - *Small loss* (some rows deleted/overwritten): copy the rows from the
     restored project back into production (`pg_dump --data-only --table=…`
     from the restore, then `psql` into production), keeping production's
     newer data.
   - *Whole database is bad*: restore production itself to the target time
     (Dashboard → Backups → PITR). Everything after that time is lost, so
     warn users first and put the app in maintenance mode (take the site
     down on Hostinger).
4. **Files**: re-upload any missing Storage objects from the storage backup
   folder (same bucket and path).
5. **Afterwards**: run `scripts/check-drift.sh`, check **Billing →
   Background jobs** is healthy, and sign in as a test user in each role.

### Routine
- Daily: storage backup (automated). Check it ran weekly.
- Quarterly: a test restore into staging.

---

## 3. Email deliverability

Two senders need a verified domain, or emails land in spam or aren't sent:
**Supabase Auth** (sign-up confirmation, password reset) and **the app's
notifications** (`process-outbox`: invitations, assignments, alerts).
Supabase's built-in email server allows only a few messages per hour and is
not for production.

### Before launch
1. **Resend** (resend.com) → Domains → add a sending subdomain, e.g.
   `mail.yourdomain.com`.
2. **DNS at Hostinger** (hPanel → Domains → DNS / Nameservers → DNS
   records): add exactly the records Resend shows:
   - **SPF**: `TXT` on `send.mail` (or as shown) — `v=spf1 include:amazonses.com ~all`
   - **DKIM**: the `TXT` record `resend._domainkey.mail` with the long key
   - **MX** for bounces, as shown
   - **DMARC**: `TXT` on `_dmarc.yourdomain.com` —
     `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` (tighten to
     `p=quarantine` after a few weeks of clean reports)

   Wait until Resend shows the domain **Verified**.
3. **Supabase Auth SMTP**: Dashboard → Authentication → Emails → SMTP
   Settings → enable custom SMTP:
   host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API
   key, sender `FacilityPro <no-reply@mail.yourdomain.com>`. Then raise
   the email rate limit (Authentication → Rate Limits) to fit your sign-up
   volume.
4. **Auth email templates** (English/Vietnamese): Authentication → Emails →
   Templates. Paste each file from `supabase/templates/` into the matching
   template (*Confirm signup* ← `confirmation.html`, *Reset password* ←
   `recovery.html`, *Magic link* ← `magic_link.html`, *Change email* ←
   `email_change.html`). They pick the language the user signed up in.
5. **App notifications**: `supabase secrets set RESEND_API_KEY=… OUTBOX_FROM="FacilityPro <notifications@mail.yourdomain.com>" APP_URL=https://app.yourdomain.com`.
6. **Test**: sign up with a Gmail and an Outlook address; both emails should
   arrive in the inbox (not spam). In Gmail, *Show original* should read
   `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

---

## 4. Monitoring

- **Billing → Background jobs** (platform admins): every scheduled job,
  plus email delivery, the message queue and workflow errors.
- **Email alerts**: the hourly health check emails platform admins when a
  job is late or failing, messages are failing or piling up, or workflows
  error (at most every 6 hours per problem).
- **External uptime monitor** (catches the case where email itself is
  broken):
  ```bash
  supabase functions deploy health --no-verify-jwt
  supabase secrets set HEALTH_TOKEN=$(openssl rand -hex 24)
  ```
  In UptimeRobot / Better Stack (free tiers are fine), add an HTTP monitor
  for `https://<ref>.functions.supabase.co/health?token=<HEALTH_TOKEN>`
  every 5 minutes, alerting on any non-200 response, by SMS or app push.
  Add a second monitor for the web app's own URL.
- **Frontend errors (Sentry)**: create a Sentry project (free tier is
  fine), set `VITE_SENTRY_DSN` (and `VITE_SENTRY_ENVIRONMENT=production`) in
  the build environment and rebuild. Unexpected errors (crashes, failed
  requests that aren't a normal refusal) are reported with the user's id
  only, no email and no session replay. Without the variable nothing is
  loaded. For readable stack traces, upload source maps from CI with
  `@sentry/cli sourcemaps upload` after `vite build --sourcemap hidden`.
- **Edge Function errors**: Supabase dashboard → Edge Functions → Logs
  (functions log failures with `console.error`). Set a log drain (Settings →
  Log drains) to keep them longer or alert on them.

---

## 5. Staging and releases

Never test migrations on production first.

1. Create a second Supabase project, **staging**, on the same plan
   features (pg_cron, pg_net, Storage). Apply every migration with
   `supabase db push` (link the CLI to staging first).
2. Build the web app against staging (`VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` of staging) and host it on a separate
   subdomain (e.g. `staging.yourdomain.com`), with its own
   `VITE_PUBLIC_APP_URL`.
3. For each release: CI must be green (build, translations, migrations on a
   fresh database, security suites) → apply to staging → click through the
   manual test plan in the audit report with test users in each role →
   apply the same migrations to production → deploy the web build →
   `scripts/check-drift.sh` against production.
4. Keep staging data fake: no real customer data or phone numbers.

---

## 6. Things that are public by design

- **Public report link** (`/report?org=…` and asset QR codes): when an
  organisation switches on public reporting, anyone with the link sees the
  organisation's name and the asset/location name it points to, and can
  submit a (rate-limited) report. Nothing else is exposed. Switching public
  reporting off makes the link show "not available".
- **Asset QR codes** (`/a/<code>`): resolve to ids only for people who
  aren't members; the codes are random and can't be guessed.
