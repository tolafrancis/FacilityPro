import { foldText } from './ui';
import { headingId } from './markdown';

// Search for the Help Center: guide articles (split into their ## sections),
// the feature directory and the per-page help. Accent-insensitive, every
// word must match somewhere; titles weigh more than body text.

export interface HelpDoc {
  /** Where the result opens, e.g. "/help/guide/work-orders#closing". */
  href: string;
  title: string;
  /** Section or article the result belongs to. */
  context: string;
  text: string;
  keywords?: string[];
}

export interface HelpHit extends HelpDoc {
  score: number;
  snippet: string;
}

/** Splits a markdown article into one searchable entry per ## heading. */
export function articleDocs(path: string, articleTitle: string, markdown: string): HelpDoc[] {
  const docs: HelpDoc[] = [];
  let title = articleTitle;
  let anchor = '';
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join(' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`]/g, ' ').replace(/\s+/g, ' ').trim();
    if (text || anchor) docs.push({ href: anchor ? `${path}#${anchor}` : path, title, context: articleTitle, text });
  };
  for (const line of markdown.split('\n')) {
    const h = /^##\s+(.*)$/.exec(line);
    if (h) {
      flush();
      title = h[1].trim();
      anchor = headingId(title);
      buf = [];
    } else {
      buf.push(line);
    }
  }
  flush();
  return docs;
}

function snippetFor(text: string, words: string[]): string {
  const folded = foldText(text);
  let at = -1;
  for (const w of words) {
    at = folded.indexOf(w);
    if (at >= 0) break;
  }
  if (at < 0) return text.slice(0, 140) + (text.length > 140 ? '…' : '');
  const start = Math.max(0, at - 50);
  return (start > 0 ? '…' : '') + text.slice(start, start + 160).trim() + (start + 160 < text.length ? '…' : '');
}

export function searchHelp(query: string, docs: HelpDoc[], limit = 20): HelpHit[] {
  const words = foldText(query).split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return [];
  const hits: HelpHit[] = [];
  for (const d of docs) {
    const title = foldText(d.title);
    const context = foldText(d.context);
    const kw = foldText((d.keywords ?? []).join(' '));
    const body = foldText(d.text);
    let score = 0;
    let all = true;
    for (const w of words) {
      const s = (title.includes(w) ? 6 : 0) + (kw.includes(w) ? 4 : 0) + (context.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0);
      if (s === 0) {
        all = false;
        break;
      }
      score += s;
    }
    if (!all) continue;
    if (title.includes(words.join(' '))) score += 5;
    hits.push({ ...d, score, snippet: snippetFor(d.text, words) });
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}
