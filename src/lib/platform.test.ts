import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('./queries', () => ({ useOrgId: () => null }));

const { hiddenNavKeys, offModuleForPath, offModules } = await import('./platform');

describe('module switches', () => {
  const flags = { iot: false, work_orders: true, space_booking: false, new_dashboard: false };
  it('lists only modules that are switched off', () => {
    expect(offModules(flags).sort()).toEqual(['iot', 'space_booking']);
    expect(offModules(undefined)).toEqual([]);
  });
  it('hides their menu items', () => {
    expect([...hiddenNavKeys(flags)].sort()).toEqual(['desks', 'devices', 'facilities']);
  });
  it('finds the module of a page, including sub-pages', () => {
    expect(offModuleForPath('/devices/123', flags)).toBe('iot');
    expect(offModuleForPath('/desks', flags)).toBe('space_booking');
    expect(offModuleForPath('/devicesx', flags)).toBeNull();
    expect(offModuleForPath('/work-orders', flags)).toBeNull();
  });
});
