import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Boxes, CheckCircle2, ClipboardList, Hourglass, MapPin, Package, Plus, UserPlus, Users, Circle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { useDashboardKpis, useRecentRequests, useFaultTypes } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { REQUEST_STATUS_CLASS } from '../lib/ui';
import { orgLogoUrl } from '../lib/orgLogo';
import Pill from '../components/ui/Pill';

// Category donut: brand shades, then neutrals.
const SLICE_COLORS = ['#C9461F', '#E8552D', '#F2A48C', '#6B7280', '#D1D5DB'];
const REPORTED_COLOR = '#E8552D';
const RESOLVED_COLOR = '#F2A48C';

const card = 'rounded-2xl border border-line bg-white p-5 shadow-sm';

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const { user } = useAuth();
  const { currentOrg, role } = useOrg();
  const isAdmin = role === 'org_admin';
  const isStaff = role === 'org_admin' || role === 'manager' || role === 'technician';
  // Counts come from the database (exact at any size, limited by RLS); only
  // the most recent requests are fetched.
  const kpis = useDashboardKpis().data;
  const recentQuery = useRecentRequests(6);
  const faultTypes = useFaultTypes();

  const faultName = (id: string | null) => {
    const ft = faultTypes.data?.find((x) => x.id === id);
    return ft ? resolveI18n(ft.name_i18n, lng) : t('dashboard.uncategorised');
  };
  const show = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString(lng));
  const fullName = (user?.user_metadata?.full_name as string | undefined)?.trim();
  const greetingName = fullName ? fullName.split(/\s+/)[0] : user?.email?.split('@')[0] ?? '';
  const logo = orgLogoUrl(currentOrg?.logo_path);

  const cards = [
    { key: 'tasks', value: kpis?.tasks, icon: ClipboardList, to: '/work-orders' },
    { key: 'pendingTasks', value: kpis?.pending_tasks, icon: Hourglass, to: '/work-orders' },
    { key: 'assets', value: kpis?.assets, icon: Boxes, to: '/assets' },
    { key: 'completed', value: kpis?.completed_7d, icon: CheckCircle2, to: '/work-orders' },
  ];

  const setup = kpis?.setup;
  const todo = [
    { key: 'team', done: (setup?.members ?? 0) > 1 || (setup?.invites ?? 0) > 0, to: '/settings?tab=team', icon: Users },
    { key: 'asset', done: (setup?.assets ?? 0) > 0, to: '/assets', icon: Boxes },
    { key: 'parts', done: (setup?.parts ?? 0) > 0, to: '/parts', icon: Package },
    { key: 'location', done: (setup?.locations ?? 0) > 0, to: '/locations', icon: MapPin },
  ];
  const todoLeft = todo.filter((x) => !x.done).length;

  const categories = kpis?.categories ?? [];
  const catTotal = categories.reduce((a, c) => a + c.count, 0);
  const recent = recentQuery.data ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      {/* Welcome */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {logo ? (
            <img src={logo} alt="" className="h-14 w-14 shrink-0 rounded-2xl border border-line bg-white object-contain p-1" />
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-xl font-bold text-brand-600">
              {(currentOrg?.name ?? '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t('dashboard.hello', { name: greetingName })}</h1>
            <p className="mt-0.5 truncate text-base text-ink-muted">{t('dashboard.welcomeTo', { org: currentOrg?.name ?? '' })}</p>
          </div>
        </div>
        <Link
          to="/requests/new"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-6 text-base font-semibold text-white shadow-sm hover:bg-brand-600"
        >
          <Plus size={20} aria-hidden /> {t('dashboard.create')}
        </Link>
      </div>

      {(kpis?.overdue ?? 0) > 0 && (
        <Link to="/work-orders" className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-status-crit">
          <AlertTriangle size={16} aria-hidden /> {t('dashboard.overdueBanner', { count: kpis?.overdue })}
        </Link>
      )}

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map(({ key, value, icon: Icon, to }) => (
          <Link
            key={key}
            to={to}
            className="group rounded-2xl bg-gradient-to-br from-brand to-brand-600 p-4 text-white shadow-sm transition hover:shadow-md sm:p-5"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20">
              <Icon size={20} aria-hidden />
            </span>
            <p className="mt-4 text-sm font-medium leading-snug text-white/90">{t(`dashboard.cards.${key}`)}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{show(value)}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Weekly report */}
        <section className={`${card} lg:col-span-2`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">{t('dashboard.weekly')}</h2>
              <p className="text-sm text-ink-muted">{t('dashboard.weeklySubtitle')}</p>
            </div>
            <div className="flex items-center gap-4 text-sm text-ink-muted">
              <Legend color={REPORTED_COLOR} label={t('dashboard.reported')} />
              <Legend color={RESOLVED_COLOR} label={t('dashboard.resolvedLegend')} />
            </div>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-[10rem_1fr]">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-1 sm:content-start">
              <div className="rounded-xl bg-brand-50 p-3">
                <dt className="text-sm text-ink-muted">{t('dashboard.faultsReported')}</dt>
                <dd className="mt-1 text-3xl font-bold text-brand-600">{show(kpis?.faults_7d)}</dd>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <dt className="text-sm text-ink-muted">{t('dashboard.faultsResolved')}</dt>
                <dd className="mt-1 text-3xl font-bold text-ink">{show(kpis?.resolved_7d)}</dd>
              </div>
            </dl>
            <WeeklyBars days={kpis?.daily ?? []} lng={lng} label={t('dashboard.chartLabel')} reportedLabel={t('dashboard.reported')} resolvedLabel={t('dashboard.resolvedLegend')} />
          </div>
        </section>

        {/* Recent activity */}
        <section className={`${card} lg:row-span-2`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">{t('dashboard.recentActivity')}</h2>
            <Link to="/requests" className="text-sm font-medium text-brand hover:text-brand-600">
              {t('actions.viewAll')}
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-ink-muted">{t('dashboard.hint')}</p>
          ) : (
            <ol className="relative mt-4 space-y-1 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-line">
              {recent.map((r) => (
                <li key={r.id} className="relative">
                  <Link to={`/requests/${r.id}`} className="flex gap-3 rounded-xl py-2.5 pr-2 hover:bg-surface">
                    <span className="relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-[3px] border-white bg-brand shadow-[0_0_0_1px_#E8552D]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{r.title ?? '—'}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {faultName(r.fault_type_id)} · {timeAgo(r.created_at, lng, t('dashboard.justNow'))}
                      </p>
                      <Pill className={`mt-1.5 ${REQUEST_STATUS_CLASS[r.status]}`}>{t(`requestStatus.${r.status}`)}</Pill>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Category */}
        <section className={card}>
          <h2 className="text-lg font-semibold text-ink">{t('dashboard.category')}</h2>
          <p className="text-sm text-ink-muted">{t('dashboard.last30')}</p>
          {catTotal === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">{t('dashboard.noCategories')}</p>
          ) : (
            <div className="mt-4 flex items-center gap-5">
              <Donut values={categories.map((c) => c.count)} total={catTotal} lng={lng} />
              <ul className="min-w-0 flex-1 space-y-2 text-sm">
                {categories.map((c, i) => (
                  <li key={c.fault_type_id ?? 'none'} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-ink">{faultName(c.fault_type_id)}</span>
                    <span className="font-medium text-ink-muted">{Math.round((c.count / catTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* To do / quick actions */}
        {isAdmin ? (
          <section className={card}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">{t('dashboard.todo')}</h2>
              {todoLeft > 0 && (
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600">{t('dashboard.todoLeft', { count: todoLeft })}</span>
              )}
            </div>
            <ul className="mt-3 space-y-1">
              {todo.map(({ key, done, to, icon: Icon }) => (
                <li key={key}>
                  <Link to={to} className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 text-sm hover:bg-surface">
                    {done ? (
                      <CheckCircle2 size={20} className="shrink-0 text-status-ok" aria-label={t('dashboard.done')} />
                    ) : (
                      <Circle size={20} className="shrink-0 text-line" aria-hidden />
                    )}
                    <Icon size={18} className="shrink-0 text-ink-muted" aria-hidden />
                    <span className={`flex-1 ${done ? 'text-ink-muted line-through' : 'font-medium text-ink'}`}>{t(`dashboard.todoItems.${key}`)}</span>
                    {!done && (
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-brand">
                        <Plus size={16} aria-hidden />
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              to="/settings?tab=team"
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-600"
            >
              <UserPlus size={18} aria-hidden /> {t('dashboard.invite')}
            </Link>
          </section>
        ) : (
          <section className={card}>
            <h2 className="text-lg font-semibold text-ink">{t('dashboard.quickActions')}</h2>
            <div className="mt-3 grid gap-2">
              <Link to="/requests/new" className="flex min-h-[44px] items-center gap-2 rounded-xl bg-surface px-3 text-sm font-medium text-ink hover:bg-line">
                <Plus size={16} aria-hidden /> {t('dashboard.create')}
              </Link>
              {isStaff && (
                <Link to="/my-work" className="flex min-h-[44px] items-center gap-2 rounded-xl bg-surface px-3 text-sm font-medium text-ink hover:bg-line">
                  <ClipboardList size={16} aria-hidden /> {t('nav.myWork')}
                </Link>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function timeAgo(iso: string, lng: string, justNow: string) {
  const secs = (new Date(iso).getTime() - Date.now()) / 1000;
  if (Math.abs(secs) < 60) return justNow;
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['minute', 60], ['hour', 3600], ['day', 86400], ['week', 604800]];
  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let size = 60;
  for (const [u, s] of steps) if (Math.abs(secs) >= s) [unit, size] = [u, s];
  if (Math.abs(secs) >= 2592000) {
    return new Date(iso).toLocaleDateString(lng, { day: 'numeric', month: 'short' });
  }
  return rtf.format(Math.round(secs / size), unit);
}

/** Grouped bars: faults reported and resolved per day. */
function WeeklyBars({
  days,
  lng,
  label,
  reportedLabel,
  resolvedLabel,
}: {
  days: { day: string; reported: number; resolved: number }[];
  lng: string;
  label: string;
  reportedLabel: string;
  resolvedLabel: string;
}) {
  const max = Math.max(1, ...days.flatMap((d) => [d.reported, d.resolved]));
  // A round axis top (1, 2, 5, 10, 20, 50…) so gridlines land on whole numbers.
  const mag = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= max) ?? max;
  const ticks = [0, top / 2, top].filter((v, i, a) => Number.isInteger(v) && a.indexOf(v) === i);
  const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(lng, { weekday: 'short' });

  return (
    <figure className="min-w-0">
      <div className="flex h-48 gap-2">
        <div className="flex flex-col justify-between pb-6 text-right text-xs text-ink-muted" aria-hidden>
          {[...ticks].reverse().map((v) => (
            <span key={v} className="leading-none">
              {v.toLocaleString(lng)}
            </span>
          ))}
        </div>
        <div className="relative flex-1" role="img" aria-label={label}>
          <div className="absolute inset-x-0 bottom-6 top-0 flex flex-col justify-between" aria-hidden>
            {ticks.map((v) => (
              <div key={v} className="border-t border-dashed border-line" />
            ))}
          </div>
          <div className="relative flex h-full items-end justify-between gap-1 sm:gap-2">
            {(days.length ? days : Array.from({ length: 7 }, () => null)).map((d, i) => (
              <div key={d?.day ?? i} className="flex h-full flex-1 flex-col items-center">
                <div className="flex w-full flex-1 items-end justify-center gap-1">
                  {d &&
                    ([
                      [d.reported, REPORTED_COLOR, reportedLabel],
                      [d.resolved, RESOLVED_COLOR, resolvedLabel],
                    ] as const).map(([v, color, name]) => (
                      <div
                        key={name}
                        className="w-full max-w-[18px] rounded-t-md transition-[height]"
                        style={{ height: `${(v / top) * 100}%`, minHeight: v ? 4 : 0, background: color }}
                        title={`${weekday(d.day)} · ${name}: ${v}`}
                      />
                    ))}
                </div>
                <span className="mt-2 h-4 text-xs text-ink-muted">{d ? weekday(d.day) : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

function Donut({ values, total, lng }: { values: number[]; total: number; lng: string }) {
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  const r = 36;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#F7F7F8" strokeWidth="16" />
        {values.map((v, i) => {
          const len = (v / sum) * c;
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
              strokeWidth="16"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-bold text-ink">{total.toLocaleString(lng)}</span>
    </div>
  );
}
