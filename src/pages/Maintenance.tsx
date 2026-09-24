import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import {
  useAssets,
  useChecklistTemplates,
  useMeters,
  useOrgMembers,
  useParts,
  usePmRequiredParts,
  usePmSchedules,
} from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, PRIORITIES, PRIORITY_CLASS } from '../lib/ui';
import type { Priority, PmSchedule, PmTriggerType } from '../lib/database.types';
import { dateInZone, orgTimeZone, timeInZone, zonedTimeToIso } from '../lib/time';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import BilingualName from '../components/ui/BilingualName';

export default function Maintenance() {
  const { isManager } = useOrg();
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
  const [editing, setEditing] = useState<PmSchedule | null>(null);
  // Due dates are shown and entered in the organisation's time zone, not the
  // browser's (a manager travelling abroad must not shift every schedule).
  const tz = orgTimeZone(currentOrg);
  const [monthOffset, setMonthOffset] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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
      const [y, m, d] = dateInZone(s.next_due_at, tz).split('-').map(Number);
      if (y === year && m - 1 === month) {
        map[d] = (map[d] ?? 0) + 1;
      }
    }
    return map;
  }, [schedules, year, month, tz]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        {isManager && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => runDue.mutate()} loading={runDue.isPending}>
            <RefreshCw size={16} /> {t('runDue')}
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> {t('addSchedule')}
          </Button>
        </div>
        )}
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
                    <div className="mt-2 flex items-center gap-3">
                      {isManager && (<>
                      <button
                        type="button"
                        onClick={() => setEditing(s)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-600"
                      >
                        <Pencil size={12} /> {t('edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive.mutate({ id: s.id, active: !s.active })}
                        className="text-xs font-medium text-brand hover:text-brand-600"
                      >
                        {s.active ? t('pause') : t('resume')}
                      </button>
                      </>)}
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
                      >
                        <ChevronDown
                          size={13}
                          className={`transition-transform ${expanded === s.id ? '' : '-rotate-90'}`}
                        />
                        {t('requiredParts.toggle')}
                      </button>
                    </div>
                    {expanded === s.id && <RequiredPartsEditor orgId={orgId!} pmScheduleId={s.id} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {(open || editing) && (
        <ScheduleDialog
          key={editing?.id ?? 'new'}
          schedule={editing}
          timeZone={tz}
          onCancel={() => {
            setOpen(false);
            setEditing(null);
          }}
          orgId={orgId!}
          assetOptions={assets.map((a) => ({ id: a.id, name: resolveI18n(a.name_i18n, lng) }))}
          templateOptions={(templatesQuery.data ?? []).map((tpl) => ({
            id: tpl.id,
            name: resolveI18n(tpl.name_i18n, lng),
          }))}
          memberOptions={(members.data ?? []).map((m) => ({ id: m.user_id, name: m.email }))}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['pm_schedules', orgId] });
            setOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ScheduleDialog({
  orgId,
  schedule,
  timeZone,
  assetOptions,
  templateOptions,
  memberOptions,
  onCancel,
  onSaved,
}: {
  orgId: string;
  /** Existing schedule to edit; omit to create a new one. */
  schedule: PmSchedule | null;
  timeZone: string;
  assetOptions: { id: string; name: string }[];
  templateOptions: { id: string; name: string }[];
  memberOptions: { id: string; name: string }[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation('maintenance');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const s = schedule;
  const [en, setEn] = useState(s?.name_i18n.en ?? '');
  const [vi, setVi] = useState(s?.name_i18n.vi ?? '');
  const [assetId, setAssetId] = useState(s?.asset_id ?? '');
  const [triggerType, setTriggerType] = useState<PmTriggerType>(s?.trigger_type ?? 'calendar');
  const [interval, setInterval] = useState(String(s?.interval_days ?? 30));
  const [meterId, setMeterId] = useState(s?.meter_id ?? '');
  const [threshold, setThreshold] = useState(String(s?.meter_threshold ?? 100));
  const [templateId, setTemplateId] = useState(s?.checklist_template_id ?? '');
  const [assignee, setAssignee] = useState(s?.assigned_to ?? '');
  const [priority, setPriority] = useState<Priority>(s?.priority ?? 'medium');
  // "Today" and the due date are the organisation's calendar day; the time of
  // day is kept when editing and is 09:00 for new schedules.
  const today = dateInZone(Date.now(), timeZone);
  const [firstDue, setFirstDue] = useState(s?.next_due_at ? dateInZone(s.next_due_at, timeZone) : today);
  const dueTime = s?.next_due_at ? timeInZone(s.next_due_at, timeZone) : '09:00';
  const [leadTime, setLeadTime] = useState(String(s?.lead_time_days ?? 0));
  const [error, setError] = useState<string | null>(null);

  const metersQuery = useMeters(assetId || undefined);
  const meters = metersQuery.data ?? [];

  const save = useMutation({
    mutationFn: async () => {
      const isCalendar = triggerType === 'calendar';
      const values = {
        asset_id: assetId || null,
        name_i18n: { en, vi: vi || en },
        interval_days: Math.max(1, parseInt(interval, 10) || 30),
        checklist_template_id: templateId || null,
        assigned_to: assignee || null,
        priority,
        trigger_type: triggerType,
        next_due_at: isCalendar ? zonedTimeToIso(firstDue, dueTime, timeZone) : null,
        meter_id: isCalendar ? null : meterId || null,
        meter_threshold: isCalendar ? null : Math.max(1, parseFloat(threshold) || 1),
        lead_time_days: Math.max(0, parseInt(leadTime, 10) || 0),
      };
      const { error: err } = s
        ? await supabase.from('fp_pm_schedules').update(values).eq('id', s.id)
        : await supabase.from('fp_pm_schedules').insert({ org_id: orgId, ...values });
      if (err) throw err;
    },
    onSuccess: onSaved,
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
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{s ? t('dialog.editTitle') : t('dialog.title')}</h2>
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
                  {s ? t('dialog.nextDue') : t('dialog.firstDue')}
                </label>
                <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
                <p className="mt-1 text-xs text-ink-muted">
                  {t('dialog.timeZoneHint', { time: dueTime, tz: timeZone })}
                </p>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium text-ink">
                  {t('dialog.leadTime')}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                />
                <p className="mt-1 text-xs text-ink-muted">{t('dialog.leadTimeHint')}</p>
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
          <Button type="submit" loading={save.isPending}>
            {s ? tc('actions.save') : tc('actions.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Required parts kit: what a PM schedule's generated work order usually
// needs. Shown as suggestions on the work order, not auto-consumed — the
// technician still confirms actual usage against real stock.
// ---------------------------------------------------------------------------
function RequiredPartsEditor({ orgId, pmScheduleId }: { orgId: string; pmScheduleId: string }) {
  const { t, i18n } = useTranslation('maintenance');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const queryClient = useQueryClient();
  const requiredQuery = usePmRequiredParts(pmScheduleId);
  const partsQuery = useParts();
  const [partId, setPartId] = useState('');
  const [qty, setQty] = useState('1');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pm_required_parts', pmScheduleId] });

  const addPart = useMutation({
    mutationFn: async () => {
      if (!partId) return;
      const { error } = await supabase.from('fp_pm_required_parts').insert({
        org_id: orgId,
        pm_schedule_id: pmScheduleId,
        part_id: partId,
        quantity: Math.max(0.01, parseFloat(qty) || 1),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setPartId('');
      setQty('1');
    },
  });

  const removePart = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fp_pm_required_parts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const required = requiredQuery.data ?? [];
  const parts = partsQuery.data ?? [];
  const partName = (id: string) => {
    const p = parts.find((x) => x.id === id);
    return p ? resolveI18n(p.name_i18n, lng) : id;
  };

  return (
    <div className="mt-2 rounded-lg border border-line bg-surface p-3">
      <p className="text-xs font-medium text-ink-muted">{t('requiredParts.title')}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {required.map((r) => (
          <li key={r.id} className="flex items-center justify-between text-ink">
            <span>
              {partName(r.part_id)} × {r.quantity}
            </span>
            <button
              type="button"
              onClick={() => removePart.mutate(r.id)}
              className="text-ink-muted hover:text-status-crit"
              aria-label={tc('actions.cancel')}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
        {required.length === 0 && <li className="text-ink-muted">{t('requiredParts.empty')}</li>}
      </ul>
      <div className="mt-2 flex items-end gap-2">
        <div className="flex-1">
          <Select value={partId} onChange={(e) => setPartId(e.target.value)}>
            <option value="">{tc('common.none')}</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {resolveI18n(p.name_i18n, lng)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-16">
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-lg border border-line px-2 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={!partId || addPart.isPending}
          onClick={() => addPart.mutate()}
          className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-brand hover:bg-white disabled:opacity-50"
        >
          {tc('actions.add')}
        </button>
      </div>
    </div>
  );
}
