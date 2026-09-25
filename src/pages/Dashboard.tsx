import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Boxes, CheckCircle2, ClipboardList, Hourglass, MapPin, Package, Plus, UserPlus, Users, Circle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { useDashboardKpis, useRecentRequests, useFaultTypes } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITY_CLASS, REQUEST_STATUS_CLASS } from '../lib/ui';
import { orgLogoUrl } from '../lib/orgLogo';
import Pill from '../components/ui/Pill';

// Category donut: brand shades, then neutrals.
const SLICE_COLORS = ['#C9461F', '#E8552D', '#F2A48C', '#6B7280', '#D1D5DB'];

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const { user } = useAuth();
  const { currentOrg, role } = useOrg();
  const isAdmin = role === 'org_admin';
  const isStaff = role === 'org_admin' || role === 'manager' || role === 'technician';
  // Counts come from the database (exact at any size, limited by RLS); only
  // the six most recent requests are fetched.
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
    <div className="mx-auto max-w-6xl">
      {/* Welcome */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {logo ? (
            <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-line bg-white object-contain p-1" />
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-lg font-bold text-brand-600">
              {(currentOrg?.name ?? '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-ink sm:text-2xl">{t('dashboard.hello', { name: greetingName })}</h1>
            <p className="truncate text-sm text-ink-muted">{t('dashboard.welcomeTo', { org: currentOrg?.name ?? '' })}</p>
          </div>
        </div>
        <Link
          to="/requests/new"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Plus size={18} aria-hidden /> {t('dashboard.create')}
        </Link>
      </div>

      {(kpis?.overdue ?? 0) > 0 && (
        <Link to="/work-orders" className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-status-crit">
          <AlertTriangle size={16} aria-hidden /> {t('dashboard.overdueBanner', { count: kpis?.overdue })}
        </Link>
      )}

      {/* Stat cards */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ key, value, icon: Icon, to }) => (
          <Link key={key} to={to} className="rounded-xl bg-brand-600 p-4 text-white shadow-sm transition hover:bg-brand sm:p-5">
            <Icon size={22} aria-hidden className="opacity-90" />
            <p className="mt-3 text-xs font-medium text-white/90 sm:text-sm">{t(`dashboard.cards.${key}`)}</p>
            <p className="mt-1 text-2xl font-bold sm:text-3xl">{show(value)}</p>
          </Link>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* Weekly */}
        <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
          <h2 className="font-semibold text-ink">{t('dashboard.weekly')}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div>
              <dt className="text-sm text-ink-muted">{t('dashboard.faultsReported')}</dt>
              <dd className="text-3xl font-bold text-brand-600">{show(kpis?.faults_7d)}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">{t('dashboard.faultsResolved')}</dt>
              <dd className="text-3xl font-bold text-brand-600">{show(kpis?.resolved_7d)}</dd>
            </div>
          </dl>
        </section>

        {/* Category */}
        <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
          <h2 className="font-semibold text-ink">{t('dashboard.category')}</h2>
          {catTotal === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">{t('dashboard.noCategories')}</p>
          ) : (
            <div className="mt-3 flex items-center gap-4">
              <Donut values={categories.map((c) => c.count)} />
              <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
                {categories.map((c, i) => (
                  <li key={c.fault_type_id ?? 'none'} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-ink">{faultName(c.fault_type_id)}</span>
                    <span className="text-ink-muted">{Math.round((c.count / catTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-xs text-ink-muted">{t('dashboard.last30')}</p>
        </section>

        {/* To do */}
        {isAdmin ? (
          <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">{t('dashboard.todo')}</h2>
              {todoLeft > 0 && <span className="text-xs text-ink-muted">{t('dashboard.todoLeft', { count: todoLeft })}</span>}
            </div>
            <ul className="mt-2">
              {todo.map(({ key, done, to, icon: Icon }) => (
                <li key={key}>
                  <Link to={to} className="flex min-h-[44px] items-center gap-3 rounded-lg px-1 text-sm hover:bg-surface">
                    {done ? <CheckCircle2 size={18} className="text-status-ok" aria-label={t('dashboard.done')} /> : <Circle size={18} className="text-line" aria-hidden />}
                    <Icon size={16} className="text-ink-muted" aria-hidden />
                    <span className={`flex-1 ${done ? 'text-ink-muted line-through' : 'font-medium text-ink'}`}>{t(`dashboard.todoItems.${key}`)}</span>
                    {!done && <Plus size={16} className="text-brand" aria-hidden />}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              to="/settings?tab=team"
              className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-brand text-sm font-semibold text-brand hover:bg-brand-50"
            >
              <UserPlus size={18} aria-hidden /> {t('dashboard.invite')}
            </Link>
          </section>
        ) : (
          <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
            <h2 className="font-semibold text-ink">{t('dashboard.quickActions')}</h2>
            <div className="mt-3 grid gap-2">
              <Link to="/requests/new" className="flex min-h-[44px] items-center gap-2 rounded-lg bg-surface px-3 text-sm font-medium text-ink hover:bg-line">
                <Plus size={16} aria-hidden /> {t('dashboard.create')}
              </Link>
              {isStaff && (
                <Link to="/my-work" className="flex min-h-[44px] items-center gap-2 rounded-lg bg-surface px-3 text-sm font-medium text-ink hover:bg-line">
                  <ClipboardList size={16} aria-hidden /> {t('nav.myWork')}
                </Link>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Recent activity */}
      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-ink">{t('dashboard.recentActivity')}</h2>
          <Link to="/requests" className="text-sm font-medium text-brand hover:text-brand-600">
            {t('actions.viewAll')}
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-6 text-sm text-ink-muted">{t('dashboard.hint')}</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            {recent.map((r) => (
              <Link
                key={r.id}
                to={`/requests/${r.id}`}
                className="flex flex-col gap-2 border-b border-line px-4 py-3 text-sm last:border-0 hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{r.title ?? '—'}</p>
                  <p className="text-xs text-ink-muted">
                    {faultName(r.fault_type_id)} · {formatDate(r.created_at, lng)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Pill className={PRIORITY_CLASS[r.priority]}>{t(`priority.${r.priority}`)}</Pill>
                  <Pill className={REQUEST_STATUS_CLASS[r.status]}>{t(`requestStatus.${r.status}`)}</Pill>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Donut({ values }: { values: number[] }) {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const r = 36;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#F7F7F8" strokeWidth="18" />
      {values.map((v, i) => {
        const len = (v / total) * c;
        const el = (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
            strokeWidth="18"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}
