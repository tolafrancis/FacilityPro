import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

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

const FEATURES_MENU = [
  { label: 'Work orders & requests', href: '#features' },
  { label: 'Preventive maintenance', href: '#features' },
  { label: 'Assets & inventory', href: '#features' },
  { label: 'Workflows & automation', href: '#features' },
  { label: 'Surveys & feedback', href: '#features' },
  { label: 'IoT & sensors', href: '#features' },
];

const SOLUTIONS_MENU = [
  { label: 'Facilities management', href: '#demo' },
  { label: 'Property management', href: '#demo' },
  { label: 'Manufacturing', href: '#demo' },
  { label: 'Healthcare', href: '#demo' },
  { label: 'Education', href: '#demo' },
  { label: 'Retail & hospitality', href: '#demo' },
];

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

function NavDropdown({ label, items }: { label: string; items: { label: string; href: string }[] }) {
  return (
    <div className="group relative">
      <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand">
        {label}
        <ChevronDown size={15} className="transition group-hover:rotate-180" aria-hidden />
      </button>
      <div className="absolute left-0 top-full z-20 hidden min-w-[15rem] pt-3 group-hover:block">
        <div className="rounded-xl border border-line bg-white p-2 shadow-lg">
          {items.map((item) => (
            <a key={item.label} href={item.href} className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface hover:text-brand">
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
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
            <p className="text-sm text-ink-muted">Operations made simple</p>
          </div>
        </div>

        <nav className="hidden items-center gap-6 lg:flex">
          <a href="#pricing" className="text-sm font-medium text-ink-muted hover:text-brand">Pricing</a>
          <NavDropdown label="Features" items={FEATURES_MENU} />
          <a href="#resources" className="text-sm font-medium text-ink-muted hover:text-brand">Resources</a>
          <NavDropdown label="Solutions" items={SOLUTIONS_MENU} />
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/signin" className="text-sm font-medium text-ink-muted hover:text-brand">
            Sign in
          </Link>
          <a href="#demo" className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
            Request demo
          </a>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
              Built for facilities teams that need calm, coordinated operations
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Bring maintenance, requests, and assets into one reliable command center.
            </h1>
            <p className="mt-5 text-lg leading-8 text-ink-muted">
              FacilitySpace helps operations leaders cut response times, keep assets healthy, and give teams a single place to work faster with less friction.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#demo" className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600">
                Book a demo
              </a>
              <Link to="/signin" className="inline-flex items-center justify-center rounded-lg border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface">
                Explore the platform
              </Link>
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

        <section id="features" className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {featureCards.map((card) => (
              <div key={card.title} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">{card.title}</h2>
                <p className="mt-2 text-sm leading-7 text-ink-muted">{card.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
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

        <section id="resources" className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
          <div className="rounded-3xl border border-line bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">Resources</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">Everything you need to get more from FacilitySpace.</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <a href="#demo" className="rounded-2xl border border-line p-5 hover:border-brand hover:bg-surface">
                <p className="font-semibold text-ink">Guides & docs</p>
                <p className="mt-1 text-sm text-ink-muted">Step-by-step setup and best practices for your team.</p>
              </a>
              <a href="#demo" className="rounded-2xl border border-line p-5 hover:border-brand hover:bg-surface">
                <p className="font-semibold text-ink">Blog</p>
                <p className="mt-1 text-sm text-ink-muted">Trends and tips for modern facilities operations.</p>
              </a>
              <a href="#demo" className="rounded-2xl border border-line p-5 hover:border-brand hover:bg-surface">
                <p className="font-semibold text-ink">Help center</p>
                <p className="mt-1 text-sm text-ink-muted">Answers, FAQs, and support when you need it.</p>
              </a>
            </div>
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="grid gap-8 rounded-3xl border border-line bg-white p-8 shadow-sm lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">Request a demo</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink">See how FacilitySpace fits your operation.</h2>
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
      </main>

      <footer className="border-t border-line bg-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-sm text-ink-muted lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>© 2026 FacilitySpace. Built for modern facilities teams.</p>
          <div className="flex gap-4">
            <a href="#pricing" className="hover:text-brand">Pricing</a>
            <a href="#resources" className="hover:text-brand">Resources</a>
            <Link to="/signin" className="hover:text-brand">Sign in</Link>
            <a href="#demo" className="hover:text-brand">Book demo</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
