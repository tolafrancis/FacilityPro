import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { FEATURE_GROUPS, RESOURCES, SOLUTION_COLUMNS, resourceHref, type Resource } from './content';

type MenuKey = 'features' | 'resources' | 'solutions';

/** Public site header (mega menus) and footer, shared by the landing and marketing pages. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="FacilityPro home">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-lg font-bold text-white">F</span>
      <span className="text-xl font-semibold tracking-tight text-ink">Facility<span className="text-brand">Pro</span></span>
    </Link>
  );
}

/** "email + Start free trial": carries the address into sign-up. */
export function TrialForm({ size = 'md', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  const navigate = useNavigate();
  const id = useId();
  const [email, setEmail] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    navigate(v ? `/signup?email=${encodeURIComponent(v)}` : '/signup');
  };
  const h = size === 'lg' ? 'h-14 text-base' : 'h-11 text-sm';
  return (
    <form onSubmit={submit} className={`flex w-full max-w-md ${className}`}>
      <label htmlFor={id} className="sr-only">Work email</label>
      <input
        id={id}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Work email"
        autoComplete="email"
        className={`${h} min-w-0 flex-1 rounded-l-xl border border-r-0 border-line bg-white px-4 text-ink placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20`}
      />
      <button type="submit" className={`${h} shrink-0 rounded-r-xl border border-brand bg-white px-4 font-semibold uppercase tracking-wide text-brand transition hover:bg-brand hover:text-white`}>
        Start free trial
      </button>
    </form>
  );
}

function MarketingHeader() {
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [mobile, setMobile] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const location = useLocation();
  const headerRef = useRef<HTMLElement>(null);

  // Close menus on navigation, Escape and clicks outside.
  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [location.pathname, location.hash]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setOpen(null), setMobile(false));
    const onDown = (e: MouseEvent) => headerRef.current && !headerRef.current.contains(e.target as Node) && setOpen(null);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);
  useEffect(() => {
    document.body.style.overflow = mobile ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobile]);

  // Hover opens; a click right after (the same gesture) must not close it.
  const openedAt = useRef(0);
  const enter = (k: MenuKey) => {
    clearTimeout(closeTimer.current);
    if (open !== k) openedAt.current = Date.now();
    setOpen(k);
  };
  const click = (k: MenuKey) => {
    clearTimeout(closeTimer.current);
    if (open === k && Date.now() - openedAt.current > 500) setOpen(null);
    else {
      if (open !== k) openedAt.current = Date.now();
      setOpen(k);
    }
  };
  const leave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), 150);
  };
  const trigger = (k: MenuKey, label: string) => (
    <button
      type="button"
      aria-expanded={open === k}
      aria-haspopup="true"
      onClick={() => click(k)}
      onMouseEnter={() => enter(k)}
      onMouseLeave={leave}
      className={`inline-flex items-center gap-1 py-2 text-[15px] font-semibold transition ${open === k ? 'text-brand' : 'text-ink/75 hover:text-brand'}`}
    >
      {label}
      <ChevronDown size={15} className={`transition ${open === k ? 'rotate-180' : ''}`} aria-hidden />
    </button>
  );

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-line/70 bg-white/95 backdrop-blur">
      <div className="relative mx-auto flex h-20 max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          <Link to="/#pricing" className="py-2 text-[15px] font-semibold text-ink/75 transition hover:text-brand">Pricing</Link>
          {trigger('features', 'Features')}
          {trigger('resources', 'Resources')}
          {trigger('solutions', 'Solutions')}
          <Link to="/signin" className="py-2 text-[15px] font-semibold text-ink/75 transition hover:text-brand">Sign in</Link>
        </nav>
        <div className="ml-auto hidden xl:block"><TrialForm /></div>
        <Link to="/signup" className="ml-auto hidden rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 lg:inline-flex xl:hidden">
          Start free trial
        </Link>
        <button type="button" onClick={() => setMobile(true)} className="ml-auto grid h-11 w-11 place-items-center rounded-lg text-ink hover:bg-surface lg:hidden" aria-label="Open menu">
          <Menu size={24} aria-hidden />
        </button>

        {open && (
          <div
            className="absolute left-4 right-4 top-full z-40 -mt-2 hidden justify-center lg:flex"
            onMouseEnter={() => clearTimeout(closeTimer.current)}
            onMouseLeave={leave}
          >
            {open === 'features' && <FeaturesPanel />}
            {open === 'resources' && <ResourcesPanel />}
            {open === 'solutions' && <SolutionsPanel />}
          </div>
        )}
      </div>
      {/* A portal: the header's backdrop blur would otherwise trap this fixed overlay inside it. */}
      {mobile && createPortal(<MobileMenu onClose={() => setMobile(false)} />, document.body)}
    </header>
  );
}

const panel = 'rounded-xl border border-line bg-white shadow-[0_18px_50px_-12px_rgba(15,23,42,0.25)]';
const itemLink = 'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-ink transition hover:bg-brand/5 hover:text-brand';

