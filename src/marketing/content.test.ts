import { describe, expect, it } from 'vitest';
import { ALL_FEATURES, ALL_RESOURCES, ALL_SOLUTIONS, findFeature } from './content';
import { featureById } from '../help/features';

// Every page behind the header menus must have real content.
describe('marketing catalogue', () => {
  it('gives every feature page points and "How it works" steps', () => {
    for (const f of ALL_FEATURES) {
      expect(f.points.length, f.slug).toBeGreaterThanOrEqual(3);
      if (f.helpId) expect(featureById(f.helpId), `${f.slug} → ${f.helpId}`).toBeDefined();
      const steps = f.steps ?? (f.helpId ? featureById(f.helpId)?.steps : undefined) ?? [];
      expect(steps.length, f.slug).toBeGreaterThan(0);
    }
  });

  it('gives every solution challenges and features that exist', () => {
    for (const s of ALL_SOLUTIONS) {
      expect(s.challenges.length, s.slug).toBeGreaterThanOrEqual(2);
      for (const slug of s.features) expect(findFeature(slug), `${s.slug} → ${slug}`).toBeDefined();
    }
  });

  it('gives every resource page sections, or a link elsewhere', () => {
    for (const r of ALL_RESOURCES) {
      if (!r.href && !r.view) expect(r.sections?.length ?? 0, r.slug).toBeGreaterThan(0);
    }
  });

  it('keeps slugs unique', () => {
    for (const list of [ALL_FEATURES, ALL_SOLUTIONS, ALL_RESOURCES]) {
      const slugs = list.map((x) => x.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});
