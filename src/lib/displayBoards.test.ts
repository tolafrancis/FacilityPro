import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

const { boardColumns, changedRefs, isOnline, pages } = await import('./displayBoards');
type WO = Parameters<typeof changedRefs>[1][number];

const wo = (ref: string, status: WO['status'], done_at: string | null = null): WO => ({
  ref, title: ref, status, priority: 'medium', due_at: null, overdue: false,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', done_at,
});

describe('boardColumns', () => {
  const orders = [wo('A', 'open'), wo('B', 'in_progress'), wo('C', 'resolved', '2026-01-01T01:00:00Z'), wo('D', 'closed', '2026-01-01T02:00:00Z'), wo('E', 'assigned')];
  it('groups statuses into the columns the board includes', () => {
    const cols = boardColumns(['open', 'assigned', 'in_progress', 'resolved', 'closed'], orders);
    expect(cols.map((c) => c.key)).toEqual(['new', 'in_progress', 'done']);
    expect(cols[0].orders.map((o) => o.ref)).toEqual(['A', 'E']);
  });
  it('shows the most recently finished first', () => {
    const done = boardColumns(['resolved', 'closed'], orders).find((c) => c.key === 'done')!;
    expect(done.orders.map((o) => o.ref)).toEqual(['D', 'C']);
  });
});

describe('changedRefs', () => {
  it('flags new and moved work orders, not the first load', () => {
    expect(changedRefs(undefined, [wo('A', 'open')]).size).toBe(0);
    const next = [wo('A', 'in_progress'), wo('B', 'open'), wo('C', 'open')];
    expect([...changedRefs([wo('A', 'open'), wo('C', 'open')], next)].sort()).toEqual(['A', 'B']);
  });
});

describe('helpers', () => {
  it('pages items', () => {
    expect(pages([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(pages([], 3)).toEqual([[]]);
  });
  it('treats a screen seen in the last 3 minutes as online', () => {
    const now = Date.parse('2026-01-01T00:10:00Z');
    expect(isOnline('2026-01-01T00:08:00Z', now)).toBe(true);
    expect(isOnline('2026-01-01T00:05:00Z', now)).toBe(false);
    expect(isOnline(null, now)).toBe(false);
  });
});