function FeaturesPanel() {
  const [group, setGroup] = useState(FEATURE_GROUPS[0].key);
  const g = FEATURE_GROUPS.find((x) => x.key === group) ?? FEATURE_GROUPS[0];
  return (
    <div className={`${panel} flex w-full max-w-5xl overflow-hidden`} role="region" aria-label="Features">
      <ul className="w-56 shrink-0 border-r border-line py-4" role="tablist" aria-orientation="vertical">
        {FEATURE_GROUPS.map((x) => (
          <li key={x.key}>
            <button
              type="button"
              role="tab"
              aria-selected={x.key === group}
              onMouseEnter={() => setGroup(x.key)}
              onFocus={() => setGroup(x.key)}
              onClick={() => setGroup(x.key)}
              className={`flex w-full items-center gap-2 border-r-2 px-5 py-3 text-left text-sm transition ${
                x.key === group ? 'border-brand font-semibold text-brand' : 'border-transparent text-ink/80 hover:text-brand'}`}
            >
              {x.label}
              {x.badge && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{x.badge}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="grid flex-1 content-start gap-x-4 gap-y-0.5 p-5 sm:grid-cols-2 xl:grid-cols-3" role="tabpanel">
        {g.items.map((f) => (
          <Link key={f.slug} to={`/features/${f.slug}`} className={itemLink}>
            <f.icon size={19} className="shrink-0 text-brand" aria-hidden />
            <span>{f.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ResourceLink({ r }: { r: Resource }) {
  return (
    <Link to={resourceHref(r)} className={itemLink}>
      <r.icon size={19} className="shrink-0 text-brand" aria-hidden />
      <span>{r.title}</span>
    </Link>
  );
}

function ResourcesPanel() {
  return (
    <div className={`${panel} grid w-full max-w-4xl gap-x-4 p-5 sm:grid-cols-3`} role="region" aria-label="Resources">
      {RESOURCES.map((col, i) => (
        <div key={i} className="space-y-0.5">
          {col.map((r) => <ResourceLink key={r.slug} r={r} />)}
        </div>
      ))}
    </div>
  );
}

function SolutionsPanel() {
  return (
    <div className={`${panel} grid w-full max-w-4xl gap-x-6 p-6 sm:grid-cols-3`} role="region" aria-label="Solutions">
      {SOLUTION_COLUMNS.map((c) => (
        <div key={c.key}>
          <p className="mb-2 border-b-2 pb-2 text-sm font-semibold" style={{ color: c.color, borderColor: '#E5E7EB' }}>{c.label}</p>
          <div className="space-y-0.5">
            {c.items.map((s) => (
              <Link key={s.slug} to={`/solutions/${s.slug}`} className={itemLink}>
                <s.icon size={18} className="shrink-0 text-brand" aria-hidden />
                <span>{s.title}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<MenuKey | null>(null);
  const toggle = (k: MenuKey) => setSection((s) => (s === k ? null : k));
  const head = (k: MenuKey, label: string) => (
    <button type="button" aria-expanded={section === k} onClick={() => toggle(k)}
      className="flex w-full items-center justify-between py-4 text-left text-lg font-semibold text-ink">
      {label}
      <ChevronDown size={20} className={`transition ${section === k ? 'rotate-180 text-brand' : ''}`} aria-hidden />
    </button>
  );
  const small = 'flex items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] text-ink hover:bg-brand/5';
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="flex h-20 items-center justify-between border-b border-line px-4 sm:px-6">
        <Logo />
        <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-surface" aria-label="Close menu">
          <X size={24} aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <div className="divide-y divide-line">
          <Link to="/#pricing" className="block py-4 text-lg font-semibold text-ink">Pricing</Link>
          <div>
            {head('features', 'Features')}
            {section === 'features' && (
              <div className="space-y-4 pb-4">
                {FEATURE_GROUPS.map((g) => (
                  <div key={g.key}>
                    <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-brand">{g.label}</p>
                    {g.items.map((f) => (
                      <Link key={f.slug} to={`/features/${f.slug}`} className={small}>
                        <f.icon size={18} className="text-brand" aria-hidden />{f.title}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            {head('resources', 'Resources')}
            {section === 'resources' && (
              <div className="pb-4">
                {RESOURCES.flat().map((r) => (
                  <Link key={r.slug} to={resourceHref(r)} className={small}><r.icon size={18} className="text-brand" aria-hidden />{r.title}</Link>
                ))}
              </div>
            )}
          </div>
          <div>
            {head('solutions', 'Solutions')}
            {section === 'solutions' && (
              <div className="space-y-4 pb-4">
                {SOLUTION_COLUMNS.map((c) => (
                  <div key={c.key}>
                    <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide" style={{ color: c.color }}>{c.label}</p>
                    {c.items.map((s) => (
                      <Link key={s.slug} to={`/solutions/${s.slug}`} className={small}><s.icon size={18} className="text-brand" aria-hidden />{s.title}</Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Link to="/signin" className="block py-4 text-lg font-semibold text-ink">Sign in</Link>
        </div>
        <TrialForm className="mt-4" />
      </div>
    </div>
  );
}

function MarketingFooter() {
  const col = (title: string, links: { to: string; label: string }[]) => (
    <div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => <li key={l.to + l.label}><Link to={l.to} className="text-sm text-ink-muted hover:text-brand">{l.label}</Link></li>)}
      </ul>
    </div>
  );
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-1">
          <Logo />
          <p className="mt-3 text-sm text-ink-muted">Maintenance, requests and assets in one place — in English and Vietnamese.</p>
        </div>
        {col('Features', FEATURE_GROUPS.slice(0, 5).map((g) => ({ to: `/features/${g.items[0].slug}`, label: g.label })))}
        {col('Solutions', SOLUTION_COLUMNS.flatMap((c) => c.items.slice(0, 2)).map((s) => ({ to: `/solutions/${s.slug}`, label: s.title })))}
        {col('Resources', RESOURCES.flat().slice(0, 6).map((r) => ({ to: resourceHref(r), label: r.title })))}
        {col('Company', [
          { to: '/#pricing', label: 'Pricing' }, { to: '/#demo', label: 'Book a demo' },
          { to: '/signup', label: 'Start free trial' }, { to: '/signin', label: 'Sign in' },
        ])}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-7xl px-4 py-5 text-sm text-ink-muted sm:px-6 lg:px-8">© {new Date().getFullYear()} FacilityPro. Built for modern facilities teams.</p>
      </div>
    </footer>
  );
}
