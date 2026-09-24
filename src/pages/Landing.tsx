import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const FEATURE_CARDS = ['workOrders', 'maintenance', 'reporting'] as const;
const PROOF_POINTS = ['response', 'reliable', 'visibility'] as const;
const WHY_SWITCH = ['missed', 'visibility', 'admin'] as const;
const RESOURCES = ['guides', 'blog', 'help'] as const;

const FEATURES_MENU = ['workOrders', 'preventive', 'assets', 'workflows', 'surveys', 'iot'].map((key) => ({ key, href: '#features' }));
const SOLUTIONS_MENU = ['facilities', 'property', 'manufacturing', 'healthcare', 'education', 'retail'].map((key) => ({ key, href: '#demo' }));

const PRICING_TIERS = [
  { key: 'starter', price: '$0', featured: false },
  { key: 'growth', price: '$49', featured: true },
  { key: 'enterprise', price: null, featured: false },
] as const;

function NavDropdown({ label, prefix, items }: { label: string; prefix: string; items: { key: string; href: string }[] }) {
  const { t } = useTranslation('landing');
  return (
    <div className="group relative">
      <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand">
        {label}
        <ChevronDown size={15} className="transition group-hover:rotate-180" aria-hidden />
      </button>
      <div className="absolute left-0 top-full z-20 hidden min-w-[15rem] pt-3 group-hover:block">
        <div className="rounded-xl border border-line bg-white p-2 shadow-lg">
          {items.map((item) => (
            <a key={item.key} href={item.href} className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface hover:text-brand">
              {t(`${prefix}.${item.key}`)}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation('landing');
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand font-semibold text-white">
            F
          </div>
          <div>
            <p className="text-lg font-semibold">FacilitySpace</p>
            <p className="text-sm text-ink-muted">{t('tagline')}</p>
          </div>
        </div>

        <nav className="hidden items-center gap-6 lg:flex">
          <a href="#pricing" className="text-sm font-medium text-ink-muted hover:text-brand">{t('nav.pricing')}</a>
          <NavDropdown label={t('nav.features')} prefix="featuresMenu" items={FEATURES_MENU} />
          <a href="#resources" className="text-sm font-medium text-ink-muted hover:text-brand">{t('nav.resources')}</a>
          <NavDropdown label={t('nav.solutions')} prefix="solutionsMenu" items={SOLUTIONS_MENU} />
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/signin" className="text-sm font-medium text-ink-muted hover:text-brand">
            {t('nav.signIn')}
          </Link>
          <a href="#demo" className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
            {t('nav.requestDemo')}
          </a>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
              {t('hero.badge')}
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              {t('hero.title')}
            </h1>
            <p className="mt-5 text-lg leading-8 text-ink-muted">
              {t('hero.body')}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#demo" className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600">
                {t('hero.bookDemo')}
              </a>
              <Link to="/signin" className="inline-flex items-center justify-center rounded-lg border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface">
                {t('hero.explore')}
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {PROOF_POINTS.map((point) => (
                <span key={point} className="rounded-full border border-line bg-white px-3 py-1 text-sm text-ink-muted">
                  {t(`proofPoints.${point}`)}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <div className="rounded-2xl bg-surface p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">{t('why.title')}</p>
              <ul className="mt-4 space-y-4 text-sm text-ink-muted">
                {WHY_SWITCH.map((item) => (
                  <li key={item} className="rounded-xl border border-line bg-white p-4">
                    <p className="font-semibold text-ink">{t(`why.${item}.title`)}</p>
                    <p className="mt-1">{t(`why.${item}.body`)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURE_CARDS.map((card) => (
              <div key={card} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">{t(`featureCards.${card}.title`)}</h2>
                <p className="mt-2 text-sm leading-7 text-ink-muted">{t(`featureCards.${card}.description`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">{t('pricing.eyebrow')}</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink">{t('pricing.title')}</h2>
            <p className="mt-3 text-base leading-7 text-ink-muted">{t('pricing.subtitle')}</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.key}
                className={`flex flex-col rounded-3xl border bg-white p-6 shadow-sm ${tier.featured ? 'border-brand ring-1 ring-brand/30' : 'border-line'}`}
              >
                {tier.featured && (
                  <span className="mb-3 inline-flex w-fit rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">{t('pricing.mostPopular')}</span>
                )}
                <h3 className="text-lg font-semibold text-ink">{t(`pricing.tiers.${tier.key}.name`)}</h3>
                <p className="mt-1 text-sm text-ink-muted">{t(`pricing.tiers.${tier.key}.blurb`)}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-ink">{tier.price ?? t('pricing.letsTalk')}</span>
                  <span className="text-sm text-ink-muted">/ {tier.price ? t('pricing.perMonth') : t('pricing.custom')}</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                  {(t(`pricing.tiers.${tier.key}.features`, { returnObjects: true }) as string[]).map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                <a
                  href="#demo"
                  className={`mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tier.featured ? 'bg-brand text-white hover:bg-brand-600' : 'border border-line bg-white text-ink hover:bg-surface'}`}
                >
                  {t(`pricing.tiers.${tier.key}.cta`)}
                </a>
              </div>
            ))}
          </div>
        </section>

        <section id="resources" className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
          <div className="rounded-3xl border border-line bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">{t('resources.eyebrow')}</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">{t('resources.title')}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {RESOURCES.map((item) => (
                <a key={item} href="#demo" className="rounded-2xl border border-line p-5 hover:border-brand hover:bg-surface">
                  <p className="font-semibold text-ink">{t(`resources.${item}.title`)}</p>
                  <p className="mt-1 text-sm text-ink-muted">{t(`resources.${item}.body`)}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="grid gap-8 rounded-3xl border border-line bg-white p-8 shadow-sm lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">{t('demo.eyebrow')}</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink">{t('demo.title')}</h2>
              <p className="mt-3 text-base leading-7 text-ink-muted">
                {t('demo.body')}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">{t('demo.name')}</label>
                  <Input
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    placeholder={t('demo.namePlaceholder')}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">{t('demo.email')}</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                    placeholder={t('demo.emailPlaceholder')}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('demo.company')}</label>
                <Input
                  value={formData.company}
                  onChange={(event) => setFormData({ ...formData, company: event.target.value })}
                  placeholder={t('demo.companyPlaceholder')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('demo.message')}</label>
                <textarea
                  value={formData.message}
                  onChange={(event) => setFormData({ ...formData, message: event.target.value })}
                  rows={4}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  placeholder={t('demo.messagePlaceholder')}
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="submit">{t('nav.requestDemo')}</Button>
                <p className="text-sm text-ink-muted">{t('demo.replyTime')}</p>
              </div>
              {submitted && (
                <div className="rounded-lg border border-brand/20 bg-brand/10 p-3 text-sm text-brand">
                  {t('demo.thanks')}
                </div>
              )}
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-sm text-ink-muted lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
          <div className="flex gap-4">
            <a href="#pricing" className="hover:text-brand">{t('nav.pricing')}</a>
            <a href="#resources" className="hover:text-brand">{t('nav.resources')}</a>
            <Link to="/signin" className="hover:text-brand">{t('nav.signIn')}</Link>
            <a href="#demo" className="hover:text-brand">{t('footer.bookDemo')}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
