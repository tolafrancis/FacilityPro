import { supabase } from './supabase';

const BUCKET = 'fp-media';

/**
 * Upload a file to the org-scoped media bucket and record it in fp_media.
 * Path convention: {orgId}/{scope}/{scopeId}/{timestamp}-{filename}
 */
export async function uploadMedia(params: {
  orgId: string;
  file: File;
  workOrderId?: string;
  requestId?: string;
  phase?: 'before' | 'after';
}): Promise<{ error: string | null }> {
  const { orgId, file, workOrderId, requestId, phase } = params;
  const scope = workOrderId ? `work-orders/${workOrderId}` : `requests/${requestId}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${orgId}/${scope}/${Date.now()}-${safeName}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (up.error) return { error: up.error.message };

  const ins = await supabase.from('fp_media').insert({
    org_id: orgId,
    work_order_id: workOrderId ?? null,
    request_id: requestId ?? null,
    path,
    kind: file.type.startsWith('video') ? 'video' : 'image',
    phase: phase ?? null,
  });
  if (ins.error) return { error: ins.error.message };
  return { error: null };
}

/** Create a short-lived signed URL for displaying a stored object. */
export async function signedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}
