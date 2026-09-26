// deno test supabase/functions/_shared/blog-ai.test.ts
import { buildBlogMessages, cleanLinks, parseJsonObject, sanitizeBlogDraft } from './blog-ai.ts';

function assertEquals(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assert(ok: unknown, msg = 'assertion failed') {
  if (!ok) throw new Error(msg);
}

const links = cleanLinks([
  { path: '/features/work-orders', title: 'Work orders' },
  { path: '/solutions/healthcare', title: 'Healthcare' },
  { path: 'https://evil.test', title: 'x' },
  { path: '/features/../admin', title: 'x' },
]);

Deno.test('only well-formed site links are kept', () => {
  assertEquals(links.map((l) => l.path), ['/features/work-orders', '/solutions/healthcare']);
});

Deno.test('the prompt carries the topic, language, links and variation', () => {
  const m = buildBlogMessages('Reducing HVAC downtime', 'vi', links, 1);
  assert(m.system.includes('/features/work-orders'));
  assert(m.system.includes('Vietnamese'));
  assert(m.user.includes('Reducing HVAC downtime'));
  assert(m.user.includes('different version'));
});

Deno.test('model output is cleaned into editor fields', () => {
  const words = Array.from({ length: 200 }, () => 'word').join(' ');
  const { draft, missing } = sanitizeBlogDraft({
    title: '# "Five ways to cut downtime"',
    excerpt: 'Short summary.',
    body: `# Five ways\n\nIntro <script>alert(1)</script> ${words}\n\n## One\n\nSee [work orders](/features/work-orders), [evil](https://evil.test) and [fake](/features/nope).\n\n![img](https://x.test/a.png)`,
    tags: ['Maintenance', '#HVAC', 'maintenance', '', 'a', 'b', 'c'],
    seo_title: 'x'.repeat(200),
    seo_description: 'Desc.',
  }, links);
  assertEquals(draft.title, 'Five ways to cut downtime');
  assert(!draft.body.startsWith('# '), 'title heading removed');
  assert(!draft.body.includes('<script>'), 'no HTML');
  assert(draft.body.includes('[work orders](/features/work-orders)'));
  assert(draft.body.includes(' evil ') || draft.body.includes('evil and'), 'external link becomes text');
  assert(!draft.body.includes('/features/nope'));
  assert(!draft.body.includes('!['), 'no images');
  assertEquals(draft.tags, ['maintenance', 'hvac', 'a', 'b', 'c']);
  assert(draft.seo_title.length <= 120);
  assertEquals(missing, []);
});

Deno.test('empty or thin fields are reported, never silently left broken', () => {
  const { missing } = sanitizeBlogDraft({ title: 'T', body: 'Too short.', tags: [] }, links);
  assertEquals(missing.sort(), ['body', 'excerpt', 'seo_description', 'seo_title', 'tags']);
  assertEquals(sanitizeBlogDraft(null, links).missing.length, 6);
});

Deno.test('JSON is read from fenced or noisy replies', () => {
  assertEquals(parseJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assertEquals(parseJsonObject('Here you go: {"a":2} thanks'), { a: 2 });
  assertEquals(parseJsonObject('nope'), null);
});
