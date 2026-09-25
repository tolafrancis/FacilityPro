import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, ClipboardList, Search, X } from 'lucide-react';
import { useRequestsPage, useFaultTypes, useLocations } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITY_CLASS, REQUEST_STATUS_CLASS, REQUEST_STATUSES } from '../lib/ui';
import type { RequestStatus } from '../lib/database.types';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import Pagination from '../components/ui/Pagination';

const PAGE_SIZE = 25;

export default function Requests() {
  const { t, i18n } = useTranslation('requests');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const faultTypes = useFaultTypes();
  const locations = useLocations();
  const [status, setStatus] = useState<RequestStatus | 'all'>('all');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  // The search lives in the URL (?q=) so the dashboard's search box and shared
  // links open the filtered list; typing updates it after a short pause.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [query, setQuery] = useState(q);
  useEffect(() => setQuery(q), [q]);
  useEffect(() => {
    if (query.trim() === q.trim()) return;
    const id = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (query.trim()) next.set('q', query.trim());
      else next.delete('q');
      setParams(next, { replace: true });
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [query, q, params, setParams]);

  const requests = useRequestsPage(page, PAGE_SIZE, { status, locationId: locationId || undefined, search: q });

  const faultName = (id: string | null) => {
    const ft = faultTypes.data?.find((x) => x.id === id);
    return ft ? resolveI18n(ft.name_i18n, lng) : '—';
  };
  const locName = (id: string | null) => {
    const l = locations.data?.find((x) => x.id === id);
    return l ? resolveI18n(l.name_i18n, lng) : '—';
  };

  const rows = requests.data?.rows ?? [];
  const total = requests.data?.count ?? 0;

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        <Button onClick={() => navigate('/requests/new')}>
          <Plus size={16} /> {t('new')}
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72">
          <label htmlFor="requests-search" className="mb-1 block text-xs text-ink-muted">{t('filter.search')}</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              id="requests-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('filter.searchPlaceholder')}
              maxLength={100}
              className="min-h-[44px] w-full rounded-lg border border-line bg-white py-2 pl-9 pr-9 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 lg:min-h-0 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-muted hover:bg-surface hover:text-ink"
                aria-label={t('filter.clearSearch')}
              >
                <X size={16} aria-hidden />
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">{t('filter.status')}</label>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as RequestStatus | 'all');
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="all">{t('filter.all')}</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tc(`requestStatus.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-ink-muted">{t('columns.location')}</label>
          <Select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('filter.allLocations')}</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>{resolveI18n(l.name_i18n, lng)}</option>
            ))}
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <ClipboardList className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{q ? t('filter.noMatches', { q }) : t('empty')}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line bg-surface text-left text-xs text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('columns.title')}</th>
                  <th className="px-4 py-2 font-medium">{t('columns.type')}</th>
                  <th className="px-4 py-2 font-medium">{t('columns.location')}</th>
                  <th className="px-4 py-2 font-medium">{t('columns.priority')}</th>
                  <th className="px-4 py-2 font-medium">{t('columns.status')}</th>
                  <th className="px-4 py-2 font-medium">{t('columns.created')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface">
                    <td className="px-4 py-2">
                      <Link
                        to={`/requests/${r.id}`}
                        className="font-medium text-brand hover:text-brand-600"
                      >
                        {r.title ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-ink-muted">{faultName(r.fault_type_id)}</td>
                    <td className="px-4 py-2 text-ink-muted">{locName(r.location_id)}</td>
                    <td className="px-4 py-2">
                      <Pill className={PRIORITY_CLASS[r.priority]}>{tc(`priority.${r.priority}`)}</Pill>
                    </td>
                    <td className="px-4 py-2">
                      <Pill className={REQUEST_STATUS_CLASS[r.status]}>
                        {tc(`requestStatus.${r.status}`)}
                      </Pill>
                    </td>
                    <td className="px-4 py-2 text-ink-muted">{formatDate(r.created_at, lng)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        summary={(p, tp, tt) => tc('pagination.summary', { page: p, totalPages: tp, total: tt })}
        prevLabel={tc('pagination.prev')}
        nextLabel={tc('pagination.next')}
      />
    </div>
  );
}
