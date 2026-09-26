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
  PlusCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Users,
  Sparkles,
  Building,
  Landmark,
  Workflow,
  Star,
  Armchair,
  DoorOpen,
  Menu,
  X,
  type LucideIcon,
  LifeBuoy,
} from 'lucide-react';
import { hiddenNavKeys, useOrgFlags } from '../lib/platform';
import { AnnouncementBar, ModuleGate } from './PlatformNotices';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import type { Role } from '../lib/database.types';
import LanguageSwitcher from './LanguageSwitcher';
import NotificationBell from './NotificationBell';
import { orgLogoUrl } from '../lib/orgLogo';
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
// (fp_finance_* tables) — hiding them for other roles avoids a
// dead-end click into a page that will just come back empty.
const ADMIN_MANAGER_ONLY_KEYS = new Set([
  'financial',
  'approvals',
  'workflows',
  'surveys',
  'reports',
  'billing',
  'settings',
]);

// Customer conversations (names, phone numbers) are staff-only (0064).
// Devices: technicians see live data, alerts and history (0077); keys and
// configuration stay admin/manager-only inside the page.
const STAFF_ONLY_KEYS = new Set(['inbox', 'devices']);

function isNavItemVisible(key: string, role: Role | null): boolean {
  if (STAFF_ONLY_KEYS.has(key)) return role === 'org_admin' || role === 'manager' || role === 'technician';
  if (!ADMIN_MANAGER_ONLY_KEYS.has(key)) return true;
  return role === 'org_admin' || role === 'manager';
}

// Tenants (occupants) get their own short menu: report a fault and follow
// their requests. The staff data behind the other pages is closed to them
// (0081), and App.tsx only routes them to these pages.
const OCCUPANT_NAV: NavGroup[] = [
  {
    title: 'tenant',
    items: [
      { to: '/', key: 'home', icon: LayoutDashboard, end: true },
      { to: '/requests/new', key: 'reportFault', icon: PlusCircle, end: true },
      { to: '/requests', key: 'myRequests', icon: ClipboardList, end: true },
    ],
  },
];

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
      { to: '/documents', key: 'documents', icon: FileText },
      { to: '/permits', key: 'permits', icon: ShieldCheck },
      { to: '/attendance', key: 'attendance', icon: Users },
      { to: '/tenant-experience', key: 'tenantExperience', icon: Building },
    ],
  },
  {
    title: 'finance',
    items: [
      { to: '/financial', key: 'financial', icon: Landmark },
      { to: '/billing', key: 'billing', icon: CreditCard },
    ],
  },
  {
    title: 'ai',
    items: [
      { to: '/smart-assistant', key: 'smartAssistant', icon: Sparkles },
      { to: '/settings', key: 'settings', icon: Settings },
      { to: '/support', key: 'support', icon: LifeBuoy },
    ],
  },
];

export default function AppShell() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { currentOrg, role } = useOrg();
  const isOccupant = role === 'occupant';
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    tenant: true,
    maintenance: true,
    operations: true,
    finance: true,
    ai: false,
  });

  const toggleGroup = (group: string) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  // Modules switched off for this organisation in the admin panel (0088).
  const hiddenByModule = hiddenNavKeys(useOrgFlags().data);
  const visibleNavGroups = isOccupant
    ? OCCUPANT_NAV
    : NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => isNavItemVisible(item.key, role) && !hiddenByModule.has(item.key)),
      })).filter((group) => group.items.length > 0);

  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const logo = orgLogoUrl(currentOrg?.logo_path);

  // Phone tab bar: the four most-used destinations this role can open, then
  // "Menu" for everything else.
  const tabs = isOccupant ? OCCUPANT_NAV[0].items : [
    { to: '/', key: 'dashboard', icon: LayoutDashboard, end: true },
    { to: '/requests', key: 'requests', icon: ClipboardList },
    role === 'technician'
      ? { to: '/my-work', key: 'myWork', icon: Hammer }
      : { to: '/work-orders', key: 'workOrders', icon: Wrench },
    { to: '/assets', key: 'assets', icon: Boxes },
  ].filter((tab) => isNavItemVisible(tab.key, role) && !hiddenByModule.has(tab.key) && (tab.key !== 'workOrders' || role === 'org_admin' || role === 'manager'));
  // /requests/:id belongs under "My requests" for tenants.
  const tenantRequestDetail = isOccupant && /^\/requests\/(?!new$)[^/]+$/.test(location.pathname);

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
      <div className="flex items-center gap-2 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] lg:pt-4">
        {logo ? (
          <img src={logo} alt="" className="h-8 w-8 rounded-lg border border-line object-contain" />
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-bold text-white">F</div>
        )}
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
                className="mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted hover:bg-surface"
              >
                <span className="leading-snug">{t(`navGroups.${group.title}`)}</span>
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
                          `flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition lg:min-h-0 ${
                            isActive || (key === 'myRequests' && tenantRequestDetail)
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

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 lg:static lg:pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t('actions.openMenu')}
              aria-controls="mobile-nav"
              aria-expanded={mobileNavOpen}
              className="-ml-2 grid h-11 w-11 place-items-center rounded-lg text-ink hover:bg-surface lg:hidden"
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
        <main className="flex-1 overflow-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:pb-6 lg:pt-6">
          <AnnouncementBar />
          <ModuleGate>
            <Outlet />
          </ModuleGate>
        </main>

        <nav
          aria-label={t('nav.mobileTabs')}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
            {tabs.map(({ to, key, icon: Icon, end }) => (
              <li key={key}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive || (key === 'myRequests' && tenantRequestDetail) ? 'text-brand-600' : 'text-ink-muted'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive || (key === 'myRequests' && tenantRequestDetail) ? 'bg-brand-50' : ''}`}>
                        <Icon size={20} aria-hidden />
                      </span>
                      <span className="max-w-full truncate px-1">{t(`nav.${key}`)}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-controls="mobile-nav"
                aria-expanded={mobileNavOpen}
                className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-muted"
              >
                <span className="grid h-7 w-12 place-items-center rounded-full">
                  <Menu size={20} aria-hidden />
                </span>
                {t('nav.menu')}
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
