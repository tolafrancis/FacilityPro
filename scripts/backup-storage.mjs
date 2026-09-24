// Copies every Supabase Storage bucket (photos, documents, …) to a local
// folder (audit S3-H2). Database backups/PITR don't include Storage files.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/backup-storage.mjs [target-dir]
//
// Files already in the target with the same size are skipped, so re-running
// into the same folder only fetches what's new. Keep the key out of shell
// history (e.g. export it from a password manager) and store the copies
// off-site (another cloud account or an encrypted drive).
import { createClient } from '@supabase/supabase-js';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const target = process.argv[2] ?? 'storage-backup';
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function* walk(bucket, prefix = '') {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders have no id.
      if (entry.id === null) yield* walk(bucket, path);
      else yield { path, size: entry.metadata?.size ?? -1 };
    }
    if (data.length < 1000) return;
  }
}

const { data: buckets, error } = await supabase.storage.listBuckets();
if (error) {
  console.error(error.message);
  process.exit(1);
}
let copied = 0, skipped = 0, failed = 0;
for (const b of buckets) {
  for await (const file of walk(b.name)) {
    const dest = join(target, b.name, file.path);
    const existing = await stat(dest).catch(() => null);
    if (existing && existing.size === file.size) {
      skipped++;
      continue;
    }
    const { data, error: err } = await supabase.storage.from(b.name).download(file.path);
    if (err) {
      console.error(`failed: ${b.name}/${file.path}: ${err.message}`);
      failed++;
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await data.arrayBuffer()));
    copied++;
  }
}
console.log(`Buckets: ${buckets.map((b) => b.name).join(', ')}. Copied ${copied}, unchanged ${skipped}, failed ${failed}.`);
process.exit(failed ? 1 : 0);
