import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';
import { useWorkOrders, useOrgMembers, useAssets } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITY_CLASS, WO_STATUS_CLASS, WO_STATUSES } from '../lib/ui';
import type { WorkOrderStatus } from '../lib/database.types';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';

export default function WorkOrders() {
  const { t, i18n } = useTranslation('workorders');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const workOrders = useWorkOrders();
  const members = useOrgMembers();
  const assets = useAssets();
  const [status, setStatus] = useState<WorkOrderStatus | 'all'>('all');

  const assignee = (userId: string | null) => {
    if (!userId) return tc('common.unassigned');
    return members.data?.find((m) => m.user_id === userId)?.email ?? '—';
  };
  const assetName = (id: string | null) => {
    const a = assets.data?.find((x) => x.id === id);
    return a ? resolveI18n(a.name_i18n, lng) : '—';
  };

  const rows = (workOrders.data ?? []).filter((w) => status === 'all' || w.status === status);

  return (
    <div className="max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <span className="text-sm text-ink-muted">{t('detail.status')}</span>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as WorkOrderStatus | 'all')}
          className="w-auto"
        >
          <option value="all">{tc('common.all')}</option>
          {WO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tc(`woStatus.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <Wrench className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
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
      )}
    </div>
  );
}
