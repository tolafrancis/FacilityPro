import {
  Activity,
  BarChart3,
  Building2,
  CreditCard,
  Flag,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from './permissions';

export interface AdminNavItem {
  key: string;
  to: string;
  icon: LucideIcon;
  permission: Permission;
  /** Built yet? Unbuilt modules show as "coming soon". */
  ready: boolean;
}

export interface AdminNavGroup {
  key: string;
  items: AdminNavItem[];
}

/** The admin panel menu; each item appears only for roles that can open it. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    key: 'main',
    items: [{ key: 'overview', to: '/admin', icon: LayoutDashboard, permission: 'dashboard.view', ready: true }],
  },
  {
    key: 'customers',
    items: [
      { key: 'tenants', to: '/admin/tenants', icon: Building2, permission: 'tenants.view', ready: true },
      { key: 'users', to: '/admin/users', icon: Users, permission: 'users.view', ready: false },
      { key: 'billing', to: '/admin/billing', icon: CreditCard, permission: 'billing.view', ready: false },
      { key: 'tickets', to: '/admin/tickets', icon: LifeBuoy, permission: 'tickets.view', ready: false },
      { key: 'reports', to: '/admin/reports', icon: BarChart3, permission: 'reports.view', ready: false },
    ],
  },
  {
    key: 'platform',
    items: [
      { key: 'flags', to: '/admin/features', icon: Flag, permission: 'platform.manage', ready: false },
      { key: 'announcements', to: '/admin/announcements', icon: Megaphone, permission: 'announcements.manage', ready: false },
      { key: 'settings', to: '/admin/settings', icon: Settings2, permission: 'platform.manage', ready: false },
    ],
  },
  {
    key: 'security',
    items: [
      { key: 'audit', to: '/admin/audit', icon: ScrollText, permission: 'audit.view', ready: false },
      { key: 'security', to: '/admin/security', icon: ShieldCheck, permission: 'security.manage', ready: false },
      { key: 'monitoring', to: '/admin/monitoring', icon: Activity, permission: 'monitoring.view', ready: false },
      { key: 'team', to: '/admin/team', icon: UserCog, permission: 'team.manage', ready: false },
    ],
  },
];
