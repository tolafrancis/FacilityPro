// supabase/functions/run-scheduled-workflows/index.ts
//
// Fires FacilityPro's time-based workflow triggers (request pending for N
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
// Optional: migration 0061 already runs the same job every 15 minutes with
// pg_cron (select fp_run_job('scheduled_workflows')). Deploy this only if you
// want to trigger it from outside the database as well.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { forbidden, isSchedulerRequest } from '../_shared/scheduler-auth.ts';

Deno.serve(async (req) => {
  // Scheduler only (0061 pg_cron sends the service-role key).
  if (!isSchedulerRequest(req)) return forbidden();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // fp_run_job records the run, so the job-health check sees it.
  const { data, error } = await supabase.rpc('fp_run_job', { p_job: 'scheduled_workflows' });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ fired: data ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
