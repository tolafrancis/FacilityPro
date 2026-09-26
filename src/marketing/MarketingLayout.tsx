import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { FEATURE_GROUPS, RESOURCES, SOLUTION_COLUMNS, resourceHref, type Resource } from './content';
import { brochureHref, useMarketingT } from './i18n';

type MenuKey = 'features' | 'resources' | 'solutions';

/** Public site header (mega menus) and footer, shared by the landing and marketing pages. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-ink">
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}

function Logo() {
  const { t } = useMarketingT();
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label={t('nav.home')}>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-lg font-bold text-white">F</span>
      <span className="text-xl font-semibold tracking-tight text-ink">Facility<span className="text-brand">Pro</span></span>
    </Link>
  );
}

/** "email + Start free trial": carries the address into sign-up. */
export function TrialForm({ size = 'md', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  const navigate = useNavigate();
  const { t } = useMarketingT();
  const id = useId();
  const [email, setEmail] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    navigate(v ? `/signup?email=${encodeURIComponent(v)}` : '/signup');
  };
  const h = size === 'lg' ? 'h-14 text-base' : 'h-14 text-[15px]';
  return (
    <form onSubmit={submit} className={`flex w-full max-w-[26rem] ${className}`}>
      <label htmlFor={id} className="sr-only">{t('nav.workEmail')}</label>
      <input
        id={id}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('nav.email')}
        autoComplete="email"
        className={`${h} min-w-0 flex-1 rounded-l-lg border border-r-0 border-[#D9DDE3] bg-white px-4 text-ink placeholder:text-[#8A8F98] focus:border-brand focus:outline-none`}
      />
      <button type="submit" className={`${h} shrink-0 rounded-r-lg border border-brand bg-white px-5 font-bold uppercase tracking-wide text-brand transition hover:bg-brand hover:text-white`}>
        {t('nav.startTrial')}
      </button>
    </form>
  );
}

function MarketingHeader() {
  const { t } = useMarketingT();
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
  // Which trigger each panel hangs from (for centring the panel under it).
  const triggers = useRef<Partial<Record<MenuKey, HTMLButtonElement | null>>>({});
  const trigger = (k: MenuKey, label: string) => (
    <button
      ref={(el) => { triggers.current[k] = el; }}
      type="button"
      aria-expanded={open === k}
      aria-haspopup="true"
      onClick={() => click(k)}
      onMouseEnter={() => enter(k)}
      onMouseLeave={leave}
      className={`inline-flex items-center gap-1 py-3 text-[17px] font-semibold transition ${open === k ? 'text-brand' : 'text-[#555] hover:text-brand'}`}
    >
      {label}
      <ChevronDown size={14} strokeWidth={2} className={`mt-0.5 transition ${open === k ? 'rotate-180' : ''}`} aria-hidden />
    </button>
  );
  const plain = 'py-3 text-[17px] font-semibold text-[#555] transition hover:text-brand';

  // A light shadow once the page scrolls under the header.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <header ref={headerRef} className={`sticky top-0 z-40 bg-white transition-shadow ${scrolled ? 'shadow-[0_2px_12px_rgba(15,23,42,0.08)]' : ''}`}>
      <div className="mx-auto flex h-20 max-w-[1320px] items-center gap-6 px-4 sm:px-6 lg:h-[104px] lg:px-8">
        <Logo />
        <nav aria-label="Main" className="ml-8 hidden shrink-0 items-center gap-8 lg:flex 2xl:ml-14 2xl:gap-10">
          <Link to="/#pricing" className={plain}>{t('nav.pricing')}</Link>
          {trigger('features', t('nav.features'))}
          {trigger('resources', t('nav.resources'))}
          {trigger('solutions', t('nav.solutions'))}
          <Link to="/signin" className={plain}>{t('nav.signIn')}</Link>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-4">
          <LanguageSwitcher />
          <div className="hidden w-[24rem] shrink-0 2xl:block"><TrialForm /></div>
          <Link to="/signup" className="hidden rounded-lg border border-brand px-5 py-3 text-[15px] font-bold uppercase tracking-wide text-brand hover:bg-brand hover:text-white lg:inline-flex 2xl:hidden">
            {t('nav.startTrial')}
          </Link>
        </div>
        <button type="button" onClick={() => setMobile(true)} className="grid h-11 w-11 place-items-center rounded-lg text-ink hover:bg-surface lg:hidden" aria-label={t('nav.openMenu')}>
          <Menu size={24} aria-hidden />
        </button>
      </div>

      {open && (
        <PanelFrame
          anchor={triggers.current[open] ?? null}
          header={headerRef.current}
          onMouseEnter={() => clearTimeout(closeTimer.current)}
          onMouseLeave={leave}
        >
          {open === 'features' && <FeaturesPanel />}
          {open === 'resources' && <ResourcesPanel />}
          {open === 'solutions' && <SolutionsPanel />}
        </PanelFrame>
      )}
      {/* A portal: the header's own stacking would otherwise trap this fixed overlay inside it. */}
      {mobile && createPortal(<MobileMenu onClose={() => setMobile(false)} />, document.body)}
    </header>
  );
}

