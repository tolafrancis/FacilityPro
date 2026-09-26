import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '../permissions';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const { otherActiveSuperAdmins } = await import('./team');

describe('otherActiveSuperAdmins', () => {
  const staff = [
    { user_id: 'a', role: 'super_admin' as const, disabled_at: null },
    { user_id: 'b', role: 'super_admin' as const, disabled_at: '2026-01-01' },
    { user_id: 'c', role: 'admin' as const, disabled_at: null },
  ];
  it('counts active super admins other than the one given', () => {
    expect(otherActiveSuperAdmins(staff, 'a')).toBe(0);
    expect(otherActiveSuperAdmins(staff, 'c')).toBe(1);
  });
});

describe('role matrix labels', () => {
  it('has a label for every permission in both languages', () => {
    for (const lng of ['en', 'vi']) {
      const perm = JSON.parse(readFileSync(`public/locales/${lng}/admin.json`, 'utf8')).team.perm as Record<string, string>;
      for (const p of PERMISSIONS) expect(perm[p.replace('.', '_')], `${lng} ${p}`).toBeTruthy();
    }
  });
});
