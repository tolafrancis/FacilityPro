import { describe, expect, it } from 'vitest';
import { helpContent } from './localized';
import { GUIDE, KNOWN_ISSUES, QUICK_STARTS } from './guide';
import { PAGE_HELP_VI } from './pageHelpData.vi';
import { PAGE_HELP } from './pageHelpData';
import { FEATURES_VI } from './features.vi';
import { FEATURES } from './features';
import { headingId, splitHeadingId } from '../lib/markdown';

// The Vietnamese help must line up with the English source: same sections,
// same heading anchors, same links and screenshots, same list lengths.

const heads = (md: string) => [...md.matchAll(/^#{1,4}\s+(.+)$/gm)].map((m) => splitHeadingId(m[1]));
const urls = (md: string) => [...md.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
const vi = helpContent('vi');

describe('Vietnamese help content', () => {
  const pairs: [string, string, string][] = [
    ...GUIDE.map((s, i) => [s.id, s.body, vi.guide[i].body] as [string, string, string]),
    ...QUICK_STARTS.map((q, i) => [q.role, q.body, vi.quickStarts[i].body] as [string, string, string]),
    ['known-issues', KNOWN_ISSUES, vi.knownIssues],
  ];
  it('every article is translated, with the English heading anchors', () => {
    for (const [id, en, v] of pairs) {
      expect(v, id).not.toBe(en);
      expect(heads(v).map((h) => h.id), id).toEqual(heads(en).map((h) => headingId(h.text)));
    }
  });
  it('keeps every link and screenshot, in order', () => {
    for (const [id, en, v] of pairs) expect(urls(v), id).toEqual(urls(en));
  });
  it('translates every section title', () => {
    for (const [i, s] of vi.guide.entries()) expect(s.title, s.id).not.toBe(GUIDE[i].title);
  });
  it('has page help for every entry, with matching lists', () => {
    expect(PAGE_HELP_VI.length).toBe(PAGE_HELP.length);
    PAGE_HELP.forEach((p, i) => {
      const v = PAGE_HELP_VI[i];
      expect(v.canDo.length, p.title).toBe(p.canDo.length);
      expect(v.fields.length, p.title).toBe(p.fields.length);
      expect(!!v.tip, p.title).toBe(!!p.tip);
    });
  });
  it('has every feature, with matching lists', () => {
    for (const f of FEATURES) {
      const v = FEATURES_VI[f.id];
      expect(v, f.id).toBeDefined();
      expect(v.prereq.length, f.id).toBe(f.prereq.length);
      expect(v.steps.length, f.id).toBe(f.steps.length);
    }
    expect(Object.keys(FEATURES_VI).length).toBe(FEATURES.length);
  });
});
