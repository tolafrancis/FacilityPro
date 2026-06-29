import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, ClipboardList } from 'lucide-react';
import { useRequests, useFaultTypes, useLocations } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITY_CLASS, REQUEST_STATUS_CLASS, REQUEST_STATUSES } from '../lib/ui';
import type { RequestStatus } from '../lib/database.types';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';

export default function Requests() {
  const { t, i18n } = useTranslation('requests');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const requests = useRequests();
  const faultTypes = useFaultTypes();
  const locations = useLocations();
  const [status, setStatus] = useState<RequestStatus | 'all'>('all');

  const faultName = (id: string | null) => {
    const ft = faultTypes.data?.find((x) => x.id === id);
    return ft ? resolveI18n(ft.name_i18n, lng) : '—';
  };
  const locName = (id: string | null) => {
    const l = locations.data?.find((x) => x.id === id);
    return l ? resolveI18n(l.name_i18n, lng) : '—';
  };

  const rows = (requests.data ?? []).filter((r) => status === 'all' || r.status === status);

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

      <div className="mt-5 flex items-center gap-2">
        <span className="text-sm text-ink-muted">{t('filter.status')}</span>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as RequestStatus | 'all')}
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

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <ClipboardList className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
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
      )}
    </div>
  );
}
