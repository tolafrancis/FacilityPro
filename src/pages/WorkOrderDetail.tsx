import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import {
  useMedia,
  useOrgMembers,
  useWorkOrder,
  useChecklistTemplates,
  useParts,
  useWoParts,
  useWoLabor,
  useRates,
  useApprovalsForWo,
  useLocations,
  useFaultTypes,
  useCostCenters,
  useVendors,
  useContracts,
  usePmRequiredParts,
  useTechnicianProfile,
  useTechnicianProfiles,
} from '../lib/queries';
import { uploadMedia, signedUrl } from '../lib/media';
import { writeOrQueue } from '../lib/sync';
import { formatDate, PRIORITY_CLASS, WO_STATUS_CLASS, WO_STATUSES } from '../lib/ui';
import { resolveI18n } from '../i18n/resolver';
import type {
  Media,
  WorkOrderStatus,
  FailureCode,
  CompletionCode,
} from '../lib/database.types';
import { FAILURE_CODES, COMPLETION_CODES } from '../lib/database.types';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import ChecklistRunner from '../components/ChecklistRunner';

export default function WorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('workorders');
  const { t: tc } = useTranslation('common');
  const { t: tcl } = useTranslation('checklists');
  const { t: tp } = useTranslation('parts');
  const { t: ta } = useTranslation('approvals');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentOrg, role } = useOrg();
  const orgId = currentOrg?.id;

  const woQuery = useWorkOrder(id);
  const members = useOrgMembers();
  const mediaQuery = useMedia({ workOrderId: id });
  const templates = useChecklistTemplates();
  const partsCatalog = useParts();
  const woPartsQuery = useWoParts(id);
  const woLaborQuery = useWoLabor(id);
  const ratesQuery = useRates();
  const myProfileQuery = useTechnicianProfile(user?.id);
  const technicianProfiles = useTechnicianProfiles();
  const approvalsQuery = useApprovalsForWo(id);
  const locations = useLocations();
  const faultTypes = useFaultTypes();
  const canSeeFinancials = role === 'org_admin' || role === 'manager';
  const costCentersQuery = useCostCenters();
  const vendorsQuery = useVendors();
  const contractsQuery = useContracts();
  const requiredPartsQuery = usePmRequiredParts(woQuery.data?.pm_schedule_id ?? undefined);

  const requestApproval = useMutation({
    mutationFn: async () => {
      if (!orgId || !id) return;
      const { error } = await supabase.from('fp_approvals').insert({
        org_id: orgId,
        work_order_id: id,
        requested_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals_wo', id] }),
  });

  const wo = woQuery.data;
  const [uploadingPhase, setUploadingPhase] = useState<'before' | 'after' | null>(null);
  const [partId, setPartId] = useState('');
  const [qty, setQty] = useState('1');
  const [minutes, setMinutes] = useState('');
  const [rate, setRate] = useState('0');
  const [rateInitialized, setRateInitialized] = useState(false);

  // Quietly pre-fill the rate field the first time it's available, without
  // ever overwriting a value the technician has already typed. Prefers the
  // logged-in technician's own profile rate over the generic rate card.
  useEffect(() => {
    if (rateInitialized) return;
    if (myProfileQuery.data?.labor_rate != null) {
      setRate(String(myProfileQuery.data.labor_rate));
      setRateInitialized(true);
    } else if (ratesQuery.data && ratesQuery.data.length > 0) {
      setRate(String(ratesQuery.data[0].rate));
      setRateInitialized(true);
    }
  }, [ratesQuery.data, myProfileQuery.data, rateInitialized]);

  const logPart = useMutation({
    mutationFn: async () => {
      if (!partId || !orgId || !id) return;
      const quantity = Math.max(1, parseFloat(qty) || 1);
      await writeOrQueue({
        op: 'insert',
        table: 'fp_wo_parts',
        values: { org_id: orgId, work_order_id: id, part_id: partId, quantity },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wo_parts', id] });
      void queryClient.invalidateQueries({ queryKey: ['parts', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['work_order', id] });
      setPartId('');
      setQty('1');
    },
  });

  const logLabor = useMutation({
    mutationFn: async () => {
      const mins = Math.max(1, parseInt(minutes, 10) || 0);
      if (!mins || !orgId || !id) return;
      await writeOrQueue({
        op: 'insert',
        table: 'fp_wo_labor',
        values: {
          org_id: orgId,
          work_order_id: id,
          user_id: user?.id ?? null,
          minutes: mins,
          rate_snapshot: Math.max(0, parseFloat(rate) || 0),
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wo_labor', id] });
      void queryClient.invalidateQueries({ queryKey: ['work_order', id] });
      setMinutes('');
    },
  });

  const patch = useMutation({
    mutationFn: async (
      changes: Partial<{
        status: WorkOrderStatus;
        assigned_to: string | null;
        checklist_template_id: string | null;
        failure_code: FailureCode | null;
        completion_code: CompletionCode | null;
        downtime_minutes: number | null;
        cost_center_id: string | null;
        vendor_id: string | null;
      }>
    ) => {
      const payload: Record<string, unknown> = { ...changes };
      if (changes.status === 'closed' || changes.status === 'resolved') {
        payload.closed_at = new Date().toISOString();
      }
      await writeOrQueue({
        op: 'update',
        table: 'fp_work_orders',
        values: payload,
        matchColumn: 'id',
        matchValue: id!,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['work_order', id] });
      void queryClient.invalidateQueries({ queryKey: ['work_orders', orgId] });
    },
  });

  const onUpload = async (phase: 'before' | 'after', file: File | null) => {
    if (!file || !orgId || !id) return;
    setUploadingPhase(phase);
    await uploadMedia({ orgId, file, workOrderId: id, phase });
    await queryClient.invalidateQueries({ queryKey: ['media', id] });
    setUploadingPhase(null);
  };

  if (!wo) return <p className="text-sm text-ink-muted">{tc('loading')}</p>;

  const media = mediaQuery.data ?? [];
  const before = media.filter((m) => m.phase === 'before');
  const after = media.filter((m) => m.phase === 'after');

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => navigate('/work-orders')}
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft size={15} /> {t('title')}
        </button>
        <Link
          to={`/work-orders/${id}/print`}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600"
        >
          <Printer size={15} /> {ta('printSheet')}
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{wo.title}</h1>
          <p className="mt-1">
            <Pill className={PRIORITY_CLASS[wo.priority]}>{tc(`priority.${wo.priority}`)}</Pill>
          </p>
        </div>
        <Select
          value={wo.status}
          onChange={(e) => patch.mutate({ status: e.target.value as WorkOrderStatus })}
          className="w-auto"
        >
          {WO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tc(`woStatus.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-line bg-white px-3 py-2">
          <dt className="text-xs text-ink-muted">{t('detail.status')}</dt>
          <dd className="mt-0.5">
            <Pill className={WO_STATUS_CLASS[wo.status]}>{tc(`woStatus.${wo.status}`)}</Pill>
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2">
          <dt className="text-xs text-ink-muted">{t('detail.assignee')}</dt>
          <dd className="mt-0.5">
            <Select
              value={wo.assigned_to ?? ''}
              onChange={(e) => patch.mutate({ assigned_to: e.target.value || null })}
              className="mt-0.5 w-full"
            >
              <option value="">{tc('common.unassigned')}</option>
              {(members.data ?? []).map((m) => {
                const skills = technicianProfiles.data?.find((p) => p.user_id === m.user_id)?.skills;
                return (
                  <option key={m.user_id} value={m.user_id}>
                    {m.email}
                    {skills && skills.length > 0 ? ` — ${skills.join(', ')}` : ''}
                  </option>
                );
              })}
            </Select>
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2">
          <dt className="text-xs text-ink-muted">{t('detail.vendor')}</dt>
          <dd className="mt-0.5">
            <Select
              value={wo.vendor_id ?? ''}
              onChange={(e) => patch.mutate({ vendor_id: e.target.value || null })}
              className="mt-0.5 w-full"
            >
              <option value="">{t('detail.noVendor')}</option>
              {(vendorsQuery.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2">
          <dt className="text-xs text-ink-muted">{t('detail.due')}</dt>
          <dd className="mt-0.5 text-ink">{formatDate(wo.due_at, lng)}</dd>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2">
          <dt className="text-xs text-ink-muted">{t('detail.priority')}</dt>
          <dd className="mt-0.5 text-ink">{tc(`priority.${wo.priority}`)}</dd>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2">
          <dt className="text-xs text-ink-muted">{t('detail.location')}</dt>
          <dd className="mt-0.5 text-ink">
            {wo.location_id
              ? resolveI18n(locations.data?.find((l) => l.id === wo.location_id)?.name_i18n, lng)
              : '—'}
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2">
          <dt className="text-xs text-ink-muted">{t('detail.faultType')}</dt>
          <dd className="mt-0.5 text-ink">
            {wo.fault_type_id
              ? resolveI18n(faultTypes.data?.find((f) => f.id === wo.fault_type_id)?.name_i18n, lng)
              : '—'}
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2">
          <dt className="text-xs text-ink-muted">{t('detail.cost')}</dt>
          <dd className="mt-0.5 text-ink tabular-nums">
            {new Intl.NumberFormat(lng === 'vi' ? 'vi-VN' : 'en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(wo.cost)}
          </dd>
        </div>
        {canSeeFinancials && (
          <div className="rounded-lg border border-line bg-white px-3 py-2">
            <dt className="text-xs text-ink-muted">{t('detail.costCenter')}</dt>
            <dd className="mt-0.5">
              <Select
                value={wo.cost_center_id ?? ''}
                onChange={(e) => patch.mutate({ cost_center_id: e.target.value || null })}
              >
                <option value="">{tc('common.none')}</option>
                {(costCentersQuery.data ?? []).map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code ? `${cc.code} — ${cc.name}` : cc.name}
                  </option>
                ))}
              </Select>
            </dd>
          </div>
        )}
      </dl>

      {wo.vendor_id && canSeeFinancials && (() => {
        const activeContracts = (contractsQuery.data ?? []).filter((c) => c.vendor_id === wo.vendor_id);
        if (activeContracts.length === 0) return null;
        return (
          <div className="mt-4 rounded-xl border border-line bg-white p-4">
            <p className="text-xs text-ink-muted">{t('detail.vendorContracts')}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {activeContracts.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-ink">
                  <span>{c.title}</span>
                  <span className="text-xs text-ink-muted">{formatDate(c.expiry_date, lng)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {wo.instructions && (
        <div className="mt-4 rounded-xl border border-line bg-white p-4">
          <p className="text-xs text-ink-muted">{t('detail.instructions')}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{wo.instructions}</p>
        </div>
      )}

      {(wo.status === 'resolved' || wo.status === 'closed') && (
        <div className="mt-4 rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">{t('detail.closingDetails')}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-ink-muted">{t('detail.failureCode')}</label>
              <Select
                value={wo.failure_code ?? ''}
                onChange={(e) =>
                  patch.mutate({ failure_code: (e.target.value || null) as FailureCode | null })
                }
              >
                <option value="">{t('detail.selectFailure')}</option>
                {FAILURE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {tc(`failureCode.${code}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-muted">{t('detail.completionCode')}</label>
              <Select
                value={wo.completion_code ?? ''}
                onChange={(e) =>
                  patch.mutate({ completion_code: (e.target.value || null) as CompletionCode | null })
                }
              >
                <option value="">{t('detail.selectCompletion')}</option>
                {COMPLETION_CODES.map((code) => (
                  <option key={code} value={code}>
                    {tc(`completionCode.${code}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-ink-muted">{t('detail.downtime')}</label>
              <input
                type="number"
                min={0}
                defaultValue={wo.downtime_minutes ?? ''}
                onBlur={(e) =>
                  patch.mutate({
                    downtime_minutes: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0),
                  })
                }
                className="w-32 rounded-lg border border-line px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {(() => {
        const approvals = approvalsQuery.data ?? [];
        const latest = approvals[0];
        const hasPending = approvals.some((a) => a.status === 'pending');
        const cls =
          latest?.status === 'approved'
            ? 'bg-status-ok/10 text-status-ok'
            : latest?.status === 'rejected'
              ? 'bg-status-crit/10 text-status-crit'
              : 'bg-status-warn/15 text-status-warn';
        return (
          <div className="mt-5 flex items-center justify-between rounded-xl border border-line bg-white p-4">
            <div>
              <p className="text-sm font-medium text-ink">{ta('woTitle')}</p>
              {latest ? (
                <p className="mt-1">
                  <Pill className={cls}>{ta(`status.${latest.status}`)}</Pill>
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink-muted">{ta('woNone')}</p>
              )}
            </div>
            {!hasPending && (
              <button
                type="button"
                onClick={() => requestApproval.mutate()}
                disabled={requestApproval.isPending}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-brand hover:bg-surface disabled:opacity-50"
              >
                {ta('request')}
              </button>
            )}
          </div>
        );
      })()}

      {wo.checklist_template_id && orgId && id ? (
        <ChecklistRunner orgId={orgId} workOrderId={id} templateId={wo.checklist_template_id} />
      ) : (
        <div className="mt-5 rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">{tcl('runner.title')}</p>
          <p className="mt-1 text-xs text-ink-muted">{tcl('runner.none')}</p>
          <Select
            className="mt-2"
            value=""
            onChange={(e) =>
              e.target.value && patch.mutate({ checklist_template_id: e.target.value })
            }
          >
            <option value="">{tcl('runner.attach')}</option>
            {(templates.data ?? []).map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {resolveI18n(tpl.name_i18n, lng)}
              </option>
            ))}
          </Select>
        </div>
      )}

      {wo.pm_schedule_id && (requiredPartsQuery.data ?? []).length > 0 && (
        <div className="mt-5 rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">{tp('suggested.title')}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{tp('suggested.hint')}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {(requiredPartsQuery.data ?? []).map((rp) => {
              const part = (partsCatalog.data ?? []).find((p) => p.id === rp.part_id);
              return (
                <li key={rp.id} className="flex items-center justify-between text-ink">
                  <span>
                    {part ? resolveI18n(part.name_i18n, lng) : rp.part_id} × {rp.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPartId(rp.part_id);
                      setQty(String(rp.quantity));
                    }}
                    className="text-xs font-medium text-brand hover:text-brand-600"
                  >
                    {tp('suggested.use')}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-medium text-ink">{tp('use.title')}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {(woPartsQuery.data ?? []).map((wp) => {
            const part = (partsCatalog.data ?? []).find((p) => p.id === wp.part_id);
            return (
              <li key={wp.id} className="flex justify-between text-ink">
                <span>{part ? resolveI18n(part.name_i18n, lng) : wp.part_id}</span>
                <span className="text-ink-muted">×{wp.quantity}</span>
              </li>
            );
          })}
          {(woPartsQuery.data ?? []).length === 0 && (
            <li className="text-ink-muted">{tp('use.empty')}</li>
          )}
        </ul>
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-ink-muted">{tp('use.part')}</label>
            <Select value={partId} onChange={(e) => setPartId(e.target.value)}>
              <option value="">{tc('common.none')}</option>
              {(partsCatalog.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {resolveI18n(p.name_i18n, lng)} ({p.stock_balance})
                </option>
              ))}
            </Select>
          </div>
          <div className="w-20">
            <label className="mb-1 block text-xs text-ink-muted">{tp('use.qty')}</label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={!partId || logPart.isPending}
            onClick={() => logPart.mutate()}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {tp('use.add')}
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-medium text-ink">{t('labor.title')}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {(woLaborQuery.data ?? []).map((entry) => {
            const who = members.data?.find((m) => m.user_id === entry.user_id)?.email ?? '—';
            const entryCost = (entry.minutes / 60) * entry.rate_snapshot;
            return (
              <li key={entry.id} className="flex justify-between text-ink">
                <span>
                  {who} · {entry.minutes} {tc('common.minutesShort')}
                </span>
                <span className="text-ink-muted tabular-nums">
                  {new Intl.NumberFormat(lng === 'vi' ? 'vi-VN' : 'en-US', {
                    style: 'currency',
                    currency: 'USD',
                  }).format(entryCost)}
                </span>
              </li>
            );
          })}
          {(woLaborQuery.data ?? []).length === 0 && (
            <li className="text-ink-muted">{t('labor.empty')}</li>
          )}
        </ul>
        <div className="mt-3 flex items-end gap-2">
          <div className="w-24">
            <label className="mb-1 block text-xs text-ink-muted">{t('labor.minutes')}</label>
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs text-ink-muted">{t('labor.rate')}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={!minutes || logLabor.isPending}
            onClick={() => logLabor.mutate()}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {t('labor.add')}
          </button>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-ink">{t('detail.media')}</p>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <MediaColumn
            label={t('detail.before')}
            items={before}
            addLabel={t('detail.addBefore')}
            uploading={uploadingPhase === 'before'}
            uploadingLabel={t('detail.uploading')}
            onPick={(f) => onUpload('before', f)}
          />
          <MediaColumn
            label={t('detail.after')}
            items={after}
            addLabel={t('detail.addAfter')}
            uploading={uploadingPhase === 'after'}
            uploadingLabel={t('detail.uploading')}
            onPick={(f) => onUpload('after', f)}
          />
        </div>
      </div>
    </div>
  );
}

function MediaColumn({
  label,
  items,
  addLabel,
  uploading,
  uploadingLabel,
  onPick,
}: {
  label: string;
  items: Media[];
  addLabel: string;
  uploading: boolean;
  uploadingLabel: string;
  onPick: (file: File | null) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <div className="mt-2 space-y-2">
        {items.map((m) => (
          <MediaThumb key={m.id} item={m} />
        ))}
      </div>
      <label className="mt-2 block cursor-pointer text-center text-xs font-medium text-brand hover:text-brand-600">
        {uploading ? uploadingLabel : `+ ${addLabel}`}
        <input
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}

function MediaThumb({ item }: { item: Media }) {
  const urlQuery = useQuery({
    queryKey: ['signed', item.path],
    queryFn: () => signedUrl(item.path),
  });
  const url = urlQuery.data;
  if (!url) return <div className="h-20 animate-pulse rounded-lg bg-surface" />;
  if (item.kind === 'video') {
    return <video src={url} controls className="w-full rounded-lg" />;
  }
  return <img src={url} alt="" className="w-full rounded-lg object-cover" />;
}
