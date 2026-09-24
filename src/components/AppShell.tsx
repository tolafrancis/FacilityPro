import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  MapPin,
  Boxes,
  ClipboardList,
  Wrench,
  Hammer,
  CalendarClock,
  ListChecks,
  Package,
  Building2,
  BarChart3,
  ClipboardCheck,
  MessageSquare,
  Cpu,
  CreditCard,
  ShieldCheck,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  FileText,
  Users,
  Sparkles,
  Building,
  Bell,
  Landmark,
  Workflow,
  Star,
  Armchair,
  DoorOpen,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import type { Role } from '../lib/database.types';
import LanguageSwitcher from './LanguageSwitcher';
import NotificationBell from './NotificationBell';
import OfflineBanner from './OfflineBanner';
import SyncIndicator from './SyncIndicator';

interface NavItem {
  to: string;
  key: string;
  icon: LucideIcon;
  end?: boolean;
  disabled?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// Nav items whose underlying data is admin/manager-only at the RLS layer
// (fp_finance_* tables, fp_devices) — hiding them for other roles avoids a
// dead-end click into a page that will just come back empty.
const ADMIN_MANAGER_ONLY_KEYS = new Set(['financial', 'devices']);

function isNavItemVisible(key: string, role: Role | null): boolean {
  if (!ADMIN_MANAGER_ONLY_KEYS.has(key)) return true;
  return role === 'org_admin' || role === 'manager';
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'maintenance',
    items: [
      { to: '/', key: 'dashboard', icon: LayoutDashboard, end: true },
      { to: '/requests', key: 'requests', icon: ClipboardList },
      { to: '/work-orders', key: 'workOrders', icon: Wrench },
      { to: '/my-work', key: 'myWork', icon: Hammer },
      { to: '/maintenance', key: 'maintenance', icon: CalendarClock },
      { to: '/checklists', key: 'checklists', icon: ListChecks },
      { to: '/surveys', key: 'surveys', icon: Star },
      { to: '/assets', key: 'assets', icon: Boxes },
      { to: '/parts', key: 'parts', icon: Package },
      { to: '/vendors', key: 'vendors', icon: Building2 },
      { to: '/locations', key: 'locations', icon: MapPin },
      { to: '/workflows', key: 'workflows', icon: Workflow },
    ],
  },
  {
    title: 'operations',
    items: [
      { to: '/approvals', key: 'approvals', icon: ClipboardCheck },
      { to: '/inbox', key: 'inbox', icon: MessageSquare },
      { to: '/devices', key: 'devices', icon: Cpu },
      { to: '/desks', key: 'desks', icon: Armchair },
      { to: '/facilities', key: 'facilities', icon: DoorOpen },
      { to: '/reports', key: 'reports', icon: BarChart3 },
      { to: '/security', key: 'security', icon: ShieldCheck },
      { to: '/billing', key: 'billing', icon: CreditCard },
      { to: '/documents', key: 'documents', icon: FileText },
      { to: '/permits', key: 'permits', icon: ShieldCheck },
      { to: '/attendance', key: 'attendance', icon: Users },
      { to: '/tenant-experience', key: 'tenantExperience', icon: Building },
      { to: '/tenant-experience', key: 'broadcasts', icon: Bell },
    ],
  },
  {
    title: 'finance',
    items: [
      { to: '/financial', key: 'financial', icon: Landmark },
      { to: '/billing', key: 'billing', icon: CreditCard },
      { to: '/vendors', key: 'vendors', icon: Building2 },
    ],
  },
  {
    title: 'ai',
    items: [
      { to: '/smart-assistant', key: 'smartAssistant', icon: Sparkles },
      { to: '/settings', key: 'settings', icon: Settings },
    ],
  },
];

export default function AppShell() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { currentOrg, role } = useOrg();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    maintenance: true,
    operations: true,
    finance: true,
    ai: false,
  });

  const toggleGroup = (group: string) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const visibleNavGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isNavItemVisible(item.key, role)),
  })).filter((group) => group.items.length > 0);

  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Close on Escape and lock background scroll while the drawer is open.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileNavOpen]);

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2 px-5 py-4">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-bold text-white">
          F
        </div>
        <span className="font-semibold text-ink">{t('app.name')}</span>
      </div>
      <nav className="flex-1 space-y-2 px-3 py-2">
        {visibleNavGroups.map((group) => {
          const isOpen = openGroups[group.title];
          return (
            <div key={group.title}>
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                className="mb-1 flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted"
              >
                <span>{t(`navGroups.${group.title}`)}</span>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {isOpen && (
                <div className="space-y-1">
                  {group.items.map(({ to, key, icon: Icon, end, disabled }) =>
                    disabled ? (
                      <span
                        key={key}
                        title={t('comingSoon')}
                        className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted/50"
                      >
                        <Icon size={18} aria-hidden />
                        {t(`nav.${key}`)}
                      </span>
                    ) : (
                      <NavLink
                        key={key}
                        to={to}
                        end={end}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                            isActive
                              ? 'bg-brand-50 text-brand-600'
                              : 'text-ink hover:bg-surface'
                          }`
                        }
                      >
                        <Icon size={18} aria-hidden />
                        {t(`nav.${key}`)}
                      </NavLink>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={() => void signOut()}
        className="m-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-surface hover:text-ink"
      >
        <LogOut size={18} aria-hidden />
        {t('actions.signOut')}
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-60 flex-col border-r border-line bg-white lg:flex">
        {sidebarContent}
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            aria-hidden
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            id="mobile-nav"
            onClick={(e) => {
              // Close after tapping a link, even one to the current page.
              if ((e.target as HTMLElement).closest('a')) setMobileNavOpen(false);
            }}
            className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl"
          >
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label={t('actions.closeMenu')}
              className="absolute right-3 top-3 rounded-lg p-2 text-ink-muted hover:bg-surface hover:text-ink"
            >
              <X size={20} aria-hidden />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <OfflineBanner />
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t('actions.openMenu')}
              aria-controls="mobile-nav"
              aria-expanded={mobileNavOpen}
              className="-ml-2 rounded-lg p-2 text-ink hover:bg-surface lg:hidden"
            >
              <Menu size={22} aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{currentOrg?.name}</p>
              {role && <p className="text-xs text-ink-muted">{t(`roles.${role}`)}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SyncIndicator />
            <NotificationBell />
            <LanguageSwitcher />
          </div>
        </header>
        <main className="flex-1 overflow-auto px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
