import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import MarketingLayout, { TrialForm } from '../marketing/MarketingLayout';
import { FEATURE_GROUPS, RESOURCES, SOLUTION_COLUMNS, resourceHref } from '../marketing/content';

const featureCards = [
  {
    title: 'Centralize work orders',
    description: 'Track requests, assign technicians, and keep every job moving from one shared workspace.',
  },
  {
    title: 'Stay ahead of maintenance',
    description: 'Plan preventive tasks, monitor asset health, and reduce downtime before it becomes costly.',
  },
  {
    title: 'Make reporting effortless',
    description: 'Give managers a clear view of progress, costs, and team performance with real-time insights.',
  },
];

const proofPoints = ['Reduce response time', 'Keep assets reliable', 'Improve team visibility'];

const PRICING_TIERS = [
  {
    name: 'Starter',
    price: '$0',
    cadence: 'per month',
    blurb: 'For small teams getting organized.',
    features: ['Up to 5 users', 'Work orders & requests', 'Basic reporting'],
    cta: 'Start free',
  },
  {
    name: 'Growth',
    price: '$49',
    cadence: 'per month',
    blurb: 'For growing operations that need automation.',
    features: ['Unlimited users', 'Preventive maintenance', 'Workflows & surveys', 'Email & SMS alerts'],
    cta: 'Book a demo',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: "Let's talk",
    cadence: 'custom',
    blurb: 'For multi-site teams with advanced needs.',
    features: ['SSO & advanced security', 'IoT & sensors', 'Dedicated support', 'Custom integrations'],
    cta: 'Contact sales',
  },
];

export default function Landing() {
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
              Built for facilities teams that need calm, coordinated operations
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Bring maintenance, requests, and assets into one reliable command center.
            </h1>
            <p className="mt-5 text-lg leading-8 text-ink-muted">
              FacilityPro helps operations leaders cut response times, keep assets healthy, and give teams a single place to work faster with less friction.
            </p>
            <div className="mt-8">
              <TrialForm size="lg" />
              <p className="mt-2 text-sm text-ink-muted">
                Free trial · no credit card required · or <a href="#demo" className="font-medium text-brand hover:underline">book a demo</a>
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {proofPoints.map((point) => (
                <span key={point} className="rounded-full border border-line bg-white px-3 py-1 text-sm text-ink-muted">
                  {point}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <div className="rounded-2xl bg-surface p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">Why teams switch</p>
              <ul className="mt-4 space-y-4 text-sm text-ink-muted">
                <li className="rounded-xl border border-line bg-white p-4">
                  <p className="font-semibold text-ink">Fewer missed tasks</p>
                  <p className="mt-1">Automated reminders and clear ownership keep work from slipping through the cracks.</p>
                </li>
                <li className="rounded-xl border border-line bg-white p-4">
                  <p className="font-semibold text-ink">Better visibility</p>
                  <p className="mt-1">Everyone sees live status, priorities, and the next best action in one place.</p>
                </li>
                <li className="rounded-xl border border-line bg-white p-4">
                  <p className="font-semibold text-ink">Less admin overhead</p>
                  <p className="mt-1">Move from spreadsheets and chat threads to a cleaner operating flow.</p>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {featureCards.map((card) => (
              <div key={card.title} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">{card.title}</h2>
                <p className="mt-2 text-sm leading-7 text-ink-muted">{card.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">One platform</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink">Everything your facilities team runs on.</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURE_GROUPS.map((g) => (
              <div key={g.key} className="rounded-2xl border border-line bg-white p-6">
                <p className="font-semibold text-ink">{g.label}</p>
                <ul className="mt-3 space-y-1.5">
                  {g.items.slice(0, 5).map((f) => (
                    <li key={f.slug}>
                      <Link to={`/features/${f.slug}`} className="flex items-center gap-2 text-sm text-ink-muted hover:text-brand">
                        <f.icon size={16} className="text-brand" aria-hidden />{f.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to={`/features/${g.items[0].slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                  Explore {g.label.toLowerCase()} <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-ink">Built for your industry</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {SOLUTION_COLUMNS.flatMap((c) => c.items).map((s) => (
              <Link key={s.slug} to={`/solutions/${s.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm text-ink hover:border-brand hover:text-brand">
                <s.icon size={16} className="text-brand" aria-hidden />{s.title}
              </Link>
            ))}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink">Simple plans that scale with your team.</h2>
            <p className="mt-3 text-base leading-7 text-ink-muted">Start free, upgrade when you need automation and multi-site support.</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`flex flex-col rounded-3xl border bg-white p-6 shadow-sm ${tier.featured ? 'border-brand ring-1 ring-brand/30' : 'border-line'}`}
              >
                {tier.featured && (
                  <span className="mb-3 inline-flex w-fit rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">Most popular</span>
                )}
                <h3 className="text-lg font-semibold text-ink">{tier.name}</h3>
                <p className="mt-1 text-sm text-ink-muted">{tier.blurb}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-ink">{tier.price}</span>
                  <span className="text-sm text-ink-muted">/ {tier.cadence}</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                  {tier.features.map((feature) => (
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
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>
        </section>

        <section id="resources" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-10 lg:px-8">
          <div className="rounded-3xl border border-line bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">Resources</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">Everything you need to get more from FacilityPro.</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {RESOURCES.flat().filter((r) => !r.href).map((r) => (
                <Link key={r.slug} to={resourceHref(r)} className="rounded-2xl border border-line p-5 hover:border-brand hover:bg-surface">
                  <r.icon size={20} className="text-brand" aria-hidden />
                  <p className="mt-2 font-semibold text-ink">{r.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">{r.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="grid gap-8 rounded-3xl border border-line bg-white p-8 shadow-sm lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">Request a demo</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink">See how FacilityPro fits your operation.</h2>
              <p className="mt-3 text-base leading-7 text-ink-muted">
                Share a few details and our team will reach out to show you how the platform can support your maintenance and facilities workflow.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Name</label>
                  <Input
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    placeholder="Alex Nguyen"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Work email</label>
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
                <label className="mb-1 block text-sm font-medium text-ink">Company</label>
                <Input
                  value={formData.company}
                  onChange={(event) => setFormData({ ...formData, company: event.target.value })}
                  placeholder="Acme Facilities"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Tell us about your team</label>
                <textarea
                  value={formData.message}
                  onChange={(event) => setFormData({ ...formData, message: event.target.value })}
                  rows={4}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  placeholder="We manage 12 sites and want a better way to coordinate PMs and requests."
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="submit">Request demo</Button>
                <p className="text-sm text-ink-muted">We typically reply within one business day.</p>
              </div>
              {submitted && (
                <div className="rounded-lg border border-brand/20 bg-brand/10 p-3 text-sm text-brand">
                  Thank you. We’ve captured your request and will be in touch shortly.
                </div>
              )}
            </form>
          </div>
        </section>
    </MarketingLayout>
  );
}
