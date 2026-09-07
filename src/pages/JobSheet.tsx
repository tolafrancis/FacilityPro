import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAsset, useFaultTypes, useLocations, useOrgMembers, useParts, useWorkOrder, useWoLabor, useWoParts } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate } from '../lib/ui';

export default function JobSheet() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('jobsheet');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();

  const woQuery = useWorkOrder(id);
  const wo = woQuery.data;
  const asset = useAsset(wo?.asset_id ?? undefined).data;
  const members = useOrgMembers();
  const parts = useParts();
  const woParts = useWoParts(id);
  const woLabor = useWoLabor(id);
  const locations = useLocations();
  const faultTypes = useFaultTypes();

  if (!wo) return <p className="p-6 text-sm text-ink-muted">{tc('loading')}</p>;

  const location = wo.location_id ? locations.data?.find((l) => l.id === wo.location_id) : null;
  const faultType = wo.fault_type_id ? faultTypes.data?.find((f) => f.id === wo.fault_type_id) : null;

  const assignee = wo.assigned_to
    ? members.data?.find((m) => m.user_id === wo.assigned_to)?.email ?? '—'
    : tc('common.unassigned');

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-ink">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft size={15} /> {tc('actions.back')}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Printer size={16} /> {t('print')}
        </button>
      </div>

      <div className="flex items-start justify-between border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm font-bold text-white">
              F
            </div>
            <span className="font-semibold">{tc('app.name')}</span>
          </div>
          <h1 className="mt-2 text-xl font-semibold">{t('title')}</h1>
        </div>
        <div className="text-right text-xs text-ink-muted">
          <p>#{wo.id.slice(0, 8)}</p>
          <p>{formatDate(wo.created_at, lng)}</p>
        </div>
      </div>

      <table className="mt-5 w-full text-sm">
        <tbody>
          <Row label={t('fields.title')} value={wo.title ?? '—'} />
          <Row label={t('fields.asset')} value={asset ? resolveI18n(asset.name_i18n, lng) : '—'} />
          <Row label={t('fields.status')} value={tc(`woStatus.${wo.status}`)} />
          <Row label={t('fields.priority')} value={tc(`priority.${wo.priority}`)} />
          <Row label={t('fields.assignee')} value={assignee} />
          <Row label={t('fields.due')} value={formatDate(wo.due_at, lng)} />
          {location && <Row label={t('fields.location')} value={resolveI18n(location.name_i18n, lng)} />}
          {faultType && <Row label={t('fields.faultType')} value={resolveI18n(faultType.name_i18n, lng)} />}
          <Row
            label={t('fields.cost')}
            value={new Intl.NumberFormat(lng === 'vi' ? 'vi-VN' : 'en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(wo.cost)}
          />
        </tbody>
      </table>

      {wo.instructions && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t('fields.instructions')}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{wo.instructions}</p>
        </div>
      )}

      {(wo.failure_code || wo.completion_code || wo.downtime_minutes != null) && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t('closingDetails')}
          </p>
          <table className="mt-1 w-full text-sm">
            <tbody>
              {wo.failure_code && (
                <Row label={t('fields.failureCode')} value={tc(`failureCode.${wo.failure_code}`)} />
              )}
              {wo.completion_code && (
                <Row label={t('fields.completionCode')} value={tc(`completionCode.${wo.completion_code}`)} />
              )}
              {wo.downtime_minutes != null && (
                <Row label={t('fields.downtime')} value={String(wo.downtime_minutes)} />
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t('parts')}
        </p>
        {(woParts.data ?? []).length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">{t('noParts')}</p>
        ) : (
          <table className="mt-1 w-full text-sm">
            <tbody>
              {(woParts.data ?? []).map((wp) => {
                const part = parts.data?.find((p) => p.id === wp.part_id);
                return (
                  <tr key={wp.id} className="border-b border-line">
                    <td className="py-1">{part ? resolveI18n(part.name_i18n, lng) : wp.part_id}</td>
                    <td className="py-1 text-right">×{wp.quantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t('labor')}
        </p>
        {(woLabor.data ?? []).length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">{t('noLabor')}</p>
        ) : (
          <table className="mt-1 w-full text-sm">
            <tbody>
              {(woLabor.data ?? []).map((entry) => {
                const who = members.data?.find((m) => m.user_id === entry.user_id)?.email ?? '—';
                return (
                  <tr key={entry.id} className="border-b border-line">
                    <td className="py-1">{who}</td>
                    <td className="py-1 text-right">{entry.minutes} {tc('common.minutesShort')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-10 grid grid-cols-2 gap-8 text-xs text-ink-muted">
        <SignLine label={t('sign.technician')} />
        <SignLine label={t('sign.supervisor')} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-line">
      <td className="w-40 py-2 text-ink-muted">{label}</td>
      <td className="py-2">{value}</td>
    </tr>
  );
}

function SignLine({ label }: { label: string }) {
  return (
    <div>
      <div className="h-10 border-b border-ink" />
      <p className="mt-1">{label}</p>
    </div>
  );
}
