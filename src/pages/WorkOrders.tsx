import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';
import { useWorkOrdersPage, useOrgMembers, useAssets, useLocations } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITIES, PRIORITY_CLASS, WO_STATUS_CLASS, WO_STATUSES } from '../lib/ui';
import type { Priority, WorkOrderStatus } from '../lib/database.types';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import Pagination from '../components/ui/Pagination';
import SearchInput, { useUrlSearch } from '../components/ui/SearchInput';

const PAGE_SIZE = 25;

export default function WorkOrders() {
  const { t, i18n } = useTranslation('workorders');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const members = useOrgMembers();
  const assets = useAssets();
  const locations = useLocations();
  const [status, setStatus] = useState<WorkOrderStatus | 'all'>('all');
  const [locationId, setLocationId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<Priority | 'all'>('all');
  const [page, setPage] = useState(1);
  const { q, query, setQuery } = useUrlSearch(useCallback(() => setPage(1), []));

  const filters = { status, locationId: locationId || undefined, assignedTo: assignedTo || undefined, priority, search: q };
  const workOrders = useWorkOrdersPage(page, PAGE_SIZE, filters);

  const assignee = (userId: string | null) => {
    if (!userId) return tc('common.unassigned');
    return members.data?.find((m) => m.user_id === userId)?.email ?? '—';
  };
  const assetName = (id: string | null) => {
    const a = assets.data?.find((x) => x.id === id);
    return a ? resolveI18n(a.name_i18n, lng) : '—';
  };

  const rows = workOrders.data?.rows ?? [];
  const total = workOrders.data?.count ?? 0;

  const updateFilter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <SearchInput
          id="work-orders-search"
          label={t('filter.search')}
          placeholder={t('filter.searchPlaceholder')}
          clearLabel={t('filter.clearSearch')}
          value={query}
          onChange={setQuery}
        />
        <div>
          <label className="mb-1 block text-xs text-ink-muted">{t('detail.status')}</label>
          <Select value={status} onChange={(e) => updateFilter(setStatus)(e.target.value as WorkOrderStatus | 'all')} className="w-auto">
            <option value="all">{tc('common.all')}</option>
            {WO_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tc(`woStatus.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-ink-muted">{t('detail.location')}</label>
          <Select value={locationId} onChange={(e) => updateFilter(setLocationId)(e.target.value)}>
            <option value="">{tc('common.all')}</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>{resolveI18n(l.name_i18n, lng)}</option>
            ))}
          </Select>
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-ink-muted">{t('columns.assignee')}</label>
          <Select value={assignedTo} onChange={(e) => updateFilter(setAssignedTo)(e.target.value)}>
            <option value="">{tc('common.all')}</option>
            {(members.data ?? []).map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.email}</option>
            ))}
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs text-ink-muted">{t('columns.priority')}</label>
          <Select value={priority} onChange={(e) => updateFilter(setPriority)(e.target.value as Priority | 'all')}>
            <option value="all">{tc('common.all')}</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{tc(`priority.${p}`)}</option>
            ))}
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <Wrench className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{q ? t('filter.noMatches', { q }) : t('empty')}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line bg-surface text-left text-xs text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('columns.title')}</th>
                  <th className="px-4 py-2 font-medium">{t('columns.asset')}</th>
                  <th className="px-4 py-2 font-medium">{t('columns.assignee')}</th>
                  <th className="px-4 py-2 font-medium">{t('columns.priority')}</th>
                  <th className="px-4 py-2 font-medium">{t('columns.status')}</th>
                  <th className="px-4 py-2 font-medium">{t('columns.due')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} className="border-b border-line last:border-0 hover:bg-surface">
                    <td className="px-4 py-2">
                      <Link
                        to={`/work-orders/${w.id}`}
                        className="font-medium text-brand hover:text-brand-600"
                      >
                        {w.title ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-ink-muted">{assetName(w.asset_id)}</td>
                    <td className="px-4 py-2 text-ink-muted">{assignee(w.assigned_to)}</td>
                    <td className="px-4 py-2">
                      <Pill className={PRIORITY_CLASS[w.priority]}>{tc(`priority.${w.priority}`)}</Pill>
                    </td>
                    <td className="px-4 py-2">
                      <Pill className={WO_STATUS_CLASS[w.status]}>{tc(`woStatus.${w.status}`)}</Pill>
                    </td>
                    <td className="px-4 py-2 text-ink-muted">{formatDate(w.due_at, lng)}</td>
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