/**
 * The dropdown card: centred under its menu item (kept inside the window),
 * with a small pointer, a soft shadow and a hover bridge so the mouse can
 * travel from the item to the card without it closing.
 */
function PanelFrame({ anchor, header, children, onMouseEnter, onMouseLeave }: {
  anchor: HTMLElement | null; header: HTMLElement | null; children: ReactNode;
  onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; notch: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor || !header || !ref.current) return;
      const h = header.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      const w = ref.current.offsetWidth;
      const center = a.left + a.width / 2 - h.left;
      const left = Math.min(Math.max(16, center - w / 2), h.width - w - 16);
      const next = { left, notch: center - left, top: a.bottom - h.top + 10 };
      setPos((p) => (p && p.left === next.left && p.notch === next.notch && p.top === next.top ? p : next));
    };
    place();
    // Re-centre when the window or the card's own size changes (e.g. another tab of Features).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (ref.current) ro?.observe(ref.current);
    window.addEventListener('resize', place);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchor, header]);
  return (
    <div
      ref={ref}
      className="absolute z-40 hidden lg:block"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', maxWidth: 'calc(100vw - 32px)' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Hover bridge over the gap between the menu item and the card. */}
      <div className="absolute -top-4 left-0 right-0 h-4" aria-hidden />
      <span
        className="absolute -top-[7px] h-3.5 w-3.5 rotate-45 border-l border-t border-[#E5E7EB] bg-white"
        style={{ left: (pos?.notch ?? 0) - 7 }}
        aria-hidden
      />
      {children}
    </div>
  );
}

const panel = 'rounded-lg border border-[#E5E7EB] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.10)]';
const itemLink = 'group flex items-center gap-3.5 whitespace-nowrap py-3 text-[15.5px] leading-snug text-[#333] transition hover:text-brand';
const iconProps = { size: 19, strokeWidth: 2.2, className: 'shrink-0 text-brand', 'aria-hidden': true } as const;

