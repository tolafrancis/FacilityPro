import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, ClipboardList, ChevronRight } from 'lucide-react';
import { useRequestsPage, useFaultTypes, useLocations } from '../lib/queries';
import { useOrg } from '../contexts/OrgContext';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITY_CLASS, REQUEST_STATUS_CLASS, REQUEST_STATUSES } from '../lib/ui';
import type { RequestStatus } from '../lib/database.types';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import Pagination from '../components/ui/Pagination';
import SearchInput, { useUrlSearch } from '../components/ui/SearchInput';

const PAGE_SIZE = 25;

export default function Requests() {
  const { t, i18n } = useTranslation('requests');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  // Tenants see only their own requests (RLS, 0081): same list, their wording,
  // and cards instead of the staff table.
  const isTenant = useOrg().role === 'occupant';
  const faultTypes = useFaultTypes();
  const locations = useLocations();
  const [status, setStatus] = useState<RequestStatus | 'all'>('all');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const { q, query, setQuery } = useUrlSearch(useCallback(() => setPage(1), []));

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
          <h1 className="text-2xl font-semibold text-ink">{isTenant ? tc('nav.myRequests') : t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{isTenant ? tc('tenant.myRequestsSubtitle') : t('subtitle')}</p>
        </div>
        <Button onClick={() => navigate('/requests/new')}>
          <Plus size={16} /> {isTenant ? tc('nav.reportFault') : t('new')}
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <SearchInput
          id="requests-search"
          label={t('filter.search')}
          placeholder={t('filter.searchPlaceholder')}
          clearLabel={t('filter.clearSearch')}
          value={query}
          onChange={setQuery}
        />
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
        {!isTenant && (
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
        )}
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <ClipboardList className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{q ? t('filter.noMatches', { q }) : isTenant ? tc('tenant.noRequests') : t('empty')}</p>
        </div>
      ) : isTenant ? (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/requests/${r.id}`} className="flex min-h-[56px] items-center gap-3 px-4 py-3 hover:bg-surface">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.title ?? '—'}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">
                    {faultName(r.fault_type_id)} · {formatDate(r.created_at, lng)}
                  </p>
                </div>
                <Pill className={REQUEST_STATUS_CLASS[r.status]}>{tc(`requestStatus.${r.status}`)}</Pill>
                <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
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
