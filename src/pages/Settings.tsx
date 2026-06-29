import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import {
  useAssetTypes,
  useAssignmentRules,
  useFaultTypes,
  useOrgMembers,
  useSlaPolicies,
} from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { PRIORITIES, PRIORITY_CLASS } from '../lib/ui';
import type { Priority } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import BilingualName from '../components/ui/BilingualName';

type DialogKind = 'fault' | 'asset' | null;

export default function Settings() {
  const { t, i18n } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const faults = useFaultTypes();
  const assetTypes = useAssetTypes();
  const [dialog, setDialog] = useState<DialogKind>(null);

  const addFault = useMutation({
    mutationFn: async (v: { en: string; vi: string; priority: Priority }) => {
      const { error } = await supabase.from('fp_fault_types').insert({
        org_id: orgId,
        name_i18n: { en: v.en, vi: v.vi || v.en },
        default_priority: v.priority,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fault_types', orgId] });
      setDialog(null);
    },
  });

  const addAssetType = useMutation({
    mutationFn: async (v: { en: string; vi: string }) => {
      const { error } = await supabase.from('fp_asset_types').insert({
        org_id: orgId,
        name_i18n: { en: v.en, vi: v.vi || v.en },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['asset_types', orgId] });
      setDialog(null);
    },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">{t('faultTypes.title')}</h2>
            <button
              type="button"
              onClick={() => setDialog('fault')}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600"
            >
              <Plus size={15} /> {t('faultTypes.add')}
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {(faults.data ?? []).map((ft) => (
              <li
                key={ft.id}
                className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
              >
                <span className="text-ink">{resolveI18n(ft.name_i18n, lng)}</span>
                <Pill className={PRIORITY_CLASS[ft.default_priority]}>
                  {tc(`priority.${ft.default_priority}`)}
                </Pill>
              </li>
            ))}
            {faults.data?.length === 0 && (
              <li className="text-sm text-ink-muted">{t('faultTypes.empty')}</li>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">{t('assetTypes.title')}</h2>
            <button
              type="button"
              onClick={() => setDialog('asset')}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600"
            >
              <Plus size={15} /> {t('assetTypes.add')}
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {(assetTypes.data ?? []).map((at) => (
              <li
                key={at.id}
                className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
              >
                {resolveI18n(at.name_i18n, lng)}
              </li>
            ))}
            {assetTypes.data?.length === 0 && (
              <li className="text-sm text-ink-muted">{t('assetTypes.empty')}</li>
            )}
          </ul>
        </section>
      </div>

      <SlaSection />
      <AssignmentSection />
      <AutomationSection />

      {dialog === 'fault' && (
        <CatalogDialog
          title={t('dialog.addFaultType')}
          withPriority
          busy={addFault.isPending}
          onCancel={() => setDialog(null)}
          onSubmit={(v) => addFault.mutate({ en: v.en, vi: v.vi, priority: v.priority })}
        />
      )}
      {dialog === 'asset' && (
        <CatalogDialog
          title={t('dialog.addAssetType')}
          busy={addAssetType.isPending}
          onCancel={() => setDialog(null)}
          onSubmit={(v) => addAssetType.mutate({ en: v.en, vi: v.vi })}
        />
      )}
    </div>
  );
}

interface CatalogDialogProps {
  title: string;
  withPriority?: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { en: string; vi: string; priority: Priority }) => void;
}

function CatalogDialog({ title, withPriority, busy, onCancel, onSubmit }: CatalogDialogProps) {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const [en, setEn] = useState('');
  const [vi, setVi] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    onSubmit({ en, vi, priority });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-4 space-y-4">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          {withPriority && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                {t('faultTypes.priority')}
              </label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {tc(`priority.${p}`)}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {tc('actions.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}

function SlaSection() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const policies = useSlaPolicies();

  const hoursFor = (p: Priority): string => {
    const found = policies.data?.find((x) => x.priority === p);
    return found ? String(found.resolution_hours) : '';
  };

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-4">
      <h2 className="font-semibold text-ink">{t('sla.title')}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t('sla.hint')}</p>
      <div className="mt-3 space-y-2">
        {PRIORITIES.map((p) => (
          <SlaRow
            key={p}
            priority={p}
            initial={hoursFor(p)}
            label={tc(`priority.${p}`)}
            hoursLabel={t('sla.hours')}
            saveLabel={t('sla.save')}
            onSave={async (hours) => {
              await supabase
                .from('fp_sla_policies')
                .upsert(
                  { org_id: orgId, priority: p, resolution_hours: hours },
                  { onConflict: 'org_id,priority' }
                );
              void queryClient.invalidateQueries({ queryKey: ['sla_policies', orgId] });
            }}
          />
        ))}
      </div>
    </section>
  );
}

function SlaRow({
  priority,
  initial,
  label,
  hoursLabel,
  saveLabel,
  onSave,
}: {
  priority: Priority;
  initial: string;
  label: string;
  hoursLabel: string;
  saveLabel: string;
  onSave: (hours: number) => Promise<void>;
}) {
  const [hours, setHours] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <Pill className={`${PRIORITY_CLASS[priority]} w-20 justify-center`}>{label}</Pill>
      <Input
        type="number"
        min={1}
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        placeholder={hoursLabel}
        className="max-w-[140px]"
      />
      <button
        type="button"
        disabled={saving || !hours}
        onClick={async () => {
          const n = parseInt(hours, 10);
          if (!n) return;
          setSaving(true);
          await onSave(n);
          setSaving(false);
        }}
        className="text-sm font-medium text-brand hover:text-brand-600 disabled:opacity-50"
      >
        {saveLabel}
      </button>
    </div>
  );
}

function AssignmentSection() {
  const { t, i18n } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const rules = useAssignmentRules();
  const faults = useFaultTypes();
  const members = useOrgMembers();

  const [priority, setPriority] = useState<string>('');
  const [faultTypeId, setFaultTypeId] = useState<string>('');
  const [assignee, setAssignee] = useState<string>('');

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['assignment_rules', orgId] });

  const add = useMutation({
    mutationFn: async () => {
      if (!assignee) return;
      const nextOrd = rules.data?.length
        ? Math.max(...rules.data.map((r) => r.ord)) + 1
        : 0;
      const { error } = await supabase.from('fp_assignment_rules').insert({
        org_id: orgId,
        priority: priority || null,
        fault_type_id: faultTypeId || null,
        assigned_to: assignee,
        ord: nextOrd,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate();
      setPriority('');
      setFaultTypeId('');
      setAssignee('');
    },
  });

  const remove = useMutation({
    mutationFn: async (idToDelete: string) => {
      const { error } = await supabase.from('fp_assignment_rules').delete().eq('id', idToDelete);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const memberEmail = (uid: string) =>
    members.data?.find((m) => m.user_id === uid)?.email ?? uid;
  const faultName = (fid: string | null) =>
    fid ? resolveI18n(faults.data?.find((f) => f.id === fid)?.name_i18n, lng) : t('assign.any');

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-4">
      <h2 className="font-semibold text-ink">{t('assign.title')}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t('assign.hint')}</p>

      <ul className="mt-3 space-y-2">
        {(rules.data ?? []).map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
          >
            <span className="text-ink">
              {r.priority ? tc(`priority.${r.priority}`) : t('assign.any')} · {faultName(r.fault_type_id)}{' '}
              <span className="text-ink-muted">{t('assign.arrow')}</span> {memberEmail(r.assigned_to)}
            </span>
            <button
              type="button"
              onClick={() => remove.mutate(r.id)}
              className="text-ink-muted hover:text-status-crit"
              aria-label={tc('actions.cancel')}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {rules.data?.length === 0 && <li className="text-sm text-ink-muted">{t('assign.empty')}</li>}
      </ul>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">{t('assign.any')}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {tc(`priority.${p}`)}
            </option>
          ))}
        </Select>
        <Select value={faultTypeId} onChange={(e) => setFaultTypeId(e.target.value)}>
          <option value="">{t('assign.any')}</option>
          {(faults.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {resolveI18n(f.name_i18n, lng)}
            </option>
          ))}
        </Select>
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">{t('assign.assignee')}</option>
          {(members.data ?? []).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.email}
            </option>
          ))}
        </Select>
        <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!assignee}>
          <Plus size={16} /> {t('assign.add')}
        </Button>
      </div>
    </section>
  );
}

