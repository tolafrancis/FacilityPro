import { describe, expect, it } from 'vitest';
import { matchPattern, pageHelpFor } from './pageHelp';
import { PAGE_HELP } from './pageHelpData';
import { GUIDE, QUICK_STARTS } from './guide';
import { FEATURES } from './features';
import { headingId } from '../lib/markdown';
import { existsSync } from 'node:fs';

// Every help link must land on a real section and heading, every screenshot
// must exist, and related features must exist — so the guide can't drift.

const anchors = new Map<string, Set<string>>();
for (const s of GUIDE) anchors.set(`/help/guide/${s.id}`, new Set([...s.body.matchAll(/^#{2,4}\s+(.+)$/gm)].map((m) => headingId(m[1]))));

function checkLink(href: string) {
  const [path, hash] = href.split('#');
  if (path === '/help' || path === '/help/features' || path === '/help/known-issues') return;
  if (path.startsWith('/help/quick-start/')) {
    expect(QUICK_STARTS.map((q) => q.role), href).toContain(path.split('/').pop());
    return;
  }
  expect(anchors.has(path), `unknown guide section: ${href}`).toBe(true);
  if (hash) expect(anchors.get(path)!.has(hash), `unknown heading: ${href}`).toBe(true);
}

const allMarkdown = [...GUIDE.map((s) => s.body), ...QUICK_STARTS.map((q) => q.body)];

describe('help content', () => {
  it('every link inside the guide points at a real section and heading', () => {
    for (const md of allMarkdown) for (const m of md.matchAll(/\]\((\/help\/(?!screens\/)[^)\s]*)\)/g)) checkLink(m[1]);
  });
  it('every screenshot referenced exists', () => {
    const imgs = [...allMarkdown.flatMap((md) => [...md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1])), ...FEATURES.flatMap((f) => (f.screenshot ? [f.screenshot] : []))];
    for (const src of imgs) expect(existsSync(`public${src}`), src).toBe(true);
  });
  it('page help and features link to real guide sections', () => {
    for (const p of PAGE_HELP) if (p.guide) checkLink(p.guide);
    for (const f of FEATURES) checkLink(f.guide);
  });
  it('related features exist and ids are unique', () => {
    const ids = new Set(FEATURES.map((f) => f.id));
    expect(ids.size).toBe(FEATURES.length);
    for (const f of FEATURES) for (const r of f.related) expect(ids.has(r), `${f.id} → ${r}`).toBe(true);
  });
});

describe('pageHelpFor', () => {
  it('matches ids and prefers role-specific entries', () => {
    expect(matchPattern('/work-orders/:id', '/work-orders/abc')).toBe(true);
    expect(matchPattern('/work-orders/:id', '/work-orders')).toBe(false);
    expect(pageHelpFor('/work-orders/abc', 'manager')?.title).toBe('Work order');
    expect(pageHelpFor('/', 'occupant')?.title).toBe('Home');
    expect(pageHelpFor('/', 'technician')?.title).toBe('Dashboard');
    expect(pageHelpFor('/nowhere', 'manager')).toBeNull();
  });
  it('covers every main staff page', () => {
    for (const p of ['/', '/requests', '/work-orders', '/my-work', '/maintenance', '/assets', '/parts', '/vendors', '/locations', '/devices', '/reports', '/settings', '/workflows', '/financial'])
      expect(pageHelpFor(p, 'org_admin'), p).not.toBeNull();
  });
});
