import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronRight } from 'lucide-react';
import MarketingLayout, { TrialForm } from '../marketing/MarketingLayout';
import { INTEGRATIONS, INTEGRATION_CATEGORIES, featureGroupOf, findFeature, findResource, findSolution, type FeatureItem } from '../marketing/content';
import { featureById } from '../help/features';

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
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
      <Link to="/" className="hover:text-brand">Home</Link>
      {items.map((x) => <span key={x} className="inline-flex items-center gap-1"><ChevronRight size={14} aria-hidden />{x}</span>)}
    </nav>
  );
}

function Hero({ icon: Icon, kicker, title, summary, crumbs }: { icon: FeatureItem['icon']; kicker: string; title: string; summary?: string; crumbs: string[] }) {
  return (
    <section className="border-b border-line bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <Crumbs items={crumbs} />
        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand"><Icon size={28} aria-hidden /></span>
            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-brand">{kicker}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{title}</h1>
            {summary && <p className="mt-4 text-lg leading-8 text-ink-muted">{summary}</p>}
          </div>
          <div className="w-full max-w-md">
            <TrialForm />
            <p className="mt-2 text-sm text-ink-muted">Free trial · no credit card required</p>
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
  return (
    <>
      <Hero icon={r.icon} kicker="Resources" title={r.title} summary={r.summary} crumbs={['Resources', r.title]} />
      {r.view === 'integrations' ? <IntegrationsDirectory /> : (
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-8">
          {(r.sections ?? []).map((sec) => (
            <div key={sec.heading}>
              <h2 className="text-xl font-semibold text-ink">{sec.heading}</h2>
              {sec.body.map((b) => <p key={b} className="mt-2 leading-7 text-ink-muted">{b}</p>)}
            </div>
          ))}
        </div>
      </section>
      )}
    </>
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
  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 rounded-3xl bg-brand p-8 text-white lg:flex-row lg:items-center lg:justify-between lg:p-12">
        <div>
          <h2 className="text-2xl font-semibold sm:text-3xl">Ready to run maintenance from one place?</h2>
          <p className="mt-2 text-white/85">Start a free trial, or let us show you around.</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          <Link to="/signup" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-6 py-3 font-semibold text-brand hover:bg-white/90">
            Start free trial <ArrowRight size={18} aria-hidden />
          </Link>
          <Link to="/#demo" className="inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-white/60 px-6 py-3 font-semibold text-white hover:bg-white/10">
            Book a demo
          </Link>
        </div>
      </div>
    </section>
  );
}
