import { NavLink, Outlet } from 'react-router-dom';
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
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
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

const NAV: NavItem[] = [
  { to: '/', key: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/my-work', key: 'myWork', icon: Hammer },
  { to: '/requests', key: 'requests', icon: ClipboardList },
  { to: '/work-orders', key: 'workOrders', icon: Wrench },
  { to: '/approvals', key: 'approvals', icon: ClipboardCheck },
  { to: '/inbox', key: 'inbox', icon: MessageSquare },
  { to: '/maintenance', key: 'maintenance', icon: CalendarClock },
  { to: '/checklists', key: 'checklists', icon: ListChecks },
  { to: '/parts', key: 'parts', icon: Package },
  { to: '/assets', key: 'assets', icon: Boxes },
  { to: '/vendors', key: 'vendors', icon: Building2 },
  { to: '/devices', key: 'devices', icon: Cpu },
  { to: '/reports', key: 'reports', icon: BarChart3 },
  { to: '/locations', key: 'locations', icon: MapPin },
  { to: '/security', key: 'security', icon: ShieldCheck },
  { to: '/billing', key: 'billing', icon: CreditCard },
  { to: '/settings', key: 'settings', icon: Settings },
];

export default function AppShell() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { currentOrg, role } = useOrg();

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-60 flex-col border-r border-line bg-white lg:flex">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-bold text-white">
            F
          </div>
          <span className="font-semibold text-ink">{t('app.name')}</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map(({ to, key, icon: Icon, end, disabled }) =>
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
        </nav>
        <button
          type="button"
          onClick={() => void signOut()}
          className="m-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-surface hover:text-ink"
        >
          <LogOut size={18} aria-hidden />
          {t('actions.signOut')}
        </button>
      </aside>

      <div className="flex flex-1 flex-col">
        <OfflineBanner />
        <header className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{currentOrg?.name}</p>
            {role && <p className="text-xs text-ink-muted">{t(`roles.${role}`)}</p>}
          </div>
          <div className="flex items-center gap-3">
            <SyncIndicator />
            <NotificationBell />
            <LanguageSwitcher />
          </div>
        </header>
        <main className="flex-1 overflow-auto px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
