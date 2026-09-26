import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const { detectLng, mergeDraft } = await import('./blogAi');

const draft = {
  title: 'AI title', excerpt: 'AI summary', body: '## AI body', tags: ['ai'], seo_title: 'AI seo', seo_description: 'AI desc',
};
const empty = { excerpt: '', body: '', tags: [] as string[], seo_title: '', seo_description: '' };

describe('mergeDraft', () => {
  it('fills every empty field', () => {
    const r = mergeDraft(empty, new Set(), draft);
    expect(r.next).toMatchObject({ excerpt: 'AI summary', body: '## AI body', tags: ['ai'], seo_title: 'AI seo', seo_description: 'AI desc' });
    expect(r.filled).toHaveLength(5);
    expect(r.kept).toEqual([]);
  });
  it('keeps what the user wrote', () => {
    const r = mergeDraft({ ...empty, excerpt: 'Mine', tags: ['mine'] }, new Set(), draft);
    expect(r.next.excerpt).toBe('Mine');
    expect(r.next.tags).toEqual(['mine']);
    expect(r.kept.sort()).toEqual(['excerpt', 'tags']);
    expect(r.owned.has('excerpt')).toBe(false);
  });
  it('regenerating replaces earlier AI text but not the user’s edits', () => {
    const first = mergeDraft(empty, new Set(), draft);
    const owned = new Set(first.owned);
    owned.delete('body'); // the user edited the article
    const second = mergeDraft({ ...first.next, body: 'Edited' }, owned, { ...draft, excerpt: 'New summary', body: '## New' });
    expect(second.next.excerpt).toBe('New summary');
    expect(second.next.body).toBe('Edited');
    expect(second.kept).toEqual(['body']);
  });
  it('replaces a user field only when asked', () => {
    const r = mergeDraft({ ...empty, body: 'Mine' }, new Set(), draft, new Set(['body']));
    expect(r.next.body).toBe('## AI body');
  });
  it('never blanks a field the AI left empty', () => {
    const r = mergeDraft({ ...empty, seo_title: 'Mine' }, new Set(['seo_title']), { ...draft, seo_title: '' });
    expect(r.next.seo_title).toBe('Mine');
  });
});

describe('detectLng', () => {
  it('spots Vietnamese topics', () => {
    expect(detectLng('Bảo trì phòng ngừa cho tòa nhà')).toBe('vi');
    expect(detectLng('Preventive maintenance for buildings')).toBe('en');
  });
});