function AutomationSection() {
  const { t } = useTranslation('settings');
  const { currentOrg, role } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const [pub, setPub] = useState(!!currentOrg?.allow_public_requests);
  const [autoWo, setAutoWo] = useState(!!currentOrg?.auto_create_work_orders);

  const update = useMutation({
    mutationFn: async (patch: Record<string, boolean>) => {
      const { error } = await supabase.from('fp_organizations').update(patch).eq('id', orgId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memberships'] }),
  });

  if (role !== 'org_admin') return null;

  const reportLink =
    typeof window !== 'undefined' ? `${window.location.origin}/report?org=${orgId}` : '';

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-4">
      <h2 className="font-semibold text-ink">{t('automation.title')}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t('automation.hint')}</p>

      <label className="mt-3 flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={pub}
          onChange={(e) => {
            setPub(e.target.checked);
            update.mutate({ allow_public_requests: e.target.checked });
          }}
          className="mt-0.5 h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
        />
        <span>
          {t('automation.publicRequests')}
          <span className="block text-xs text-ink-muted">{t('automation.publicHint')}</span>
        </span>
      </label>

      <label className="mt-3 flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={autoWo}
          onChange={(e) => {
            setAutoWo(e.target.checked);
            update.mutate({ auto_create_work_orders: e.target.checked });
          }}
          className="mt-0.5 h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
        />
        <span>
          {t('automation.autoWo')}
          <span className="block text-xs text-ink-muted">{t('automation.autoHint')}</span>
        </span>
      </label>

      {pub && (
        <div className="mt-3 rounded-lg bg-surface p-3">
          <p className="text-xs text-ink-muted">{t('automation.reportLink')}</p>
          <code className="mt-1 block break-all text-xs text-ink">{reportLink}</code>
        </div>
      )}
    </section>
  );
}
