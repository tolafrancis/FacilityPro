// supabase/functions/_shared/blog-ai.ts
//
// Blog drafting for the admin console's "AI Generate Blog" button, run by the
// smart-assistant Edge Function (the app's one server-side AI entry point).
// Pure helpers only: building the prompt and cleaning the model's JSON into
// fields the blog editor accepts (same limits as fp_blog_posts, 0093).

export interface SiteLink {
  path: string;   // /features/<slug> or /solutions/<slug>
  title: string;
}

export interface BlogDraft {
  title: string;
  excerpt: string;
  body: string;
  tags: string[];
  seo_title: string;
  seo_description: string;
}

export const LIMITS = { title: 200, excerpt: 400, body: 200_000, seoTitle: 120, seoDescription: 300, tags: 10, tag: 30 };
export const MAX_TOPIC = 300;

/** Only well-formed site paths the client sent (the public site's own pages). */
export function cleanLinks(raw: unknown): SiteLink[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteLink[] = [];
  for (const l of raw.slice(0, 80)) {
    const path = typeof l?.path === 'string' ? l.path : '';
    const title = typeof l?.title === 'string' ? l.title.trim().slice(0, 80) : '';
    if (/^\/(features|solutions)\/[a-z0-9]+(-[a-z0-9]+)*$/.test(path) && title) out.push({ path, title });
  }
  return out;
}

export function buildBlogMessages(topic: string, lng: 'en' | 'vi', links: SiteLink[], variation: number) {
  const language = lng === 'vi' ? 'Vietnamese' : 'English';
  const linkList = links.length
    ? links.map((l) => `- ${l.title}: ${l.path}`).join('\n')
    : '(none)';
  const system = [
    'You are an experienced content writer for FacilityPro, a facilities and maintenance management platform (CMMS).',
    'FacilityPro covers fault reporting (web, QR codes, email, Zalo), work orders with SLAs, preventive maintenance,',
    'checklists, assets and meters, parts, vendors and contracts, tenant portals and bookings, budgets and procurement,',
    'reports and TV display boards, workflows, IoT sensors, and it works in English and Vietnamese.',
    'Readers are facility managers, building and property managers, maintenance supervisors and technicians,',
    'and facility-management companies, many of them in Vietnam and South-East Asia.',
    '',
    'Write one original, publish-ready blog post on the topic the user gives. Requirements:',
    '- Genuinely useful, practical and specific; natural, engaging, easy to read; no filler, no clichés, no hype.',
    '- Structure in Markdown: an introduction of 1–2 short paragraphs (no heading), then 4–7 sections with "## " headings,',
    '  "### " subheadings where useful, short paragraphs, bullet or numbered lists where they help, and a closing section',
    '  with clear takeaways. Do NOT include the post title as a heading. Aim for 900–1,400 words.',
    '- SEO-friendly: use the topic’s key phrase naturally in the intro and a heading or two; never keyword-stuff.',
    '- Mention FacilityPro at most once or twice, where it genuinely helps the reader; the post must not read like an advert.',
    '- Do not invent statistics, studies, quotes, customers or URLs. No external links. You may link up to 3 of these',
    '  FacilityPro pages with Markdown links, only where relevant, using exactly these paths:',
    linkList,
    '- Only Markdown: no HTML, no images, no tables, no front matter.',
    `- Write everything in ${language}.`,
    '',
    'Reply with ONLY a JSON object with these keys:',
    '{"title": "a clear, compelling post title (max 90 characters)",',
    ' "excerpt": "1–2 sentence summary for the blog list (max 300 characters)",',
    ' "body": "the full article in Markdown",',
    ' "tags": ["3 to 5 short lowercase topic tags"],',
    ' "seo_title": "search-result title, max 60 characters",',
    ' "seo_description": "search-result description, 140–160 characters"}',
  ].join('\n');
  const user = variation > 0
    ? `Topic: ${topic}\n\nThis is attempt ${variation + 1}: write a clearly different version — a different angle, structure and examples from a typical first draft.`
    : `Topic: ${topic}`;
  return { system, user };
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '';
}

/** Cut at a word boundary so a limit never leaves half a word. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1); // room for the ellipsis
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}

/**
 * The model's reply as editor fields. Unknown internal links become plain
 * text, HTML tags are removed, lengths match the database, and any field that
 * came back empty is listed in `missing` (never a broken form).
 */
export function sanitizeBlogDraft(raw: unknown, links: SiteLink[]): { draft: BlogDraft; missing: (keyof BlogDraft)[] } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const allowed = new Set(links.map((l) => l.path));

  let body = str(o.body, LIMITS.body)
    .replace(/<\/?[a-z][^>]*>/gi, '')                                   // no HTML
    .replace(/^#\s+.+\n+/, '');                                        // no title heading at the top
  // Images aren't generated (the editor uploads them); remove before links.
  body = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  // Links: keep allowed site paths; everything else becomes its text.
  body = body.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => (allowed.has(href) ? `[${text}](${href})` : text));
  body = body.replace(/\n{3,}/g, '\n\n').trim();

  const tags = Array.isArray(o.tags)
    ? [...new Set(o.tags.map((t) => str(t, LIMITS.tag).toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 5)
    : [];

  const draft: BlogDraft = {
    title: clip(str(o.title, 400).replace(/^#+\s*/, '').replace(/^["“]|["”]$/g, ''), LIMITS.title),
    excerpt: clip(str(o.excerpt, 1000), LIMITS.excerpt),
    body,
    tags,
    seo_title: clip(str(o.seo_title, 400), LIMITS.seoTitle),
    seo_description: clip(str(o.seo_description, 1000), LIMITS.seoDescription),
  };
  const missing = (Object.keys(draft) as (keyof BlogDraft)[]).filter((k) => (Array.isArray(draft[k]) ? draft[k].length === 0 : !draft[k]));
  // A body without any section is not publish-ready.
  if (draft.body && draft.body.split(/\s+/).length < 150 && !missing.includes('body')) missing.push('body');
  return { draft, missing };
}

/** JSON object from a model reply (tolerates code fences or stray text). */
export function parseJsonObject(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
