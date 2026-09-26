import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ZoomableImage from '../components/help/ZoomableImage';
import {
  ArrowLeft, ArrowRight, BookOpen, Boxes, Building2, CalendarClock, ChevronRight, Compass, Cpu, ExternalLink,
  Gauge, Bell, BarChart3, LayoutGrid, MapPin, Package, Rocket, Search, Settings, TriangleAlert, Users, UserCog, Wrench,
} from 'lucide-react';
import { useOrg } from '../contexts/OrgContext';
import { Markdown, headingId, splitHeadingId } from '../lib/markdown';
import { articleDocs, searchHelp, type HelpDoc } from '../lib/helpSearch';
import { startTour } from '../lib/tour';
import { localizedScreen, type FeatureArea } from '../help/features';
import { useHelpContent } from '../help/localized';
import NotFound from '../components/NotFound';

// The Help Center (/help): the user guide, the feature directory, role
// quick-starts and known issues, with one search across all of them.

const ICONS: Record<string, typeof BookOpen> = {
  'getting-started': Rocket, dashboard: Gauge, facilities: MapPin, assets: Boxes, 'preventive-maintenance': CalendarClock,
  'work-orders': Wrench, 'technicians-teams': Users, vendors: Building2, inventory: Package, iot: Cpu,
  notifications: Bell, reports: BarChart3, 'user-management': UserCog, settings: Settings,
};

function useHelpDocs(): HelpDoc[] {
  const { t } = useTranslation('help');
  const { guide: GUIDE, quickStarts: QUICK_STARTS, knownIssues: KNOWN_ISSUES, features: FEATURES, areaLabel } = useHelpContent();
  return useMemo(() => {
    const docs: HelpDoc[] = [];
    for (const s of GUIDE) docs.push(...articleDocs(`/help/guide/${s.id}`, s.title, s.body));
    for (const q of QUICK_STARTS) docs.push(...articleDocs(`/help/quick-start/${q.role}`, `${t('center.quickStarts')}: ${q.title}`, q.body));
    docs.push(...articleDocs('/help/known-issues', t('center.knownIssues'), KNOWN_ISSUES));
    for (const f of FEATURES) {
      docs.push({
        href: `/help/features#${f.id}`,
        title: f.name,
        context: `${t('center.features')} · ${areaLabel(f.area)}`,
        text: [f.purpose, f.who, f.where, ...f.prereq, ...f.steps].join(' '),
        keywords: f.keywords,
      });
    }
    return docs;
  }, [t, GUIDE, QUICK_STARTS, KNOWN_ISSUES, FEATURES, areaLabel]);
}

