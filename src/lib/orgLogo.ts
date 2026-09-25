import { supabase } from './supabase';

// Organisation logos (migration 0079): public bucket, "{org_id}/…" paths,
// PNG/JPEG/WebP up to 2 MB, writable by the organisation's admins only.
export const LOGO_BUCKET = 'fp-org-logos';
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function orgLogoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Uploads a new logo, points the organisation at it and removes the old file. */
export async function uploadOrgLogo(orgId: string, file: File, previous?: string | null): Promise<string> {
  if (!LOGO_TYPES.includes(file.type)) throw new Error('logo_type');
  if (file.size > LOGO_MAX_BYTES) throw new Error('logo_size');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${orgId}/logo-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (upErr) throw upErr;
  const { error } = await supabase.from('fp_organizations').update({ logo_path: path }).eq('id', orgId);
  if (error) throw error;
  if (previous && previous !== path) await supabase.storage.from(LOGO_BUCKET).remove([previous]);
  return path;
}
