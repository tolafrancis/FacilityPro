import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Download } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import MarketingLayout, { TrialForm } from '../marketing/MarketingLayout';
import { FEATURE_GROUPS, RESOURCES, SOLUTION_COLUMNS, resourceHref } from '../marketing/content';
import { brochureHref, useMarketingT } from '../marketing/i18n';

const featureCards = ['card1', 'card2', 'card3'];
const proofPoints = ['proof1', 'proof2', 'proof3'];
const whyItems = ['why1', 'why2', 'why3'];

// Names, prices, blurbs and features come from the marketing translations
// (tiers.<key>.*). Keep in line with fp_plans (0095) and the brochure.
const PRICING_TIERS = [
  { key: 'free', features: 4, href: '/signup' },
  { key: 'starter', features: 4, href: '/signup' },
  { key: 'professional', features: 5, href: '/signup', featured: true },
  { key: 'business', features: 5, href: '#demo' },
  { key: 'enterprise', features: 4, href: '#demo' },
];

export default function Landing() {
  const m = useMarketingT();
  const { t } = m;
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
  });

  // Menu links elsewhere on the site come back as /#pricing, /#demo, …
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    const id = setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50);
    return () => clearTimeout(id);
  }, [location.hash]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <MarketingLayout>
        <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
              {t('home.eyebrow')}
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              {t('home.title')}
            </h1>
            <p className="mt-5 text-lg leading-8 text-ink-muted">
              {t('home.lead')}
            </p>
            <div className="mt-8">
              <TrialForm size="lg" />
              <p className="mt-2 text-sm text-ink-muted">
                {t('home.trialNote')} <a href="#demo" className="font-medium text-brand hover:underline">{t('home.bookDemo')}</a>
              </p>
              <a href={brochureHref(m.lang)} download className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
                <Download size={15} aria-hidden />{t('home.brochure')}
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {proofPoints.map((point) => (
                <span key={point} className="rounded-full border border-line bg-white px-3 py-1 text-sm text-ink-muted">
                  {t(`home.${point}`)}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <div className="rounded-2xl bg-surface p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">{t('home.whyEyebrow')}</p>
              <ul className="mt-4 space-y-4 text-sm text-ink-muted">
                {whyItems.map((k) => (
                  <li key={k} className="rounded-xl border border-line bg-white p-4">
                    <p className="font-semibold text-ink">{t(`home.${k}Title`)}</p>
                    <p className="mt-1">{t(`home.${k}Body`)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {featureCards.map((card) => (
              <div key={card} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">{t(`home.${card}Title`)}</h2>
                <p className="mt-2 text-sm leading-7 text-ink-muted">{t(`home.${card}Body`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">{t('home.platformEyebrow')}</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink">{t('home.platformTitle')}</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURE_GROUPS.map((g) => (
              <div key={g.key} className="rounded-2xl border border-line bg-white p-6">
                <p className="font-semibold text-ink">{m.group(g)}</p>
                <ul className="mt-3 space-y-1.5">
                  {g.items.slice(0, 5).map((f) => (
                    <li key={f.slug}>
                      <Link to={`/features/${f.slug}`} className="flex items-center gap-2 text-sm text-ink-muted hover:text-brand">
                        <f.icon size={16} className="text-brand" aria-hidden />{m.feature(f)}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to={`/features/${g.items[0].slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                  {t('home.explore', { group: m.group(g).toLowerCase() })} <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-ink">{t('home.industries')}</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {SOLUTION_COLUMNS.flatMap((c) => c.items).map((s) => (
              <Link key={s.slug} to={`/solutions/${s.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm text-ink hover:border-brand hover:text-brand">
                <s.icon size={16} className="text-brand" aria-hidden />{m.solution(s)}
              </Link>
            ))}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">{t('home.pricingEyebrow')}</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink">{t('home.pricingTitle')}</h2>
            <p className="mt-3 text-base leading-7 text-ink-muted">{t('home.pricingLead')}</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {PRICING_TIERS.map((tier, i) => (
              <div
                key={tier.key}
                className={`flex flex-col rounded-3xl border bg-white p-5 shadow-sm ${tier.featured ? 'border-brand ring-1 ring-brand/30' : 'border-line'}`}
              >
                {tier.featured && (
                  <span className="mb-3 inline-flex w-fit rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">{t('home.mostPopular')}</span>
                )}
                <h3 className="text-lg font-semibold text-ink">{t(`tiers.${tier.key}.name`)}</h3>
                <p className="mt-1 text-sm text-ink-muted">{t(`tiers.${tier.key}.blurb`)}</p>
                <div className="mt-4">
                  <span className="whitespace-nowrap text-3xl font-semibold text-ink">{t(`tiers.${tier.key}.price`)}</span>
                  <span className="block text-sm text-ink-muted">{t(`tiers.${tier.key}.cadence`)}</span>
                </div>
                {i > 0 && <p className="mt-4 text-xs font-semibold text-ink">{t('home.everythingIn', { plan: t(`tiers.${PRICING_TIERS[i - 1].key}.name`) })}</p>}
                <ul className={`${i > 0 ? 'mt-2' : 'mt-4'} space-y-2 text-sm text-ink-muted`}>
                  {Array.from({ length: tier.features }, (_, i) => `f${i + 1}`).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                      {t(`tiers.${tier.key}.${f}`)}
                    </li>
                  ))}
                </ul>
                <Link
                  to={tier.href === '#demo' ? '/#demo' : tier.href}
                  className={`mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tier.featured ? 'bg-brand text-white hover:bg-brand-600' : 'border border-line bg-white text-ink hover:bg-surface'}`}
                >
                  {t(`tiers.${tier.key}.cta`)}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-ink-muted">{t('home.pricingNote')}</p>
        </section>

        <section id="resources" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-10 lg:px-8">
          <div className="rounded-3xl border border-line bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">{t('home.resourcesEyebrow')}</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">{t('home.resourcesTitle')}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {RESOURCES.flat().filter((r) => !r.href).map((r) => (
                <Link key={r.slug} to={resourceHref(r)} className="rounded-2xl border border-line p-5 hover:border-brand hover:bg-surface">
                  <r.icon size={20} className="text-brand" aria-hidden />
                  <p className="mt-2 font-semibold text-ink">{m.resource(r)}</p>
                  <p className="mt-1 text-sm text-ink-muted">{m.resourceSummary(r)}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="grid gap-8 rounded-3xl border border-line bg-white p-8 shadow-sm lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">{t('home.demoEyebrow')}</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink">{t('home.demoTitle')}</h2>
              <p className="mt-3 text-base leading-7 text-ink-muted">
                {t('home.demoLead')}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">{t('home.name')}</label>
                  <Input
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    placeholder="Alex Nguyen"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">{t('home.workEmail')}</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                    placeholder="alex@company.com"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('home.company')}</label>
                <Input
                  value={formData.company}
                  onChange={(event) => setFormData({ ...formData, company: event.target.value })}
                  placeholder="Acme Facilities"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('home.about')}</label>
                <textarea
                  value={formData.message}
                  onChange={(event) => setFormData({ ...formData, message: event.target.value })}
                  rows={4}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  placeholder={t('home.aboutPlaceholder')}
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="submit">{t('home.submit')}</Button>
                <p className="text-sm text-ink-muted">{t('home.replyTime')}</p>
              </div>
              {submitted && (
                <div className="rounded-lg border border-brand/20 bg-brand/10 p-3 text-sm text-brand">
                  {t('home.thanks')}
                </div>
              )}
            </form>
          </div>
        </section>
    </MarketingLayout>
  );
}
