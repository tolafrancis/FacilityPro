import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronRight, Download, FileText } from 'lucide-react';
import MarketingLayout, { TrialForm } from '../marketing/MarketingLayout';
import { INTEGRATIONS, INTEGRATION_CATEGORIES, featureGroupOf, findFeature, findResource, findSolution, type FeatureItem } from '../marketing/content';
import { featureById } from '../help/features';
import { brochureHref, useMarketingT } from '../marketing/i18n';

// Public pages behind the header menus: /features/:slug, /solutions/:slug,
// /resources/:slug. Content lives in src/marketing/content.ts.

export default function MarketingPage({ kind }: { kind: 'feature' | 'solution' | 'resource' }) {
  const { slug } = useParams();
  useEffect(() => window.scrollTo({ top: 0 }), [slug]);
  const feature = kind === 'feature' ? findFeature(slug) : undefined;
  const solution = kind === 'solution' ? findSolution(slug) : undefined;
  const resource = kind === 'resource' ? findResource(slug) : undefined;
  const title = feature?.title ?? solution?.title ?? resource?.title;
  useEffect(() => {
    if (title) document.title = `${title} · FacilityPro`;
    return () => {
      document.title = 'FacilityPro';
    };
  }, [title]);
  if (!feature && !solution && !resource) return <Navigate to="/" replace />;

  return (
    <MarketingLayout>
      {feature && <FeatureView f={feature} />}
      {solution && <SolutionView slug={solution.slug} />}
      {resource && <ResourceView slug={resource.slug} />}
      <CtaBand />
    </MarketingLayout>
  );
}

function Crumbs({ items }: { items: string[] }) {
  const { t } = useMarketingT();
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
      <Link to="/" className="hover:text-brand">{t('page.home')}</Link>
      {items.map((x) => <span key={x} className="inline-flex items-center gap-1"><ChevronRight size={14} aria-hidden />{x}</span>)}
    </nav>
  );
}

function Hero({ icon: Icon, kicker, title, summary, crumbs, translated }: { icon: FeatureItem['icon']; kicker: string; title: string; summary?: string; crumbs: string[]; translated?: boolean }) {
  const { t, lang } = useMarketingT();
  return (
    <section className="border-b border-line bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <Crumbs items={crumbs} />
        {/* Only the home page and menus are translated so far. */}
        {lang === 'vi' && !translated && <p className="mt-3 inline-block rounded-lg bg-surface px-3 py-1.5 text-sm text-ink-muted">{t('brochure.englishOnly')}</p>}
        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand"><Icon size={28} aria-hidden /></span>
            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-brand">{kicker}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{title}</h1>
            {summary && <p className="mt-4 text-lg leading-8 text-ink-muted">{summary}</p>}
          </div>
          <div className="w-full max-w-md">
            <TrialForm />
            <p className="mt-2 text-sm text-ink-muted">{t('page.trialNote')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ f }: { f: FeatureItem }) {
  return (
    <Link to={`/features/${f.slug}`} className="group rounded-2xl border border-line bg-white p-5 transition hover:border-brand hover:shadow-sm">
      <f.icon size={22} className="text-brand" aria-hidden />
      <p className="mt-3 font-semibold text-ink group-hover:text-brand">{f.title}</p>
      <p className="mt-1 text-sm leading-6 text-ink-muted">{f.summary}</p>
    </Link>
  );
}

function FeatureView({ f }: { f: FeatureItem }) {
  const group = featureGroupOf(f.slug);
  const related = (group?.items ?? []).filter((x) => x.slug !== f.slug).slice(0, 6);
  // Steps come from the in-app Feature directory, so the site and the Help Center agree.
  const help = f.helpId ? featureById(f.helpId) : undefined;
  const steps = f.steps ?? help?.steps ?? [];
  return (
    <>
      <Hero icon={f.icon} kicker={group?.label ?? 'Feature'} title={f.title} summary={f.summary} crumbs={['Features', group?.label ?? '', f.title].filter(Boolean)} />
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold text-ink">What you get</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {f.points.map((p) => (
            <li key={p} className="flex gap-3 rounded-2xl border border-line bg-white p-5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-white"><Check size={14} aria-hidden /></span>
              <span className="text-ink">{p}</span>
            </li>
          ))}
        </ul>
      </section>
      {steps.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-ink">How it works</h2>
          {help?.who && <p className="mt-2 text-ink-muted">Used by: {help.who}.</p>}
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step} className="rounded-2xl border border-line bg-surface p-5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">{i + 1}</span>
                <p className="mt-3 text-ink">{step}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {related.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-ink">More in {group?.label}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{related.map((x) => <FeatureCard key={x.slug} f={x} />)}</div>
        </section>
      )}
    </>
  );
}

