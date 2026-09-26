import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown, parseMarkdown, safeUrl } from './markdown';

const html = (s: string) => renderToStaticMarkup(createElement(Markdown, { source: s }));

describe('parseMarkdown', () => {
  it('reads the common blocks', () => {
    const b = parseMarkdown('# Title\n\nFirst line\nsame paragraph\n\n- one\n- two\n\n1. a\n2. b\n\n> quote\n\n```\ncode\n```\n\n---\n\n![Pic](https://x.test/a.png)');
    expect(b.map((x) => x.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'code', 'rule', 'image']);
    expect(b[0]).toEqual({ type: 'heading', level: 2, text: 'Title' });
    expect(parseMarkdown('## Two\n\n### Three\n\n#### Four').map((x) => (x as { level: number }).level)).toEqual([2, 3, 4]);
    expect(b[1]).toEqual({ type: 'paragraph', text: 'First line same paragraph' });
    expect(b[3]).toMatchObject({ ordered: true, items: ['a', 'b'] });
  });
});

describe('Markdown', () => {
  it('renders inline formatting and links', () => {
    const out = html('Some **bold**, *italic*, `code` and [a link](https://example.com).');
    expect(out).toContain('<strong');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<code');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
  });
  it('never renders HTML or unsafe links from a post', () => {
    const out = html('<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![y](data:image/png;base64,AAA)\n\n![z](javascript:alert(2))');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('data:image');
  });
  it('accepts only safe URLs', () => {
    expect(safeUrl('https://a.test')).toBe('https://a.test');
    expect(safeUrl('/features/iot')).toBe('/features/iot');
    expect(safeUrl('mailto:a@b.test')).toBe('mailto:a@b.test');
    expect(safeUrl('//evil.test')).toBeNull();
    expect(safeUrl('javascript:alert(1)')).toBeNull();
  });
});
