// Platform staff roles and permissions (admin panel).
//
// The database is the authority: fp_admin_role_permissions() in migration
// 0083 decides, and every policy and admin function checks it. This copy
// types the UI (hide/disable what a role can't do); permissions.test.ts
// checks it matches the migration exactly.

export const ADMIN_ROLES = ['super_admin', 'admin', 'support', 'analyst'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PERMISSIONS = [
  'dashboard.view',
  'tenants.view',
  'tenants.manage',
  'tenants.impersonate',
  'users.view',
  'users.manage',
  'billing.view',
  'billing.manage',
  'tickets.view',
  'tickets.manage',
  'reports.view',
  'platform.manage',
  'announcements.manage',
  'audit.view',
  'security.manage',
  'monitoring.view',
  'team.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: [
    'dashboard.view', 'tenants.view', 'tenants.manage', 'users.view', 'users.manage',
    'tickets.view', 'reports.view', 'announcements.manage', 'audit.view', 'monitoring.view',
  ],
  support: ['dashboard.view', 'tenants.view', 'tenants.impersonate', 'users.view', 'tickets.view', 'tickets.manage'],
  analyst: ['dashboard.view', 'reports.view'],
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Whether a role may do something. Unknown or missing roles may do nothing. */
export function roleCan(role: AdminRole | null | undefined, permission: Permission): boolean {
  return isAdminRole(role) && ROLE_PERMISSIONS[role].includes(permission);
}

/** Whether a role has every one of the permissions (empty list: any staff). */
export function roleCanAll(role: AdminRole | null | undefined, permissions: readonly Permission[]): boolean {
  return !!role && permissions.every((p) => roleCan(role, p));
}