function SolutionView({ slug }: { slug: string }) {
  const s = findSolution(slug)!;
  const features = s.features.map((x) => findFeature(x)).filter((x): x is FeatureItem => !!x);
  return (
    <>
      <Hero icon={s.icon} kicker="Solutions" title={`FacilityPro for ${s.title.toLowerCase()}`} summary={s.summary} crumbs={['Solutions', s.title]} />
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="text-2xl font-semibold text-ink">The challenge</h2>
            <ul className="mt-5 space-y-3">
              {s.challenges.map((c) => (
                <li key={c} className="flex gap-3 text-ink"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-ink">How FacilityPro helps</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">{features.map((f) => <FeatureCard key={f.slug} f={f} />)}</div>
          </div>
        </div>
      </section>
    </>
  );
}

function ResourceView({ slug }: { slug: string }) {
  const r = findResource(slug)!;
  const m = useMarketingT();
  const title = m.resource(r);
  return (
    <>
      <Hero icon={r.icon} kicker={m.t('nav.resources')} title={title} summary={m.resourceSummary(r)} crumbs={[m.t('nav.resources'), title]} translated={r.view === 'brochure'} />
      {r.view === 'integrations' ? <IntegrationsDirectory /> : r.view === 'brochure' ? <BrochureDownload /> : (
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {(r.sections?.length ?? 0) > 8 && (
          <nav aria-label="On this page" className="mb-10 rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">On this page</p>
            <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
              {r.sections!.map((sec, i) => (
                <li key={sec.heading}><a href={`#s${i}`} className="text-ink-muted hover:text-brand">{sec.heading}</a></li>
              ))}
            </ol>
          </nav>
        )}
        <div className="space-y-10">
          {(r.sections ?? []).map((sec, i) => (
            <div key={sec.heading} id={`s${i}`} className="scroll-mt-28">
              <h2 className="text-xl font-semibold text-ink">{sec.heading}</h2>
              {sec.body.map((b) => <p key={b} className="mt-2 leading-7 text-ink-muted">{b}</p>)}
              {sec.list && (
                <ul className="mt-3 space-y-2">
                  {sec.list.map((x) => (
                    <li key={x} className="flex items-start gap-2.5 leading-7 text-ink-muted">
                      <Check size={18} className="mt-1 shrink-0 text-brand" aria-hidden />{x}
                    </li>
                  ))}
                </ul>
              )}
              {sec.table && (
                <div className="mt-4 overflow-x-auto rounded-xl border border-line">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface">
                      <tr>{sec.table.head.map((h) => <th key={h} className="px-4 py-3 font-semibold text-ink">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {sec.table.rows.map((row) => (
                        <tr key={row[0]}>
                          {row.map((c, j) => <td key={j} className={`px-4 py-3 align-top leading-6 ${j === 0 ? 'whitespace-nowrap font-medium text-ink' : 'text-ink-muted'}`}>{c}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {sec.faq && (
                <div className="mt-4 divide-y divide-line rounded-xl border border-line">
                  {sec.faq.map((f) => (
                    <details key={f.q} className="group px-4 py-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-ink">
                        {f.q}<ChevronRight size={16} className="shrink-0 text-ink-muted transition group-open:rotate-90" aria-hidden />
                      </summary>
                      <p className="mt-2 leading-7 text-ink-muted">{f.a}</p>
                    </details>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      )}
    </>
  );
}

/** The brochure in the reader's language first, with the other language beside it. */
function BrochureDownload() {
  const { t, lang } = useMarketingT();
  const other = lang === 'vi' ? 'en' : 'vi';
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col items-start gap-5 rounded-2xl border border-line bg-white p-6 sm:flex-row sm:items-center">
        <span className="grid h-16 w-14 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><FileText size={30} aria-hidden /></span>
        <div className="flex-1">
          <p className="font-semibold text-ink">FacilityPro-brochure-{lang}.pdf</p>
          <p className="mt-1 text-sm text-ink-muted">{t('resourceSummaries.brochure')}</p>
          <a href={brochureHref(other)} download className="mt-2 inline-block text-sm font-medium text-brand hover:underline">{t('brochure.other')}</a>
        </div>
        <a href={brochureHref(lang)} download className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-600">
          <Download size={18} aria-hidden />{t('brochure.download')}
        </a>
      </div>
    </section>
  );
}

/** Category chips across the top, then a card per integration. */
function IntegrationsDirectory() {
  const [category, setCategory] = useState<string>('All');
  const shown = category === 'All' ? INTEGRATIONS : INTEGRATIONS.filter((i) => i.category === category);
  const chip = (c: string, count: number) => (
    <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${category === c ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:border-brand hover:text-brand'}`}>
      {c} <span className={category === c ? 'text-white/80' : 'text-ink-muted'}>({count})</span>
    </button>
  );
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap gap-2">
        {chip('All', INTEGRATIONS.length)}
        {INTEGRATION_CATEGORIES.map((c) => chip(c, INTEGRATIONS.filter((i) => i.category === c).length))}
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((i) => (
          <div key={i.name} className="flex flex-col rounded-2xl border border-line bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand"><i.icon size={22} aria-hidden /></span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${i.status === 'Live' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{i.status}</span>
            </div>
            <p className="mt-4 font-semibold text-ink">{i.name}</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{i.category}</p>
            <p className="mt-2 flex-1 text-sm leading-6 text-ink-muted">{i.summary}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-sm text-ink-muted">
        <strong className="text-ink">Live</strong> integrations work as soon as you switch them on. <strong className="text-ink">On request</strong> ones are connected by our team for your organisation. Need something else? <Link to="/#demo" className="font-semibold text-brand hover:underline">Tell us</Link>.
      </p>
    </section>
  );
}

function CtaBand() {
  const { t } = useMarketingT();
  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 rounded-3xl bg-brand p-8 text-white lg:flex-row lg:items-center lg:justify-between lg:p-12">
        <div>
          <h2 className="text-2xl font-semibold sm:text-3xl">{t('page.ctaTitle')}</h2>
          <p className="mt-2 text-white/85">{t('page.ctaBody')}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          <Link to="/signup" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-6 py-3 font-semibold text-brand hover:bg-white/90">
            {t('nav.startTrial')} <ArrowRight size={18} aria-hidden />
          </Link>
          <Link to="/#demo" className="inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-white/60 px-6 py-3 font-semibold text-white hover:bg-white/10">
            {t('footer.bookDemo')}
          </Link>
        </div>
      </div>
    </section>
  );
}
