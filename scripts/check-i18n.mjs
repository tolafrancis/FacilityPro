// Fails when a translation key exists in one language but not in another.
// Usage: node scripts/check-i18n.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../public/locales/', import.meta.url).pathname;
const langs = readdirSync(root);
const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

// i18next plural suffixes are language-specific (Vietnamese has only "other").
const base = (key) => key.replace(/_(zero|one|two|few|many|other)$/, '');

let problems = 0;
const files = new Set(langs.flatMap((l) => readdirSync(join(root, l))));
for (const file of files) {
  const keys = {};
  for (const l of langs) {
    try {
      keys[l] = new Set(flatten(JSON.parse(readFileSync(join(root, l, file), 'utf8'))).map(base));
    } catch (e) {
      console.error(`${l}/${file}: ${e.code === 'ENOENT' ? 'missing file' : e.message}`);
      problems++;
      keys[l] = new Set();
    }
  }
  for (const a of langs) {
    for (const b of langs) {
      if (a === b) continue;
      for (const k of keys[a]) {
        if (!keys[b].has(k)) {
          console.error(`${b}/${file}: missing "${k}" (present in ${a})`);
          problems++;
        }
      }
    }
  }
}
if (problems) {
  console.error(`\n${problems} translation problem(s).`);
  process.exit(1);
}
console.log(`Translations OK: ${langs.join(', ')} × ${files.size} namespaces.`);
