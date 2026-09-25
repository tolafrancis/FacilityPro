import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useFaultTypes, useLocations, useRequest, useWorkOrderForRequest } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITY_CLASS, REQUEST_STATUS_CLASS, REQUEST_STATUSES, WO_STATUS_CLASS } from '../lib/ui';
import type { RequestStatus } from '../lib/database.types';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import NotFound from '../components/NotFound';

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('requests');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentOrg, role } = useOrg();
  const isManager = role === 'org_admin' || role === 'manager';
  // Tenants follow their request here; status changes and work orders are
  // staff-only (RLS, 0081), so those controls are hidden for them.
  const isTenant = role === 'occupant';
  const orgId = currentOrg?.id;

  const requestQuery = useRequest(id);
  const faultTypes = useFaultTypes();
  const locations = useLocations();
  const linkedWoQuery = useWorkOrderForRequest(id);

  const request = requestQuery.data;

  const setStatus = useMutation({
    mutationFn: async (status: RequestStatus) => {
      const { error } = await supabase.from('fp_requests').update({ status }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['request', id] });
      void queryClient.invalidateQueries({ queryKey: ['requests', orgId] });
    },
  });

  // One atomic server call: returns the existing work order if the request
  // was already converted, so a double click or two managers can't create
  // duplicates, and the request status follows the work order from there.
  const convert = useMutation({
    meta: { errorHandled: true }, // shown inline below
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('fp_convert_request', { p_request: id! });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (woId) => {
      void queryClient.invalidateQueries({ queryKey: ['request', id] });
      void queryClient.invalidateQueries({ queryKey: ['requests', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['work_order_for_request', id] });
      void queryClient.invalidateQueries({ queryKey: ['work_orders', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['work_orders_page'] });
      if (woId) navigate(`/work-orders/${woId}`);
    },
  });

  if (requestQuery.isLoading) return <p className="text-sm text-ink-muted">{tc('loading')}</p>;
  if (!request) return <NotFound backTo="/requests" backLabel={t('title')} />;

  const faultName = request.fault_type_id
    ? resolveI18n(faultTypes.data?.find((x) => x.id === request.fault_type_id)?.name_i18n, lng)
    : '—';
  const loc = locations.data?.find((x) => x.id === request.location_id);
  const linkedWo = linkedWoQuery.data;

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/requests')}
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} /> {isTenant ? tc('nav.myRequests') : t('title')}
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{request.title}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
            {faultName}
            <Pill className={PRIORITY_CLASS[request.priority]}>
              {tc(`priority.${request.priority}`)}
            </Pill>
          </p>
        </div>
        {!isTenant && (
        <Select
          value={request.status}
          onChange={(e) => setStatus.mutate(e.target.value as RequestStatus)}
          className="w-auto"
        >
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tc(`requestStatus.${s}`)}
            </option>
          ))}
        </Select>
        )}
      </div>

      {isTenant && (
        <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-600">{tc('tenant.followUp')}</p>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Field label={t('detail.status')}>
          <Pill className={REQUEST_STATUS_CLASS[request.status]}>
            {tc(`requestStatus.${request.status}`)}
          </Pill>
        </Field>
        <Field label={t('form.location')}>{loc ? resolveI18n(loc.name_i18n, lng) : '—'}</Field>
        {!isTenant && <Field label={t('detail.channel')}>{request.channel}</Field>}
        {!isTenant && <Field label={t('detail.sourceLng')}>{request.source_lng.toUpperCase()}</Field>}
        <Field label={t('detail.reported')}>{formatDate(request.created_at, lng)}</Field>
      </dl>

      <div className="mt-5 rounded-xl border border-line bg-white p-4">
        <p className="text-xs text-ink-muted">{t('detail.description')}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
          {request.body_original || t('detail.noDescription')}
        </p>
      </div>

      {!isTenant && (
      <div className="mt-5">
        {linkedWo ? (
          <Link
            to={`/work-orders/${linkedWo.id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brand-600"
          >
            {t('detail.linkedWo')}: {linkedWo.title}
            <Pill className={WO_STATUS_CLASS[linkedWo.status]}>{tc(`woStatus.${linkedWo.status}`)}</Pill>
          </Link>
        ) : (
          isManager &&
          linkedWoQuery.isSuccess &&
          request.status !== 'rejected' && (
            <Button onClick={() => convert.mutate()} loading={convert.isPending}>
              {t('detail.convert')}
            </Button>
          )
        )}
        {convert.error && (
          <p role="alert" className="mt-2 text-sm text-status-crit">
            {(convert.error as Error).message}
          </p>
        )}
      </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
