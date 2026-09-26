import type { ReactNode } from 'react';

// A small Markdown renderer for blog posts. It builds React elements (never
// HTML strings), so nothing in a post can inject markup or scripts; links and
// images only accept http(s), site-relative and mailto addresses.
//
// Supported: # headings (#–####), paragraphs, **bold**, *italic*, `code`,
// [links](url), ![images](url), - / * / 1. lists, > quotes, ``` code
// blocks, --- rules. Anything else shows as plain text.

export type Block =
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'image'; alt: string; src: string }
  | { type: 'rule' };

export function safeUrl(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u) || (u.startsWith('/') && !u.startsWith('//')) || u.startsWith('#')) return u;
  return null;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      i += 1;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      // The post title is the page's h1, so # and ## are both section headings (h2).
      blocks.push({ type: 'heading', level: Math.max(2, h[1].length) as 2 | 3 | 4, text: h[2].trim() });
      i += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }
    const img = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (img) {
      blocks.push({ type: 'image', alt: img[1], src: img[2] });
      i += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', text: body.join(' ') });
      continue;
    }
    const ul = /^\s*[-*]\s+/;
    const ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, '').trim());
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*>|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i])) para.push(lines[i++].trim());
    if (para.length === 0) {
      para.push(line.trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: para.join(' ') });
  }
  return blocks;
}

/** Inline formatting: code, images, links, bold, italic. */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(!\[[^\]]*\]\([^)\s]+\))|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (m[1]) out.push(<code key={key} className="rounded bg-ink/5 px-1.5 py-0.5 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else if (m[2]) {
      const [, alt, src] = /!\[([^\]]*)\]\(([^)\s]+)\)/.exec(tok)!;
      const safe = safeUrl(src);
      out.push(safe ? <img key={key} src={safe} alt={alt} className="inline max-h-8 align-middle" loading="lazy" /> : alt);
    } else if (m[3]) {
      const [, label, href] = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok)!;
      const safe = safeUrl(href);
      const external = !!safe && /^https?:\/\//i.test(safe);
      out.push(safe
        ? <a key={key} href={safe} className="font-medium text-brand underline-offset-2 hover:underline" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{renderInline(label, key)}</a>
        : label);
    } else if (m[4]) out.push(<strong key={key} className="font-semibold text-ink">{renderInline(tok.slice(2, -2), key)}</strong>);
    else if (m[5]) out.push(<em key={key}>{renderInline(tok.slice(1, -1), key)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, imageUrl = (s: string) => s }: { source: string; imageUrl?: (src: string) => string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="space-y-5 text-[17px] leading-8 text-ink/85">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.type) {
          case 'heading': {
            const cls = b.level === 2 ? 'pt-4 text-2xl font-semibold text-ink' : b.level === 3 ? 'pt-2 text-xl font-semibold text-ink' : 'text-lg font-semibold text-ink';
            const Tag = `h${b.level}` as 'h2' | 'h3' | 'h4';
            return <Tag key={k} className={cls}>{renderInline(b.text, k)}</Tag>;
          }
          case 'paragraph':
            return <p key={k}>{renderInline(b.text, k)}</p>;
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul';
            return (
              <Tag key={k} className={`space-y-1.5 pl-6 ${b.ordered ? 'list-decimal' : 'list-disc'} marker:text-brand`}>
                {b.items.map((it, j) => <li key={j}>{renderInline(it, `${k}-${j}`)}</li>)}
              </Tag>
            );
          }
          case 'quote':
            return <blockquote key={k} className="border-l-4 border-brand/60 pl-4 italic text-ink/75">{renderInline(b.text, k)}</blockquote>;
          case 'code':
            return <pre key={k} className="overflow-x-auto rounded-xl bg-[#0F172A] p-4 text-sm leading-6 text-[#E2E8F0]"><code>{b.text}</code></pre>;
          case 'image': {
            const safe = safeUrl(imageUrl(b.src));
            return safe ? (
              <figure key={k}>
                <img src={safe} alt={b.alt} className="w-full rounded-2xl border border-line" loading="lazy" />
                {b.alt && <figcaption className="mt-2 text-center text-sm text-ink-muted">{b.alt}</figcaption>}
              </figure>
            ) : null;
          }
          case 'rule':
            return <hr key={k} className="border-line" />;
        }
        return null;
      })}
    </div>
  );
}
