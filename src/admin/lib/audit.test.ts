import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const { diffRecords } = await import('./audit');
const { cohortPct, heatStep } = await import('./analytics');

describe('audit diff', () => {
  it('marks changed, added and removed fields and hides noise', () => {
    const d = diffRecords({ status: 'active', plan: 'pro', updated_at: 'a', old: 1 }, { status: 'suspended', plan: 'pro', updated_at: 'b', reason: 'x' });
    expect(d.map((x) => [x.field, x.kind])).toEqual([['old', 'removed'], ['plan', 'same'], ['reason', 'added'], ['status', 'changed']]);
  });
  it('copes with missing sides', () => {
    expect(diffRecords(null, { a: 1 })).toEqual([{ field: 'a', before: undefined, after: 1, kind: 'added' }]);
    expect(diffRecords(null, null)).toEqual([]);
  });
});

describe('cohorts', () => {
  it('turns counts into shares and shades', () => {
    expect(cohortPct(3, 4)).toBe(75);
    expect(cohortPct(0, 0)).toBeNull();
    expect([heatStep(null), heatStep(5), heatStep(45), heatStep(100)]).toEqual([-1, 0, 2, 4]);
  });
});
