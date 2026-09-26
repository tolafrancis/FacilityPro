# Demo site setup (demo.facilitypro.tech)

The live demo runs on its own Supabase project and its own Cloudflare Worker, never on production (`jzrugcrpddcrlrymmurm`, facilitypro.tech).

| Piece | Demo | Production |
| --- | --- | --- |
| Supabase project | `facilitypro-demo` (`kpqaamzndeodvlalvazs`, separate account) | `jzrugcrpddcrlrymmurm` |
| Build settings | `.env.demo` (`npm run build:demo`) | `.env.production` (`npm run build`) |
| Cloudflare config | `wrangler.demo.jsonc` → Worker `demo-facilitypro` | `wrangler.jsonc` → Worker `facilitypro` |
| Domain | demo.facilitypro.tech | facilitypro.tech, www.facilitypro.tech |

> **Never build a second Worker from this repo with the default settings.** `wrangler.jsonc` attaches facilitypro.tech and www to whichever Worker deploys it, so a demo Worker using it takes the live site's domains (this happened on 2026-09-26). The demo must always deploy with `-c wrangler.demo.jsonc`.

## Done already

- Demo Supabase project created, migrations `0001…0094` applied and recorded in `supabase_migrations.schema_migrations`.
- Auth `site_url` is `https://demo.facilitypro.tech`, and `https://demo.facilitypro.tech/**` is an allowed redirect.
- `.env.demo` holds the demo project's URL and public anon key.

## 1. Clear the demo address (owner, Cloudflare)

1. **facilitypro.tech → DNS → Records**: look for a record named `demo`.
2. If one exists (it pointed at another site), note where it goes, then delete it. The deploy in step 2 creates the right record itself and fails if one is already there.

## 2. Create the demo Worker (owner, Cloudflare)

1. **Workers & Pages → Create application → Import a repository**, choose `tolafrancis/FacilityPro`.
2. Fill in:

   | Field | Value |
   | --- | --- |
   | Project name | `demo-facilitypro` |
   | Build command | `npm run build:demo` |
   | Deploy command | `npx wrangler deploy -c wrangler.demo.jsonc` |
   | Non-production branch deploy command (if shown) | `npx wrangler preview -c wrangler.demo.jsonc` |
   | Enable Preview builds | **Off** |
   | Advanced settings → API token | **Create new token** (don't reuse the facilitypro token) |

   No build variables are needed: `npm run build:demo` reads `.env.demo`.
3. Click **Deploy**. When it finishes, **demo-facilitypro → Domains** lists `demo.facilitypro.tech`.
4. Check that **facilitypro → Domains** still lists facilitypro.tech and www.facilitypro.tech, and that https://facilitypro.tech opens.

## 3. Sign up and load the demo data

1. Open https://demo.facilitypro.tech and sign up as the demo administrator, `tolafrancis4biz@gmail.com`, then confirm the email.
2. Claude loads the seed in one session against the demo project:
   `set fp.allow_demo_seed='yes'; set fp.demo_owner_email='<email>'; \i supabase/seed/tenant_demo.sql`.
3. Re-run `scripts/help/run.cjs crawl|workflows|help` against the demo.
4. To refresh the dates later, run `tenant_demo_remove.sql`, then `tenant_demo.sql` again.

## Notes

- The demo Worker has no script, so the Zalo webhook forwarder (`worker/index.js`) only runs in production.
- There is no Turnstile CAPTCHA in the demo. Production's site key only works on facilitypro.tech.
- Email, SMS, push and the AI features are not connected in the demo unless their secrets are added and the edge functions are deployed to the demo project.
- Every push to `main` redeploys both Workers, each with its own config.
