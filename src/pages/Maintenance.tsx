import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import {
  useAssets,
  useChecklistTemplates,
  useMeters,
  useOrgMembers,
  usePmSchedules,
} from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITIES, PRIORITY_CLASS } from '../lib/ui';
import type { Priority, PmTriggerType } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import BilingualName from '../components/ui/BilingualName';

export default function Maintenance() {
  const { t, i18n } = useTranslation('maintenance');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();

  const schedulesQuery = usePmSchedules();
  const assetsQuery = useAssets();
  const templatesQuery = useChecklistTemplates();
  const members = useOrgMembers();

  const [open, setOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const schedules = schedulesQuery.data ?? [];
  const assets = assetsQuery.data ?? [];
  const assetName = (assetId: string | null) => {
    const a = assets.find((x) => x.id === assetId);
    return a ? resolveI18n(a.name_i18n, lng) : tc('common.none');
  };

  const runDue = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('fp_generate_due_pm', { p_org: orgId! });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      setNotice(count > 0 ? t('generated', { count }) : t('noneDue'));
      void queryClient.invalidateQueries({ queryKey: ['pm_schedules', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['work_orders', orgId] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('fp_pm_schedules')
        .update({ active: v.active })
        .eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pm_schedules', orgId] }),
  });

  const now = Date.now();

  // Calendar month view
  const view = useMemo(() => {
    const base = new Date();
    return new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  }, [monthOffset]);
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat(lng === 'vi' ? 'vi-VN' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(view);

  const dueByDay = useMemo(() => {
    const map: Record<number, number> = {};
    for (const s of schedules) {
      if (!s.active || s.trigger_type !== 'calendar' || !s.next_due_at) continue;
      const d = new Date(s.next_due_at);
      if (d.getFullYear() === year && d.getMonth() === month) {
        map[d.getDate()] = (map[d.getDate()] ?? 0) + 1;
      }
    }
    return map;
  }, [schedules, year, month]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => runDue.mutate()} loading={runDue.isPending}>
            <RefreshCw size={16} /> {t('runDue')}
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> {t('addSchedule')}
          </Button>
        </div>
      </div>

      {notice && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-600">{notice}</p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Calendar */}
        <section className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">{monthLabel}</p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMonthOffset((m) => m - 1)}
                className="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-muted hover:text-ink"
                aria-label="Previous month"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setMonthOffset((m) => m + 1)}
                className="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-muted hover:text-ink"
                aria-label="Next month"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const count = dueByDay[day];
              return (
                <div
                  key={day}
                  className={`aspect-square rounded-md border p-1 ${
                    count ? 'border-brand/40 bg-brand-50' : 'border-line'
                  }`}
                >
                  <div className="text-ink-muted">{day}</div>
                  {count && (
                    <div className="mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                      {count}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Schedule list */}
        <section className="rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">{t('upcoming')}</p>
          {schedules.length === 0 ? (
            <div className="mt-6 text-center">
              <CalendarClock className="mx-auto text-ink-muted" aria-hidden />
              <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {schedules.map((s) => {
                const overdue =
                  s.active &&
                  s.trigger_type === 'calendar' &&
                  !!s.next_due_at &&
                  new Date(s.next_due_at).getTime() <= now;
                return (
                  <li key={s.id} className="rounded-lg border border-line px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">
                        {resolveI18n(s.name_i18n, lng)}
                      </span>
                      <Pill className={PRIORITY_CLASS[s.priority]}>
                        {tc(`priority.${s.priority}`)}
                      </Pill>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-ink-muted">
                        {assetName(s.asset_id)} ·{' '}
                        {s.trigger_type === 'meter'
                          ? t('every_units', { count: s.meter_threshold ?? 0 })
                          : t('every_days', { count: s.interval_days })}
                      </span>
                      <span className={overdue ? 'font-medium text-status-crit' : 'text-ink-muted'}>
                        {s.trigger_type === 'meter'
                          ? t('meterTriggered')
                          : `${overdue ? `${t('overdue')} · ` : ''}${formatDate(s.next_due_at, lng)}`}
                      </span>
                    </div>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => toggleActive.mutate({ id: s.id, active: !s.active })}
                        className="text-xs font-medium text-brand hover:text-brand-600"
                      >
                        {s.active ? t('pause') : t('resume')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {open && (
        <ScheduleDialog
          busy={false}
          onCancel={() => setOpen(false)}
          orgId={orgId!}
          assetOptions={assets.map((a) => ({ id: a.id, name: resolveI18n(a.name_i18n, lng) }))}
          templateOptions={(templatesQuery.data ?? []).map((tpl) => ({
            id: tpl.id,
            name: resolveI18n(tpl.name_i18n, lng),
          }))}
          memberOptions={(members.data ?? []).map((m) => ({ id: m.user_id, name: m.email }))}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['pm_schedules', orgId] });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ScheduleDialog({
  orgId,
  assetOptions,
  templateOptions,
  memberOptions,
  onCancel,
  onCreated,
}: {
  busy: boolean;
  orgId: string;
  assetOptions: { id: string; name: string }[];
  templateOptions: { id: string; name: string }[];
  memberOptions: { id: string; name: string }[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { t, i18n } = useTranslation('maintenance');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [en, setEn] = useState('');
  const [vi, setVi] = useState('');
  const [assetId, setAssetId] = useState('');
  const [triggerType, setTriggerType] = useState<PmTriggerType>('calendar');
  const [interval, setInterval] = useState('30');
  const [meterId, setMeterId] = useState('');
  const [threshold, setThreshold] = useState('100');
  const [templateId, setTemplateId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const today = new Date().toISOString().slice(0, 10);
  const [firstDue, setFirstDue] = useState(today);
  const [error, setError] = useState<string | null>(null);

  const metersQuery = useMeters(assetId || undefined);
  const meters = metersQuery.data ?? [];

  const create = useMutation({
    mutationFn: async () => {
      const isCalendar = triggerType === 'calendar';
      const { error: err } = await supabase.from('fp_pm_schedules').insert({
        org_id: orgId,
        asset_id: assetId || null,
        name_i18n: { en, vi: vi || en },
        interval_days: Math.max(1, parseInt(interval, 10) || 30),
        checklist_template_id: templateId || null,
        assigned_to: assignee || null,
        priority,
        trigger_type: triggerType,
        next_due_at: isCalendar ? new Date(firstDue + 'T09:00:00').toISOString() : null,
        meter_id: isCalendar ? null : meterId || null,
        meter_threshold: isCalendar ? null : Math.max(1, parseFloat(threshold) || 1),
      });
      if (err) throw err;
    },
    onSuccess: onCreated,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!en) return;
    if (triggerType === 'meter' && !meterId) {
      setError(t('dialog.meterRequired'));
      return;
    }
    create.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{t('dialog.title')}</h2>
        <div className="mt-4 space-y-4">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('dialog.asset')}</label>
            <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">{tc('common.none')}</option>
              {assetOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              {t('dialog.triggerType')}
            </label>
            <Select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as PmTriggerType)}
            >
              <option value="calendar">{t('dialog.triggerCalendar')}</option>
              <option value="meter">{t('dialog.triggerMeter')}</option>
            </Select>
          </div>

          {triggerType === 'calendar' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {t('dialog.interval')}
                </label>
                <Input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {t('dialog.firstDue')}
                </label>
                <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {t('dialog.meter')}
                </label>
                <Select value={meterId} onChange={(e) => setMeterId(e.target.value)}>
                  <option value="">{tc('common.none')}</option>
                  {meters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {resolveI18n(m.name_i18n, lng)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {t('dialog.meterThreshold')}
                </label>
                <Input
                  type="number"
                  min={1}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              {t('dialog.checklist')}
            </label>
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">{tc('common.none')}</option>
              {templateOptions.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              {t('dialog.assignee')}
            </label>
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">{tc('common.unassigned')}</option>
              {memberOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              {t('dialog.priority')}
            </label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {tc(`priority.${p}`)}
                </option>
              ))}
            </Select>
          </div>
          {error && <p className="text-sm text-status-crit">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" loading={create.isPending}>
            {tc('actions.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
