import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bell,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAdmin } from '../AdminContext';
import { ADMIN_NAV } from '../nav';
import { useRecentEvents, useTenantSearch } from '../lib/queries';
import { eventLabel, eventTone, timeAgo } from '../lib/format';
import { Badge } from './ui';

const COLLAPSE_KEY = 'fp.admin.sidebarCollapsed';
const SEEN_KEY = 'fp.admin.eventsSeenAt';

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* per-browser preference only */
  }
}

/** Closes a popover on outside click / Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export default function AdminShell() {
  const { t } = useTranslation('admin');
  const { can } = useAdmin();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => readStorage(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const groups = ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.permission)) })).filter((g) => g.items.length);

  const nav = (compact: boolean) => (
    <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-3" aria-label={t('nav.label')}>
      {groups.map((g) => (
        <div key={g.key}>
          {!compact && g.key !== 'main' && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t(`nav.groups.${g.key}`)}</p>
          )}
          <ul className="space-y-0.5">
            {g.items.map(({ key, to, icon: Icon, ready }) => (
              <li key={key}>
                <NavLink
                  to={to}
                  end={to === '/admin'}
                  title={compact ? t(`nav.items.${key}`) : undefined}
                  className={({ isActive }) =>
                    `flex h-9 items-center gap-3 rounded-md px-3 text-sm transition ${
                      isActive ? 'bg-ink/[0.07] font-medium text-ink' : 'text-ink-muted hover:bg-ink/5 hover:text-ink'
                    } ${compact ? 'justify-center px-0' : ''}`
                  }
                >
                  <Icon size={17} aria-hidden className="shrink-0" />
                  {!compact && <span className="flex-1 truncate">{t(`nav.items.${key}`)}</span>}
                  {!compact && !ready && <span className="text-[10px] uppercase tracking-wide text-ink-muted/70">{t('soon')}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (compact: boolean) => (
    <div className={`flex h-14 shrink-0 items-center gap-2 border-b border-line px-4 ${compact ? 'justify-center px-0' : ''}`}>
      <div className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm font-bold text-white">F</div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-ink">FacilityPro</p>
          <p className="text-[11px] text-ink-muted">{t('consoleName')}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-surface text-ink">
      {/* Desktop sidebar */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-panel transition-[width] lg:flex ${collapsed ? 'w-16' : 'w-60'}`}>
        {brand(collapsed)}
        {nav(collapsed)}
        <div className="border-t border-line p-2">
          <button
            type="button"
            onClick={() => {
              setCollapsed((c) => !c);
              writeStorage(COLLAPSE_KEY, collapsed ? '0' : '1');
            }}
            className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink ${collapsed ? 'justify-center px-0' : ''}`}
            aria-label={collapsed ? t('expand') : t('collapse')}
          >
            {collapsed ? <ChevronsRight size={17} aria-hidden /> : <ChevronsLeft size={17} aria-hidden />}
            {!collapsed && t('collapse')}
          </button>
        </div>
      </aside>

      {/* Phone / tablet drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.label')}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-panel shadow-xl">
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-2 top-3 grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-ink/5" aria-label={t('closeMenu')}>
              <X size={18} aria-hidden />
            </button>
            {brand(false)}
            {nav(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-panel/90 px-3 backdrop-blur sm:px-5">
          <button type="button" onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-md text-ink hover:bg-ink/5 lg:hidden" aria-label={t('openMenu')}>
            <Menu size={19} aria-hidden />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <Notifications />
            <ProfileMenu />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const { t } = useTranslation('admin');
  const { can } = useAdmin();
  const navigate = useNavigate();
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tenants = useTenantSearch(q, open && can('tenants.view'));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const pages = ADMIN_NAV.flatMap((g) => g.items)
    .filter((i) => can(i.permission))
    .filter((i) => q.trim() && t(`nav.items.${i.key}`).toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 5);

  const go = (to: string) => {
    setOpen(false);
    setQ('');
    navigate(to);
  };

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        className="h-9 w-full rounded-md border border-line bg-surface pl-9 pr-14 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:bg-panel focus:outline-none focus:ring-2 focus:ring-brand/20 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-ink-muted sm:block">⌘K</kbd>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          {pages.length > 0 && (
            <Section title={t('search.pages')}>
              {pages.map((p) => (
                <ResultButton key={p.key} onClick={() => go(p.to)} icon={<p.icon size={15} aria-hidden />}>
                  {t(`nav.items.${p.key}`)}
                </ResultButton>
              ))}
            </Section>
          )}
          {can('tenants.view') && (
            <Section title={t('search.tenants')}>
              {tenants.isLoading ? (
                <p className="px-3 py-2 text-xs text-ink-muted">{t('loading')}</p>
              ) : (tenants.data ?? []).length === 0 ? (
                <p className="px-3 py-2 text-xs text-ink-muted">{t('search.noTenants')}</p>
              ) : (
                (tenants.data ?? []).map((o) => (
                  <ResultButton key={o.id} onClick={() => go(`/admin/tenants/${o.id}`)} icon={<Building2 size={15} aria-hidden />}>
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.deleted_at ? <Badge tone="neutral">{t('status.deleted')}</Badge> : o.suspended_at ? <Badge tone="crit">{t('status.suspended')}</Badge> : null}
                  </ResultButton>
                ))
              )}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-line py-1 last:border-0">
      <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      {children}
    </div>
  );
}

function ResultButton({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-ink/5">
      <span className="text-ink-muted">{icon}</span>
      {children}
    </button>
  );
}

function Notifications() {
  const { t, i18n } = useTranslation('admin');
  const { open, setOpen, ref } = usePopover();
  const events = useRecentEvents(12);
  const [seenAt, setSeenAt] = useState(() => readStorage(SEEN_KEY) ?? '');
  const unread = (events.data ?? []).filter((e) => e.at > seenAt).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open && events.data?.[0]) {
            setSeenAt(events.data[0].at);
            writeStorage(SEEN_KEY, events.data[0].at);
          }
        }}
        className="relative grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink"
        aria-label={unread ? t('notifications.unread', { count: unread }) : t('notifications.title')}
        aria-expanded={open}
      >
        <Bell size={18} aria-hidden />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand ring-2 ring-panel" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          <p className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">{t('notifications.title')}</p>
          <ul className="max-h-96 overflow-y-auto">
            {events.isLoading && <li className="px-4 py-3 text-xs text-ink-muted">{t('loading')}</li>}
            {!events.isLoading && (events.data ?? []).length === 0 && <li className="px-4 py-6 text-center text-xs text-ink-muted">{t('notifications.empty')}</li>}
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="border-b border-line px-4 py-2.5 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={eventTone(e.type)}>{eventLabel(e.type, t)}</Badge>
                  <span className="text-[11px] text-ink-muted">{timeAgo(e.at, i18n.resolvedLanguage ?? 'en')}</span>
                </div>
                <p className="mt-1 truncate text-sm text-ink">{e.fp_organizations?.name ?? '—'}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { t } = useTranslation('admin');
  const { user, signOut } = useAuth();
  const { role, theme, setTheme } = useAdmin();
  const { open, setOpen, ref } = usePopover();
  const name = (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email || '';
  const themes = [
    { key: 'light', icon: Sun },
    { key: 'dark', icon: Moon },
    { key: 'system', icon: Monitor },
  ] as const;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-2 rounded-md px-1.5 hover:bg-ink/5"
        aria-label={t('profile.menu')}
        aria-expanded={open}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand-600 dark:text-brand">
          {name.slice(0, 1).toUpperCase()}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-lg border border-line bg-panel p-1 shadow-xl">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            {role && <p className="mt-1"><Badge tone="brand">{t(`roles.${role}`)}</Badge></p>}
          </div>
          <div className="border-t border-line px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t('profile.theme')}</p>
            <div role="radiogroup" aria-label={t('profile.theme')} className="grid grid-cols-3 gap-1 rounded-md bg-surface p-0.5">
              {themes.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={theme === key}
                  onClick={() => setTheme(key)}
                  className={`flex items-center justify-center gap-1 rounded px-2 py-1 text-xs ${theme === key ? 'bg-panel font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                >
                  <Icon size={13} aria-hidden /> {t(`profile.themes.${key}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-line pt-1">
            <Link to="/" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-ink/5">
              <ArrowLeft size={15} aria-hidden /> {t('profile.backToApp')}
            </Link>
            <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-ink/5">
              <LogOut size={15} aria-hidden /> {t('profile.signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
