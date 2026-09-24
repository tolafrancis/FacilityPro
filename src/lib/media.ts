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

// Storage accepts at most 25 MB (0062); phone photos are 5–12 MB, so images
// are downscaled before upload (audit S4-M3).
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;

export class UploadRejected extends Error {
  constructor(public reason: 'too_large' | 'unsupported_type') {
    super(reason);
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image'));
    };
    img.src = url;
  });
}

/**
 * Validate a picked file and shrink photos to at most 1600 px on the long
 * edge (JPEG). Videos pass through unchanged but must fit the size limit.
 * Throws UploadRejected for files that can't be uploaded.
 */
export async function prepareUpload(file: File): Promise<File> {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) throw new UploadRejected('unsupported_type');
  if (isVideo || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    if (file.size > MAX_UPLOAD_BYTES) throw new UploadRejected('too_large');
    return file;
  }
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (blob && blob.size < file.size) {
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
  } catch {
    // Formats the browser can't decode (e.g. HEIC on some browsers) are sent as-is.
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadRejected('too_large');
  return file;
}

/** Create a short-lived signed URL for displaying a stored object. */
export async function signedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}
