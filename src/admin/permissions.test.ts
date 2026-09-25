import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLES, PERMISSIONS, ROLE_PERMISSIONS, isAdminRole, roleCan, roleCanAll, type AdminRole } from './permissions';
import { ADMIN_NAV } from './nav';

// The matrix in the migration that the database enforces.
function sqlMatrix(): Record<string, string[]> {
  const sql = readFileSync(fileURLToPath(new URL('../../supabase/migrations/0083_admin_platform.sql', import.meta.url)), 'utf8');
  const fn = sql.slice(sql.indexOf('create or replace function fp_admin_role_permissions'));
  const body = fn.slice(0, fn.indexOf('$$;'));
  const out: Record<string, string[]> = {};
  for (const m of body.matchAll(/when '(\w+)' then array\[([^\]]*)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/'([\w.]+)'/g)].map((x) => x[1]);
  }
  return out;
}

describe('admin permissions', () => {
  it('matches the database matrix exactly (migration 0083)', () => {
    const sql = sqlMatrix();
    expect(Object.keys(sql).sort()).toEqual([...ADMIN_ROLES].sort());
    for (const role of ADMIN_ROLES) {
      expect([...ROLE_PERMISSIONS[role]].sort(), role).toEqual([...sql[role]].sort());
    }
  });

  it('gives super admins everything', () => {
    for (const p of PERMISSIONS) expect(roleCan('super_admin', p)).toBe(true);
  });

  it('keeps billing, platform settings and the team away from admins', () => {
    expect(roleCan('admin', 'tenants.manage')).toBe(true);
    expect(roleCan('admin', 'users.manage')).toBe(true);
    for (const p of ['billing.view', 'billing.manage', 'platform.manage', 'security.manage', 'team.manage'] as const) {
      expect(roleCan('admin', p), p).toBe(false);
    }
  });

  it('lets support view tenants, impersonate and work tickets, but not change tenants', () => {
    expect(roleCan('support', 'tenants.view')).toBe(true);
    expect(roleCan('support', 'tenants.impersonate')).toBe(true);
    expect(roleCan('support', 'tickets.manage')).toBe(true);
    expect(roleCan('support', 'tenants.manage')).toBe(false);
    expect(roleCan('support', 'users.manage')).toBe(false);
  });

  it('limits analysts to dashboards and reports', () => {
    const allowed = PERMISSIONS.filter((p) => roleCan('analyst', p));
    expect(allowed).toEqual(['dashboard.view', 'reports.view']);
  });

  it('denies unknown and missing roles', () => {
    expect(roleCan(null, 'dashboard.view')).toBe(false);
    expect(roleCan(undefined, 'dashboard.view')).toBe(false);
    expect(roleCan('owner' as AdminRole, 'dashboard.view')).toBe(false);
    expect(isAdminRole('owner')).toBe(false);
    expect(isAdminRole('support')).toBe(true);
    expect(roleCanAll(null, [])).toBe(false);
    expect(roleCanAll('analyst', ['dashboard.view', 'reports.view'])).toBe(true);
    expect(roleCanAll('analyst', ['dashboard.view', 'tenants.view'])).toBe(false);
  });

  it('shows each role only the menu items it can open', () => {
    const visible = (role: AdminRole) => ADMIN_NAV.flatMap((g) => g.items).filter((i) => roleCan(role, i.permission)).map((i) => i.key);
    expect(visible('analyst')).toEqual(['overview', 'reports']);
    expect(visible('support')).not.toContain('billing');
    expect(visible('support')).toContain('tickets');
    expect(visible('admin')).not.toContain('settings');
    expect(visible('super_admin').length).toBe(ADMIN_NAV.flatMap((g) => g.items).length);
  });
});