function FeaturesPanel() {
  const m = useMarketingT();
  const [group, setGroup] = useState(FEATURE_GROUPS[0].key);
  const g = FEATURE_GROUPS.find((x) => x.key === group) ?? FEATURE_GROUPS[0];
  return (
    <div className={`${panel} flex w-max max-w-full`} role="region" aria-label={m.t('nav.features')}>
      <ul className="my-5 w-[236px] shrink-0 border-r border-[#E5E7EB]" role="tablist" aria-orientation="vertical">
        {FEATURE_GROUPS.map((x) => (
          <li key={x.key}>
            <button
              type="button"
              role="tab"
              aria-selected={x.key === group}
              onMouseEnter={() => setGroup(x.key)}
              onFocus={() => setGroup(x.key)}
              onClick={() => setGroup(x.key)}
              className={`-mr-px flex w-[calc(100%+1px)] items-center gap-2 whitespace-nowrap border-r-2 px-5 py-3.5 text-left text-[15px] transition ${
                x.key === group ? 'border-brand text-brand' : 'border-transparent text-[#333] hover:text-brand'}`}
            >
              {m.group(x)}
              {x.badge && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold leading-none text-white">{x.badge}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="grid min-w-[760px] flex-1 grid-cols-[repeat(3,max-content)] content-start gap-x-12 px-9 py-5" role="tabpanel">
        {g.items.map((f) => (
          <Link key={f.slug} to={`/features/${f.slug}`} className={itemLink}>
            <f.icon {...iconProps} />
            <span>{m.feature(f)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ResourceLink({ r }: { r: Resource }) {
  const m = useMarketingT();
  return (
    <Link to={resourceHref(r)} className={itemLink}>
      <r.icon {...iconProps} />
      <span>{m.resource(r)}</span>
    </Link>
  );
}

function ResourcesPanel() {
  const { t } = useMarketingT();
  return (
    <div className={`${panel} grid w-max max-w-full grid-cols-[repeat(3,max-content)] gap-x-14 px-8 py-5`} role="region" aria-label={t('nav.resources')}>
      {RESOURCES.map((col, i) => (
        <div key={i}>
          {col.map((r) => <ResourceLink key={r.slug} r={r} />)}
        </div>
      ))}
    </div>
  );
}

function SolutionsPanel() {
  const m = useMarketingT();
  return (
    <div className={`${panel} grid w-max max-w-full grid-cols-[repeat(3,max-content)] gap-x-10 px-8 py-5`} role="region" aria-label={m.t('nav.solutions')}>
      {SOLUTION_COLUMNS.map((c) => (
        <div key={c.key} className="min-w-[14rem]">
          {c.items.map((s) => (
            <Link key={s.slug} to={`/solutions/${s.slug}`} className={itemLink}>
              <s.icon {...iconProps} size={18} />
              <span>{m.solution(s)}</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const m = useMarketingT();
  const { t } = m;
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
    <div className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
      <div className="flex h-20 items-center justify-between border-b border-line px-4 sm:px-6">
        <Logo />
        <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-surface" aria-label={t('nav.closeMenu')}>
          <X size={24} aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <div className="divide-y divide-line">
          <Link to="/#pricing" className="block py-4 text-lg font-semibold text-ink">{t('nav.pricing')}</Link>
          <div>
            {head('features', t('nav.features'))}
            {section === 'features' && (
              <div className="space-y-4 pb-4">
                {FEATURE_GROUPS.map((g) => (
                  <div key={g.key}>
                    <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-brand">{m.group(g)}</p>
                    {g.items.map((f) => (
                      <Link key={f.slug} to={`/features/${f.slug}`} className={small}>
                        <f.icon size={18} className="text-brand" aria-hidden />{m.feature(f)}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            {head('resources', t('nav.resources'))}
            {section === 'resources' && (
              <div className="pb-4">
                {RESOURCES.flat().map((r) => (
                  <Link key={r.slug} to={resourceHref(r)} className={small}><r.icon size={18} className="text-brand" aria-hidden />{m.resource(r)}</Link>
                ))}
              </div>
            )}
          </div>
          <div>
            {head('solutions', t('nav.solutions'))}
            {section === 'solutions' && (
              <div className="pb-4">
                {SOLUTION_COLUMNS.flatMap((c) => c.items).map((s) => (
                  <Link key={s.slug} to={`/solutions/${s.slug}`} className={small}><s.icon size={18} className="text-brand" aria-hidden />{m.solution(s)}</Link>
                ))}
              </div>
            )}
          </div>
          <Link to="/signin" className="block py-4 text-lg font-semibold text-ink">{t('footer.signIn')}</Link>
        </div>
        <div className="mt-4"><LanguageSwitcher /></div>
        <TrialForm className="mt-4" />
      </div>
    </div>
  );
}

function MarketingFooter() {
  const m = useMarketingT();
  const { t } = m;
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
          <p className="mt-3 text-sm text-ink-muted">{t('footer.tagline')}</p>
          <a href={brochureHref(m.lang)} download className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">{t('footer.brochure')}</a>
        </div>
        {col(t('nav.features'), FEATURE_GROUPS.slice(0, 5).map((g) => ({ to: `/features/${g.items[0].slug}`, label: m.group(g) })))}
        {col(t('nav.solutions'), SOLUTION_COLUMNS.flatMap((c) => c.items.slice(0, 2)).map((s) => ({ to: `/solutions/${s.slug}`, label: m.solution(s) })))}
        {col(t('nav.resources'), RESOURCES.flat().slice(0, 6).map((r) => ({ to: resourceHref(r), label: m.resource(r) })))}
        {col(t('footer.company'), [
          { to: '/#pricing', label: t('nav.pricing') }, { to: '/#demo', label: t('footer.bookDemo') },
          { to: '/signup', label: t('nav.startTrial') }, { to: '/signin', label: t('footer.signIn') },
        ])}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-7xl px-4 py-5 text-sm text-ink-muted sm:px-6 lg:px-8">© {new Date().getFullYear()} FacilityPro. {t('footer.rights')}</p>
      </div>
    </footer>
  );
}
