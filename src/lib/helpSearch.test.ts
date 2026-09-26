import { describe, expect, it } from 'vitest';
import { articleDocs, searchHelp } from './helpSearch';
import { calloutKind, headingId } from './markdown';

const md = `Intro text about work orders.

## Closing a work order
Set a **completion code**, then choose → Resolved.

## Điều hòa không mát
Kiểm tra tụ điện.`;

describe('articleDocs', () => {
  it('makes one entry per ## section with an anchor', () => {
    const docs = articleDocs('/help/guide/work-orders', 'Work orders', md);
    expect(docs.map((d) => d.href)).toEqual([
      '/help/guide/work-orders',
      '/help/guide/work-orders#closing-a-work-order',
      '/help/guide/work-orders#dieu-hoa-khong-mat',
    ]);
    expect(docs[1].text).toBe('Set a completion code , then choose → Resolved.');
  });
});

describe('searchHelp', () => {
  const docs = [
    ...articleDocs('/help/guide/work-orders', 'Work orders', md),
    { href: '/help/features#parts', title: 'Parts & inventory', context: 'Feature directory', text: 'Stock levels', keywords: ['spare', 'restock'] },
  ];
  it('needs every word and ranks titles first', () => {
    expect(searchHelp('completion code', docs)[0].title).toBe('Closing a work order');
    expect(searchHelp('completion banana', docs)).toEqual([]);
  });
  it('ignores accents and matches keywords', () => {
    expect(searchHelp('dieu hoa', docs)[0].href).toContain('#dieu-hoa-khong-mat');
    expect(searchHelp('restock', docs)[0].title).toBe('Parts & inventory');
  });
  it('ignores one-letter noise', () => {
    expect(searchHelp('a', docs)).toEqual([]);
  });
});

describe('markdown helpers', () => {
  it('builds heading anchors', () => {
    expect(headingId('Step 2: Assign a technician')).toBe('step-2-assign-a-technician');
  });
  it('recognises call-outs', () => {
    expect(calloutKind('**Tip:** use QR codes')).toBe('tip');
    expect(calloutKind('**Warning:** this deletes data')).toBe('warning');
    expect(calloutKind('just a quote')).toBeNull();
  });
});
