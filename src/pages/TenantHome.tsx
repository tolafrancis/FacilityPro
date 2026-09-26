import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ClipboardList, Megaphone, Wrench } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { useAnnouncements, useRecentRequests } from '../lib/queries';
import { formatDate, REQUEST_STATUS_CLASS } from '../lib/ui';
import { orgLogoUrl } from '../lib/orgLogo';
import Pill from '../components/ui/Pill';

/**
 * Home screen for tenants (the occupant role): report a fault, follow their
 * own requests (RLS only returns theirs, 0081) and read the building's
 * announcements.
 */
export default function TenantHome() {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const requests = useRecentRequests(5);
  const announcements = useAnnouncements(3);

  const fullName = (user?.user_metadata?.full_name as string | undefined)?.trim();
  const greetingName = fullName ? fullName.split(/\s+/)[0] : user?.email?.split('@')[0] ?? '';
  const logo = orgLogoUrl(currentOrg?.logo_path);
  const mine = requests.data ?? [];
  const news = announcements.data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
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

      {/* Report */}
      <Link
        to="/requests/new"
        data-tour="report-fault"
        className="mt-6 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-brand to-brand-600 p-5 text-white shadow-sm transition hover:shadow-md sm:p-6"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/20">
          <Wrench size={24} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold">{t('tenant.reportTitle')}</span>
          <span className="mt-0.5 block text-sm text-white/90">{t('tenant.reportBody')}</span>
        </span>
        <ChevronRight size={22} aria-hidden className="shrink-0" />
      </Link>

      {/* My requests */}
      <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{t('nav.myRequests')}</h2>
          {mine.length > 0 && (
            <Link to="/requests" className="text-sm font-medium text-brand hover:text-brand-600">
              {t('actions.viewAll')}
            </Link>
          )}
        </div>
        {requests.isLoading ? (
          <p className="mt-3 text-sm text-ink-muted">{t('loading')}</p>
        ) : mine.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-line p-6 text-center">
            <ClipboardList className="mx-auto text-ink-muted" aria-hidden />
            <p className="mt-2 text-sm text-ink-muted">{t('tenant.noRequests')}</p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {mine.map((r) => (
              <li key={r.id}>
                <Link to={`/requests/${r.id}`} className="flex min-h-[56px] items-center gap-3 py-3 hover:bg-surface sm:-mx-2 sm:rounded-xl sm:px-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{r.title ?? '—'}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{formatDate(r.created_at, lng)}</p>
                  </div>
                  <Pill className={REQUEST_STATUS_CLASS[r.status]}>{t(`requestStatus.${r.status}`)}</Pill>
                  <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Announcements */}
      {news.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Megaphone size={20} className="text-brand" aria-hidden /> {t('tenant.announcements')}
          </h2>
          <ul className="mt-3 space-y-3">
            {news.map((a) => (
              <li key={a.id} className="rounded-xl bg-surface p-4">
                <p className="text-sm font-semibold text-ink">{a.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{a.message}</p>
                <p className="mt-2 text-xs text-ink-muted">{formatDate(a.created_at, lng)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
