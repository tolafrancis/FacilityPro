// supabase/functions/run-scheduled-workflows/index.ts
//
// Fires FacilitySpace's time-based workflow triggers (request pending for N
// minutes, asset useful life, warranty expiry near) by calling the
// fp_run_scheduled_workflows() RPC with the service role. Workflow email
// actions land in fp_notification_outbox; deploy/schedule process-outbox to
// actually send them.
//
// This is a standalone Supabase Edge Function (Deno) — it is NOT bundled with
// the web app and does not affect the frontend build.
//
// Deploy:
//   supabase functions deploy run-scheduled-workflows --no-verify-jwt
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Schedule it (e.g. every 15 minutes). Either:
//   - Supabase Dashboard -> Edge Functions -> Schedules, or
//   - pg_cron + pg_net from the SQL editor:
//       select cron.schedule('fp-scheduled-workflows', '*/15 * * * *', $$
//         select net.http_post(
//           url := 'https://<project-ref>.functions.supabase.co/run-scheduled-workflows',
//           headers := '{"Authorization":"Bearer <service-key>"}'::jsonb
//         );
//       $$);
//   - or skip the function entirely and cron the SQL directly:
//       select cron.schedule('fp-scheduled-workflows', '*/15 * * * *',
//         $$ select fp_run_scheduled_workflows(); $$);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase.rpc('fp_run_scheduled_workflows');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ fired: data ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
