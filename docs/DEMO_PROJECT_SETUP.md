# Demo project setup (separate Supabase account)

The live demo runs in its own Supabase account, never in production (`jzrugcrpddcrlrymmurm`).

## Prerequisites (owner)

- A Supabase personal access token for the demo account, stored in the Claude Code environment as `DEMO_SUPABASE_ACCESS_TOKEN`. It is never pasted in chat.
- The demo administrator's email: `tolafrancis4biz@gmail.com` (confirmed).
- A Cloudflare Pages project on `demo.facilitypro.tech` (confirmed) building `main`, with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set to the demo project's values.

## Steps (Claude)

1. Create the project `facilitypro-demo` (free plan, region `ap-southeast-2`) in the demo account.
2. Apply `supabase/migrations/0001…0094` in order through the Management API (`/v1/projects/<ref>/database/query`), recording each in `supabase_migrations.schema_migrations`.
3. Set Auth `site_url` and the redirect URLs to the demo domain.
4. Give the owner the project URL and the anon (public) key for the Cloudflare settings.
5. After the owner signs up on the demo site, load the seed in one session:
   `set fp.allow_demo_seed='yes'; set fp.demo_owner_email='<email>'; \i supabase/seed/tenant_demo.sql`.
6. Re-run `scripts/help/run.cjs crawl|workflows|help` against the demo.
7. To refresh the dates later, run `tenant_demo_remove.sql`, then `tenant_demo.sql` again.

Email, SMS, push and the AI features are not connected in the demo unless their secrets are added and the edge functions are deployed.