/** Internal links inside Markdown navigate in-app; scroll to #hash after render. */
function useArticleLinks() {
  const navigate = useNavigate();
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      document.querySelector('main')?.scrollTo?.(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [hash, pathname]);
  return (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (!a || !href || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
    if (href.startsWith('/')) {
      e.preventDefault();
      navigate(href);
    } else if (href.startsWith('#')) {
      e.preventDefault();
      navigate({ hash: href });
    }
  };
}

export default function HelpCenter() {
  return (
    <div className="mx-auto max-w-6xl">
      <Routes>
        <Route index element={<HelpHome />} />
        <Route path="guide/:id" element={<GuidePage />} />
        <Route path="features" element={<FeatureDirectory />} />
        <Route path="quick-start/:role" element={<QuickStartPage />} />
        <Route path="known-issues" element={<KnownIssuesPage />} />
        <Route path="*" element={<NotFound backTo="/help" backLabel="Help Center" />} />
      </Routes>
    </div>
  );
}

function SearchBox({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const { t } = useTranslation('help');
  return (
    <label className="relative block">
      <span className="sr-only">{t('center.search')}</span>
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('center.searchPlaceholder')}
        className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-4 text-base text-ink shadow-sm placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}

function SearchResults({ q }: { q: string }) {
  const { t } = useTranslation('help');
  const docs = useHelpDocs();
  const hits = useMemo(() => searchHelp(q, docs, 30), [q, docs]);
  if (hits.length === 0) return <p className="rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-muted">{t('center.noResults', { q })}</p>;
  return (
    <section aria-live="polite">
      <p className="mb-2 text-sm text-ink-muted">{t('center.results', { count: hits.length })}</p>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
        {hits.map((h) => (
          <li key={h.href + h.title}>
            <Link to={h.href} className="block px-4 py-3 hover:bg-surface">
              <p className="text-xs font-medium text-brand">{h.context}</p>
              <p className="font-medium text-ink">{h.title}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{h.snippet}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HelpHome() {
  const { guide: GUIDE, quickStarts: QUICK_STARTS } = useHelpContent();
  const { t } = useTranslation('help');
  const { role } = useOrg();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const setQ = (v: string) => setParams(v ? { q: v } : {}, { replace: true });
  const mine = QUICK_STARTS.find((s) => s.role === role);
  const sections = role === 'occupant' ? GUIDE.filter((s) => ['getting-started', 'notifications'].includes(s.id)) : GUIDE;

  return (
    <div>
      <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-600 p-6 text-white sm:p-8">
        <p className="flex items-center gap-2 text-sm font-medium text-white/85"><BookOpen size={16} aria-hidden /> {t('center.guide')}</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{t('center.title')}</h1>
        <p className="mt-1 max-w-2xl text-white/90">{t('center.subtitle')}</p>
        <div className="mt-5 max-w-2xl text-ink"><SearchBox value={q} onChange={setQ} /></div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={startTour} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 font-medium hover:bg-white/25">
            <Compass size={15} aria-hidden /> {t('center.takeTour')}
          </button>
          {role !== 'occupant' && (
            <Link to="/help/features" className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 font-medium hover:bg-white/25">
              <LayoutGrid size={15} aria-hidden /> {t('center.features')}
            </Link>
          )}
          <Link to="/help/known-issues" className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 font-medium hover:bg-white/25">
            <TriangleAlert size={15} aria-hidden /> {t('center.knownIssues')}
          </Link>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-muted">{t('center.englishOnly')}</p>

      {q.trim().length > 1 ? (
        <div className="mt-6"><SearchResults q={q} /></div>
      ) : (
        <>
          {mine && (
            <Link to={`/help/quick-start/${mine.role}`} className="mt-6 flex items-center gap-4 rounded-2xl border border-brand/30 bg-brand-50 p-5 hover:border-brand">
              <Rocket size={24} className="shrink-0 text-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t('center.forRole')}</p>
                <p className="font-semibold text-ink">{t('center.quickStarts')}: {mine.title}</p>
                <p className="text-sm text-ink-muted">{mine.summary}</p>
              </div>
              <ChevronRight size={20} className="text-brand" aria-hidden />
            </Link>
          )}

          <h2 className="mt-8 text-lg font-semibold text-ink">{t('center.allSections')}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((s, i) => {
              const Icon = ICONS[s.id] ?? BookOpen;
              return (
                <li key={s.id}>
                  <Link to={`/help/guide/${s.id}`} className="flex h-full gap-3 rounded-xl border border-line bg-white p-4 transition hover:border-brand/50 hover:shadow-sm">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand"><Icon size={20} aria-hidden /></span>
                    <span>
                      <span className="block font-medium text-ink">{i + 1}. {s.title}</span>
                      <span className="mt-0.5 block text-sm text-ink-muted">{s.summary}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {role !== 'occupant' && (
            <>
              <h2 className="mt-8 text-lg font-semibold text-ink">{t('center.quickStarts')}</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {QUICK_STARTS.map((s) => (
                  <li key={s.role}>
                    <Link to={`/help/quick-start/${s.role}`} className="block h-full rounded-xl border border-line bg-white p-4 hover:border-brand/50">
                      <span className="block font-medium text-ink">{s.title}</span>
                      <span className="mt-0.5 block text-sm text-ink-muted">{s.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Toc({ body }: { body: string }) {
  const { t } = useTranslation('help');
  const heads = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => splitHeadingId(m[1]));
  if (heads.length < 2) return null;
  return (
    <nav aria-label={t('center.onThisPage')} className="sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-y-auto xl:block">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('center.onThisPage')}</p>
      <ul className="mt-2 space-y-1 border-l border-line text-sm">
        {heads.map((h) => (
          <li key={h.text}>
            <Link to={{ hash: h.id ?? headingId(h.text) }} className="-ml-px block border-l-2 border-transparent py-0.5 pl-3 text-ink-muted hover:border-brand hover:text-ink">{h.text}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function GuideNav({ current }: { current?: string }) {
  const { guide: GUIDE } = useHelpContent();
  const { t } = useTranslation('help');
  return (
    <nav aria-label={t('center.guide')} className="hidden lg:block">
      <div className="sticky top-4 space-y-4">
        <Link to="/help" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft size={15} aria-hidden /> {t('center.back')}</Link>
        <ol className="space-y-0.5 text-sm">
          {GUIDE.map((s, i) => (
            <li key={s.id}>
              <Link
                to={`/help/guide/${s.id}`}
                aria-current={s.id === current ? 'page' : undefined}
                className={`block rounded-lg px-2.5 py-1.5 ${s.id === current ? 'bg-brand-50 font-medium text-brand-600' : 'text-ink hover:bg-surface'}`}
              >
                {i + 1}. {s.title}
              </Link>
            </li>
          ))}
        </ol>
        <div className="space-y-0.5 border-t border-line pt-3 text-sm">
          <Link to="/help/features" className="block rounded-lg px-2.5 py-1.5 text-ink hover:bg-surface">{t('center.features')}</Link>
          <Link to="/help/known-issues" className="block rounded-lg px-2.5 py-1.5 text-ink hover:bg-surface">{t('center.knownIssues')}</Link>
        </div>
      </div>
    </nav>
  );
}

function Article({ title, kicker, body, children }: { title: string; kicker: string; body: string; children?: React.ReactNode }) {
  const onClick = useArticleLinks();
  const { i18n } = useTranslation();
  return (
    <article className="min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-8" onClick={onClick}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">{kicker}</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">{title}</h1>
      <div className="mt-5"><Markdown source={body} compact imageUrl={(src) => localizedScreen(src, i18n.resolvedLanguage)} renderImage={(src, alt, cls) => <ZoomableImage src={src} alt={alt} className={cls} />} /></div>
      {children}
    </article>
  );
}

function GuidePage() {
  const { guide: GUIDE } = useHelpContent();
  const { t } = useTranslation('help');
  const { id } = useParams();
  const s = GUIDE.find((g) => g.id === id);
  if (!s) return <NotFound backTo="/help" backLabel={t('center.back')} />;
  const i = GUIDE.indexOf(s);
  const prev = GUIDE[i - 1];
  const next = GUIDE[i + 1];
  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_12rem]">
      <GuideNav current={s.id} />
      <div className="min-w-0">
        <Link to="/help" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink lg:hidden"><ArrowLeft size={15} aria-hidden /> {t('center.back')}</Link>
        <Article title={s.title} kicker={`${t('center.guide')} · ${i + 1} / ${GUIDE.length}`} body={s.body}>
          <div className="mt-10 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
            {prev ? (
              <Link to={`/help/guide/${prev.id}`} className="rounded-xl border border-line p-3 hover:border-brand/50">
                <span className="flex items-center gap-1 text-xs text-ink-muted"><ArrowLeft size={13} aria-hidden /> {t('center.previous')}</span>
                <span className="font-medium text-ink">{prev.title}</span>
              </Link>
            ) : <span />}
            {next && (
              <Link to={`/help/guide/${next.id}`} className="rounded-xl border border-line p-3 text-right hover:border-brand/50">
                <span className="flex items-center justify-end gap-1 text-xs text-ink-muted">{t('center.next')} <ArrowRight size={13} aria-hidden /></span>
                <span className="font-medium text-ink">{next.title}</span>
              </Link>
            )}
          </div>
        </Article>
      </div>
      <Toc body={s.body} />
    </div>
  );
}

function QuickStartPage() {
  const { quickStarts: QUICK_STARTS } = useHelpContent();
  const { t } = useTranslation('help');
  const { role } = useParams();
  const s = QUICK_STARTS.find((q) => q.role === role);
  if (!s) return <NotFound backTo="/help" backLabel={t('center.back')} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label={t('center.quickStarts')} className="hidden lg:block">
        <div className="sticky top-4 space-y-3">
          <Link to="/help" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft size={15} aria-hidden /> {t('center.back')}</Link>
          <ul className="space-y-0.5 text-sm">
            {QUICK_STARTS.map((q) => (
              <li key={q.role}>
                <Link to={`/help/quick-start/${q.role}`} aria-current={q.role === role ? 'page' : undefined} className={`block rounded-lg px-2.5 py-1.5 ${q.role === role ? 'bg-brand-50 font-medium text-brand-600' : 'text-ink hover:bg-surface'}`}>{q.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <div className="min-w-0">
        <Link to="/help" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink lg:hidden"><ArrowLeft size={15} aria-hidden /> {t('center.back')}</Link>
        <Article title={s.title} kicker={t('center.quickStarts')} body={s.body} />
      </div>
    </div>
  );
}

function KnownIssuesPage() {
  const { knownIssues: KNOWN_ISSUES } = useHelpContent();
  const { t } = useTranslation('help');
  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <GuideNav />
      <div className="min-w-0">
        <Link to="/help" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink lg:hidden"><ArrowLeft size={15} aria-hidden /> {t('center.back')}</Link>
        <Article title={t('center.knownIssues')} kicker={t('center.title')} body={KNOWN_ISSUES} />
      </div>
    </div>
  );
}

const AREAS: FeatureArea[] = ['Basics', 'Maintenance', 'Assets & places', 'Operations', 'Inventory & finance', 'IoT', 'People & settings'];

function FeatureDirectory() {
  const { features: FEATURES, areaLabel } = useHelpContent();
  const { t, i18n } = useTranslation('help');
  const { hash } = useLocation();
  const [q, setQ] = useState('');
  const [area, setArea] = useState<FeatureArea | ''>('');
  const docs = useHelpDocs();
  const ids = useMemo(() => {
    if (q.trim().length < 2) return null;
    return new Set(searchHelp(q, docs.filter((d) => d.href.startsWith('/help/features#')), 200).map((h) => h.href.split('#')[1]));
  }, [q, docs]);
  const shown = FEATURES.filter((f) => (!area || f.area === area) && (!ids || ids.has(f.id)));
  const byId = useMemo(() => new Map(FEATURES.map((f) => [f.id, f])), []);
  const target = hash ? decodeURIComponent(hash.slice(1)) : null;
  // A #feature link (from search or Related) must show that feature, so it
  // clears any search text or area filter that would hide it.
  useEffect(() => {
    if (!target) return;
    setQ('');
    setArea('');
  }, [target]);
  useArticleLinks();

  return (
    <div>
      <Link to="/help" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft size={15} aria-hidden /> {t('center.back')}</Link>
      <h1 className="text-2xl font-semibold text-ink">{t('center.features')}</h1>
      <p className="mt-1 text-ink-muted">{t('center.featureCount', { count: FEATURES.length })}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <SearchBox value={q} onChange={setQ} />
        <label className="block">
          <span className="sr-only">{t('center.filterAll')}</span>
          <select value={area} onChange={(e) => setArea(e.target.value as FeatureArea | '')} className="h-12 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink">
            <option value="">{t('center.filterAll')}</option>
            {AREAS.map((a) => <option key={a} value={a}>{areaLabel(a)}</option>)}
          </select>
        </label>
      </div>
      {shown.length === 0 && <p className="mt-6 rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-muted">{t('center.noResults', { q })}</p>}
      <ul className="mt-5 space-y-3">
        {shown.map((f) => (
          <li key={f.id} id={f.id} className="scroll-mt-24">
            <details open={target === f.id} className="group rounded-xl border border-line bg-white open:border-brand/40 open:shadow-sm">
              <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
                <ChevronRight size={18} className="mt-0.5 shrink-0 text-ink-muted transition group-open:rotate-90" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{f.name}</span>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-muted">{areaLabel(f.area)}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{f.purpose}</span>
                </span>
              </summary>
              <div className="grid gap-5 border-t border-line p-4 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <dl className="space-y-3">
                  <div><dt className="font-semibold text-ink">{t('center.purpose')}</dt><dd className="text-ink-muted">{f.purpose}</dd></div>
                  <div><dt className="font-semibold text-ink">{t('center.who')}</dt><dd className="text-ink-muted">{f.who}</dd></div>
                  <div><dt className="font-semibold text-ink">{t('center.where')}</dt><dd className="text-ink-muted">{f.where}</dd></div>
                  {f.prereq.length > 0 && (
                    <div><dt className="font-semibold text-ink">{t('center.prereq')}</dt><dd><ul className="list-disc pl-5 text-ink-muted">{f.prereq.map((p) => <li key={p}>{p}</li>)}</ul></dd></div>
                  )}
                  <div><dt className="font-semibold text-ink">{t('center.steps')}</dt><dd><ol className="list-decimal space-y-0.5 pl-5 text-ink-muted marker:text-brand">{f.steps.map((s) => <li key={s}>{s}</li>)}</ol></dd></div>
                  {f.related.length > 0 && (
                    <div>
                      <dt className="font-semibold text-ink">{t('center.related')}</dt>
                      <dd className="mt-1 flex flex-wrap gap-1.5">
                        {f.related.map((r) => (
                          <Link key={r} to={{ hash: r }} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink hover:border-brand hover:text-brand">{byId.get(r)?.name ?? r}</Link>
                        ))}
                      </dd>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link to={f.guide} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"><BookOpen size={14} aria-hidden /> {t('center.readGuide')}</Link>
                    {f.path && <Link to={f.path} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"><ExternalLink size={14} aria-hidden /> {t('center.openPage')}</Link>}
                  </div>
                </dl>
                {f.screenshot && <ZoomableImage src={localizedScreen(f.screenshot, i18n.resolvedLanguage)} alt={f.name} className="w-full rounded-lg border border-line" />}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
