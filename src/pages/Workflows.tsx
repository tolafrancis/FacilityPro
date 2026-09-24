import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Plus, Trash2, Pencil } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { supabase } from '../lib/supabase';
import { useUnsavedChangesWarning } from '../lib/useUnsavedChanges';
import { useOrg } from '../contexts/OrgContext';
import { useBudgets, useDevices, useFacilities, useFaultTypes, useLocations, useMetersAll, useOrgMembers, useRates, useSurveys } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { PRIORITIES, formatDate, friendlyError } from '../lib/ui';

// Events mirror FacilityBot's Workflow "Event" catalog (see docs/facilitybot-workflows-kb.md).
type WorkflowTrigger =
  | 'service_request'
  | 'fault_report'
  | 'workorder.created'
  | 'asset_field'
  | 'chat_with_staff'
  | 'low_sentiment'
  | 'expenditure_budget_exceeded'
  | 'parts_quantity'
  | 'desk_booking'
  | 'facilities_booking'
  | 'sensor_integration'
  | 'meter_reading'
  | 'sor_submitted'
  | 'expenditure_approval';

type ConditionOperator =
  | 'equals'
  | 'not'
  | 'contains'
  | 'in'
  | 'exceeds'
  | 'gte'
  | 'falls_below'
  | 'pending_for'
  | 'is_true';

type WorkflowActionType =
  | 'send_email'
  | 'send_sms'
  | 'send_push'
  | 'assign'
  | 'create_request'
  | 'alert_account'
  | 'send_survey'
  | 'create_expenditure'
  | 'send_approval_email';

interface ConditionRow {
  field: string;
  operator: ConditionOperator;
  value: string;
}

interface ActionRow {
  type: WorkflowActionType;
  target: string;
  value: string;
  subject?: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: WorkflowTrigger;
  conditions: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  labels: string[];
  is_active: boolean;
  run_order: number;
  version: number;
  last_run_at: string | null;
  run_count: number;
  cooldown_minutes?: number;
  created_at: string;
}

interface WorkflowRun {
  id: string;
  workflow_id: string;
  trigger_ref: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  context: Record<string, unknown>;
}

interface WorkflowFormState {
  trigger_type: WorkflowTrigger;
  logic: 'and' | 'or';
  cooldownMinutes: string;
  triggerConfig: Record<string, string>;
  conditions: ConditionRow[];
  actions: ActionRow[];
}

const NUMERIC_FIELDS = ['has_been_pending', 'days_since_purchase', 'days_before_expiry', 'quantity', 'meter_value', 'sensor_score', 'budget_amount'];

// Trigger, action, field and operator labels live in the `workflows`
// namespace (trigger.*, triggerHint.*, action.*, field.*, operator.*); the
// stored codes never change with the UI language.
const TRIGGERS: WorkflowTrigger[] = [
  'service_request', 'fault_report', 'workorder.created', 'asset_field', 'chat_with_staff', 'low_sentiment',
  'expenditure_budget_exceeded', 'parts_quantity', 'desk_booking', 'facilities_booking', 'sensor_integration',
  'meter_reading', 'sor_submitted', 'expenditure_approval',
];
const ACTIONS: WorkflowActionType[] = [
  'send_email', 'send_sms', 'send_push', 'assign', 'create_request', 'alert_account', 'send_survey', 'create_expenditure', 'send_approval_email',
];
const CONDITION_FIELDS = [
  'priority', 'type', 'location_tag', 'has_been_pending', 'is_complete', 'days_since_purchase', 'days_before_expiry', 'quantity',
  'meter_value', 'meter', 'sensor_score', 'device', 'budget_amount', 'cost_centre', 'schedule_of_rate', 'zone', 'facility',
];
// i18next reads '.' as nesting, so 'workorder.created' is looked up as 'workorder_created'.
const codeKey = (code: string) => code.replace(/\./g, '_');
const OPERATORS: ConditionOperator[] = ['equals', 'not', 'contains', 'in', 'exceeds', 'gte', 'falls_below', 'pending_for', 'is_true'];
// Placeholder tokens are passed in as values so i18next leaves them in the
// text for the workflow engine to fill.
const PLACEHOLDERS = { priority: '{{priority}}', type: '{{type}}', status: '{{status}}', location_tag: '{{location_tag}}', placeholders: '{{placeholders}}' };

// Default values for the per-trigger "Trigger settings" sub-form.
const TRIGGER_CONFIG_DEFAULTS: Record<WorkflowTrigger, Record<string, string>> = {
  service_request: { when: 'pending', minutes: '60', type: '' },
  fault_report: { when: 'created', minutes: '60', type: '' },
  'workorder.created': { priority: '', type: '' },
  asset_field: { check: 'warranty', days: '30' },
  chat_with_staff: {},
  low_sentiment: {},
  expenditure_budget_exceeded: { budget: '', amount: '10000' },
  parts_quantity: { threshold: '30' },
  desk_booking: { zone: '' },
  facilities_booking: { facility: '' },
  sensor_integration: { device: '', score: '3' },
  meter_reading: { meter: '', threshold: '100' },
  sor_submitted: {},
  expenditure_approval: {},
};

// Turn the trigger sub-form into the workflow's primary condition rules.
function buildPrimaryRules(trigger: WorkflowTrigger, tc: Record<string, string>): ConditionRow[] {
  const rules: ConditionRow[] = [];
  const push = (field: string, operator: ConditionOperator, value: string) => {
    if (value !== '' && value != null) rules.push({ field, operator, value });
  };
  switch (trigger) {
    case 'service_request':
    case 'fault_report':
      push('type', 'equals', tc.type || '');
      if (tc.when === 'completed') push('is_complete', 'is_true', 'true');
      else if (tc.when === 'pending') push('has_been_pending', 'pending_for', tc.minutes || '60');
      break;
    case 'workorder.created':
      push('priority', 'equals', tc.priority || '');
      push('type', 'equals', tc.type || '');
      break;
    case 'asset_field':
      if (tc.check === 'useful_life') push('days_since_purchase', 'exceeds', tc.days || '0');
      else push('days_before_expiry', 'falls_below', tc.days || '30');
      break;
    case 'meter_reading':
      push('meter', 'equals', tc.meter || '');
      push('meter_value', 'exceeds', tc.threshold || '');
      break;
    case 'sensor_integration':
      push('device', 'equals', tc.device || '');
      push('sensor_score', 'gte', tc.score || '');
      break;
    case 'parts_quantity':
      push('quantity', 'falls_below', tc.threshold || '');
      break;
    case 'expenditure_budget_exceeded':
      push('cost_centre', 'equals', tc.budget || '');
      push('budget_amount', 'exceeds', tc.amount || '');
      break;
    case 'desk_booking':
      push('zone', 'equals', tc.zone || '');
      break;
    case 'facilities_booking':
      push('facility', 'equals', tc.facility || '');
      break;
    default:
      break;
  }
  return rules;
}

// Name and description are stored text, written in the language of whoever saves the workflow.
const genWorkflowName = (f: WorkflowFormState, t: TFunction) =>
  `${t(`trigger.${codeKey(f.trigger_type)}`)} → ${f.actions.map((a) => t(`action.${a.type}`)).join(', ')}`;
const genWorkflowDescription = (f: WorkflowFormState, t: TFunction) =>
  t('generated.description', {
    trigger: t(`trigger.${codeKey(f.trigger_type)}`).toLowerCase(),
    actions: f.actions.map((a) => t(`action.${a.type}`).toLowerCase()).join(t('generated.and')),
  });

// Reverse of buildPrimaryRules: split saved rules back into trigger settings + extra filters.
function reverseTrigger(trigger: WorkflowTrigger, rules: ConditionRow[]): { tc: Record<string, string>; rest: ConditionRow[] } {
  const tc: Record<string, string> = { ...TRIGGER_CONFIG_DEFAULTS[trigger] };
  const consumed = new Set<number>();
  const take = (field: string) => {
    const i = rules.findIndex((r, idx) => !consumed.has(idx) && r.field === field);
    if (i >= 0) { consumed.add(i); return rules[i]; }
    return undefined;
  };
  switch (trigger) {
    case 'service_request':
    case 'fault_report': {
      const ty = take('type'); if (ty) tc.type = ty.value;
      const comp = take('is_complete'); const pend = take('has_been_pending');
      if (comp) tc.when = 'completed';
      else if (pend) { tc.when = 'pending'; tc.minutes = pend.value; }
      else tc.when = 'created';
      break;
    }
    case 'workorder.created': {
      const p = take('priority'); if (p) tc.priority = p.value;
      const ty = take('type'); if (ty) tc.type = ty.value;
      break;
    }
    case 'asset_field': {
      const u = take('days_since_purchase'); const w = take('days_before_expiry');
      if (u) { tc.check = 'useful_life'; tc.days = u.value; }
      else if (w) { tc.check = 'warranty'; tc.days = w.value; }
      break;
    }
    case 'meter_reading': {
      const m = take('meter'); if (m) tc.meter = m.value;
      const v = take('meter_value'); if (v) tc.threshold = v.value;
      break;
    }
    case 'sensor_integration': {
      const d = take('device'); if (d) tc.device = d.value;
      const s = take('sensor_score'); if (s) tc.score = s.value;
      break;
    }
    case 'parts_quantity': {
      const q = take('quantity'); if (q) tc.threshold = q.value;
      break;
    }
    case 'expenditure_budget_exceeded': {
      const b = take('cost_centre'); if (b) tc.budget = b.value;
      const a = take('budget_amount'); if (a) tc.amount = a.value;
      break;
    }
    case 'desk_booking': { const z = take('zone'); if (z) tc.zone = z.value; break; }
    case 'facilities_booking': { const f = take('facility'); if (f) tc.facility = f.value; break; }
    default: break;
  }
  return { tc, rest: rules.filter((_, idx) => !consumed.has(idx)) };
}

const makeEmptyForm = (t: TFunction): WorkflowFormState => ({
  trigger_type: 'service_request',
  logic: 'and',
  cooldownMinutes: '0',
  triggerConfig: { ...TRIGGER_CONFIG_DEFAULTS.service_request },
  conditions: [],
  actions: [{ type: 'send_email', target: 'manager@example.com', subject: t('defaults.subject', PLACEHOLDERS), value: t('defaults.body', PLACEHOLDERS) }],
});

// The 15 FacilityBot Workflow KB articles, modelled as installable templates.
// Title, description and (where `message` is set) the action text come from
// templates.<key>.* and are stored in the installer's language.
interface TemplateDefinition {
  key: string;
  trigger_type: WorkflowTrigger;
  conditions: { logic: 'and' | 'or'; rules: ConditionRow[] };
  actions: Array<ActionRow & { message?: boolean }>;
  cooldown_minutes?: number;
}

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    key: 'autoAssign',
    trigger_type: 'workorder.created',
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'assign', target: '', value: '' }],
  },
  {
    key: 'usefulLife',
    trigger_type: 'asset_field',
    conditions: { logic: 'and', rules: [{ field: 'days_since_purchase', operator: 'exceeds', value: '1825' }] },
    actions: [{ type: 'send_email', target: 'manager@example.com', value: '', message: true }],
  },
  {
    key: 'warranty',
    trigger_type: 'asset_field',
    conditions: { logic: 'and', rules: [{ field: 'days_before_expiry', operator: 'falls_below', value: '30' }] },
    actions: [{ type: 'send_email', target: 'manager@example.com', value: '', message: true }],
  },
  {
    key: 'pendingReminder',
    trigger_type: 'service_request',
    conditions: { logic: 'and', rules: [{ field: 'has_been_pending', operator: 'pending_for', value: '60' }] },
    actions: [{ type: 'send_email', target: 'manager@example.com', value: '', message: true }],
  },
  {
    key: 'chatWithStaff',
    trigger_type: 'chat_with_staff',
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'send_email', target: 'support@example.com', value: '', message: true }],
  },
  {
    key: 'budgetExceeded',
    trigger_type: 'expenditure_budget_exceeded',
    conditions: { logic: 'and', rules: [{ field: 'budget_amount', operator: 'exceeds', value: '10000' }] },
    actions: [{ type: 'send_email', target: 'finance@example.com', value: '', message: true }],
  },
  {
    key: 'lowSentiment',
    trigger_type: 'low_sentiment',
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'send_email', target: 'manager@example.com', value: '', message: true }],
  },
  {
    key: 'partsLow',
    trigger_type: 'parts_quantity',
    conditions: { logic: 'and', rules: [{ field: 'quantity', operator: 'falls_below', value: '30' }] },
    actions: [{ type: 'send_email', target: 'stores@example.com', value: '', message: true }],
  },
  {
    key: 'deskBooking',
    trigger_type: 'desk_booking',
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'alert_account', target: '', value: '', message: true }],
  },
  {
    key: 'sensorTicket',
    trigger_type: 'sensor_integration',
    conditions: { logic: 'and', rules: [{ field: 'sensor_score', operator: 'gte', value: '3' }] },
    actions: [{ type: 'create_request', target: '', value: '', message: true }],
    cooldown_minutes: 15,
  },
  {
    key: 'meterTicket',
    trigger_type: 'meter_reading',
    conditions: { logic: 'and', rules: [{ field: 'meter_value', operator: 'exceeds', value: '100' }] },
    actions: [{ type: 'create_request', target: '', value: '', message: true }],
  },
  {
    key: 'meterEmail',
    trigger_type: 'meter_reading',
    conditions: { logic: 'and', rules: [{ field: 'meter_value', operator: 'exceeds', value: '100' }] },
    actions: [{ type: 'send_email', target: 'manager@example.com', value: '', message: true }],
  },
  {
    key: 'survey',
    trigger_type: 'service_request',
    conditions: { logic: 'and', rules: [{ field: 'is_complete', operator: 'is_true', value: 'true' }] },
    actions: [{ type: 'send_survey', target: '', value: '' }],
  },
  {
    key: 'sorExpenditure',
    trigger_type: 'sor_submitted',
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'create_expenditure', target: '', value: '' }],
  },
  {
    key: 'approvalEmail',
    trigger_type: 'expenditure_approval',
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'send_approval_email', target: 'approver@example.com', value: '', message: true }],
  },
];

async function fetchWorkflows(orgId: string | undefined) {
  if (!orgId) return [] as Workflow[];
  const { data, error } = await supabase.from('fp_workflows').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Workflow[];
}

async function fetchRuns(workflowId: string | undefined) {
  if (!workflowId) return [] as WorkflowRun[];
  const { data, error } = await supabase.from('fp_workflow_runs').select('*').eq('workflow_id', workflowId).order('started_at', { ascending: false }).limit(10);
  if (error) throw error;
  return (data ?? []) as WorkflowRun[];
}

export default function Workflows() {
  const { currentOrg, role } = useOrg();
  const { t, i18n } = useTranslation('workflows');
  const { t: ts } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const queryClient = useQueryClient();
  const members = useOrgMembers();
  const faultTypes = useFaultTypes();
  const locations = useLocations();
  const surveys = useSurveys();
  const rates = useRates();
  const budgets = useBudgets();
  const facilities = useFacilities();
  const devices = useDevices();
  const metersAll = useMetersAll();
  const emptyForm = useMemo(() => makeEmptyForm(t), [t]);
  const [form, setForm] = useState<WorkflowFormState>(emptyForm);
  // What the form held when it was last loaded or saved: anything else is
  // unsaved work worth a warning before it's thrown away.
  const [baseline, setBaseline] = useState<WorkflowFormState>(emptyForm);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useUnsavedChangesWarning(dirty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [publicRequests, setPublicRequests] = useState(!!currentOrg?.allow_public_requests);
  const [autoCreateWo, setAutoCreateWo] = useState(!!currentOrg?.auto_create_work_orders);

  const updateIntakeSettings = useMutation({
    mutationFn: async (patch: Record<string, boolean>) => {
      if (!currentOrg?.id) return;
      const { error } = await supabase.from('fp_organizations').update(patch).eq('id', currentOrg.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memberships'] }),
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows', currentOrg?.id],
    queryFn: () => fetchWorkflows(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['workflow-runs', selectedWorkflowId],
    queryFn: () => fetchRuns(selectedWorkflowId ?? undefined),
    enabled: !!selectedWorkflowId,
  });

  useEffect(() => {
    if (!selectedWorkflowId && workflows[0]?.id) {
      setSelectedWorkflowId(workflows[0].id);
    }
  }, [selectedWorkflowId, workflows]);

  const selectedWorkflow = useMemo(() => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null, [selectedWorkflowId, workflows]);

  const memberList = members.data ?? [];
  const faultList = faultTypes.data ?? [];
  const locationList = locations.data ?? [];
  const zoneList = locationList.filter((l) => l.kind === 'zone');
  const surveyList = surveys.data ?? [];
  const rateList = rates.data ?? [];
  const budgetList = budgets.data ?? [];
  const facilityList = facilities.data ?? [];
  const deviceList = devices.data ?? [];
  const meterList = metersAll.data ?? [];

  const setTC = (key: string, value: string) => setForm((prev) => ({ ...prev, triggerConfig: { ...prev.triggerConfig, [key]: value } }));

  const updateCondition = (idx: number, patch: Partial<ConditionRow>) =>
    setForm((prev) => ({ ...prev, conditions: prev.conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  const addCondition = () =>
    setForm((prev) => ({ ...prev, conditions: [...prev.conditions, { field: 'priority', operator: 'equals', value: '' }] }));
  const removeCondition = (idx: number) =>
    setForm((prev) => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== idx) }));

  const updateAction = (idx: number, patch: Partial<ActionRow>) =>
    setForm((prev) => ({ ...prev, actions: prev.actions.map((a, i) => (i === idx ? { ...a, ...patch } : a)) }));
  const addAction = () =>
    setForm((prev) => ({ ...prev, actions: [...prev.actions, { type: 'send_email', target: '', value: '', subject: '' }] }));
  const removeAction = (idx: number) =>
    setForm((prev) => ({ ...prev, actions: prev.actions.filter((_, i) => i !== idx) }));

  const saveWorkflow = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id) return;
    setBusy(true);
    setMessage(null);
    try {
      const rules = [
        ...buildPrimaryRules(form.trigger_type, form.triggerConfig),
        ...form.conditions.filter((c) => c.field),
      ];
      const payload = {
        name: genWorkflowName(form, t),
        description: genWorkflowDescription(form, t),
        trigger_type: form.trigger_type,
        conditions: { logic: form.logic, rules },
        actions: form.actions,
        labels: [form.trigger_type],
        cooldown_minutes: Number(form.cooldownMinutes) || 0,
      };
      const { error } = editingId
        ? await supabase.from('fp_workflows').update(payload).eq('id', editingId)
        : await supabase.from('fp_workflows').insert({ org_id: currentOrg.id, ...payload, is_active: true, run_order: 100, version: 1 });
      if (error) throw error;
      setForm(emptyForm);
      setBaseline(emptyForm);
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ['workflows', currentOrg.id] });
      setMessage(editingId ? t('messages.updated') : t('messages.saved'));
    } catch (error) {
      setMessage(friendlyError(error as { code?: string; message?: string }, tc));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (workflow: Workflow) => {
    if (dirty && !window.confirm(t('confirm.discardOpen'))) return;
    const cond = (workflow.conditions ?? {}) as { logic?: 'and' | 'or'; rules?: ConditionRow[] };
    const rules = (cond.rules ?? []) as ConditionRow[];
    const { tc, rest } = reverseTrigger(workflow.trigger_type, rules);
    const actions: ActionRow[] = (workflow.actions ?? []).map((a) => ({
      type: a.type as WorkflowActionType,
      target: (a.target as string) ?? '',
      value: (a.value as string) ?? '',
      subject: (a.subject as string) ?? '',
    }));
    const loaded: WorkflowFormState = {
      trigger_type: workflow.trigger_type,
      logic: cond.logic ?? 'and',
      cooldownMinutes: String(workflow.cooldown_minutes ?? 0),
      triggerConfig: tc,
      conditions: rest,
      actions: actions.length ? actions : [{ type: 'send_email', target: '', value: '', subject: '' }],
    };
    setForm(loaded);
    setBaseline(loaded);
    setEditingId(workflow.id);
    setMessage(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    if (dirty && !window.confirm(t('confirm.discard'))) return;
    setEditingId(null);
    setForm(emptyForm);
    setBaseline(emptyForm);
  };

  const deleteWorkflow = async (workflow: Workflow) => {
    if (typeof window !== 'undefined' && !window.confirm(t('confirm.delete', { name: workflow.name }))) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('fp_workflows').delete().eq('id', workflow.id);
      if (error) throw error;
      if (editingId === workflow.id) cancelEdit();
      if (selectedWorkflowId === workflow.id) setSelectedWorkflowId(null);
      await queryClient.invalidateQueries({ queryKey: ['workflows', currentOrg?.id] });
      setMessage(t('messages.deleted'));
    } catch (error) {
      setMessage(friendlyError(error as { code?: string; message?: string }, tc));
    } finally {
      setBusy(false);
    }
  };

  const installTemplate = async (template: (typeof TEMPLATE_DEFINITIONS)[number]) => {
    if (!currentOrg?.id) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('fp_workflows').insert({
        org_id: currentOrg.id,
        name: t(`templates.${template.key}.title`),
        description: t(`templates.${template.key}.description`),
        trigger_type: template.trigger_type,
        conditions: template.conditions,
        actions: template.actions.map(({ message, ...a }) => (message ? { ...a, value: t(`templates.${template.key}.message`) } : a)),
        labels: [template.trigger_type],
        is_active: true,
        run_order: 100,
        version: 1,
        cooldown_minutes: template.cooldown_minutes ?? 0,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['workflows', currentOrg.id] });
      setMessage(t('messages.installed', { title: t(`templates.${template.key}.title`) }));
    } catch (error) {
      setMessage(friendlyError(error as { code?: string; message?: string }, tc));
    } finally {
      setBusy(false);
    }
  };

  const toggleWorkflow = async (workflow: Workflow) => {
    if (!currentOrg?.id) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('fp_workflows').update({ is_active: !workflow.is_active }).eq('id', workflow.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['workflows', currentOrg.id] });
    } catch (error) {
      setMessage(friendlyError(error as { code?: string; message?: string }, tc));
    } finally {
      setBusy(false);
    }
  };

  const selectClass = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

  // Trigger settings: the primary fields for the selected trigger.
  const renderTriggerSettings = () => {
    const cfg = form.triggerConfig;
    const trig = form.trigger_type;
    if (trig === 'service_request' || trig === 'fault_report') {
      return (
        <div className="space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            <Select value={cfg.when ?? 'created'} onChange={(e) => setTC('when', e.target.value)}>
              <option value="created">{t('when.created')}</option>
              <option value="completed">{t('when.completed')}</option>
              <option value="pending">{t('when.pending')}</option>
            </Select>
            {cfg.when === 'pending' && (
              <Input type="number" min={1} value={cfg.minutes ?? '60'} onChange={(e) => setTC('minutes', e.target.value)} placeholder={t('placeholder.minutes')} />
            )}
          </div>
          <Select value={cfg.type ?? ''} onChange={(e) => setTC('type', e.target.value)}>
            <option value="">{t('any.type')}</option>
            {faultList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
          </Select>
          {faultList.length === 0 && (
            <p className="text-xs text-ink-muted">{t('noFaultTypes')}</p>
          )}
        </div>
      );
    }
    if (trig === 'workorder.created') {
      return (
        <div className="space-y-2">
          <Select value={cfg.priority ?? ''} onChange={(e) => setTC('priority', e.target.value)}>
            <option value="">{t('any.priority')}</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{tc(`priority.${p}`)}</option>)}
          </Select>
          <Select value={cfg.type ?? ''} onChange={(e) => setTC('type', e.target.value)}>
            <option value="">{t('any.type')}</option>
            {faultList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
          </Select>
          {faultList.length === 0 && (
            <p className="text-xs text-ink-muted">{t('noFaultTypes')}</p>
          )}
        </div>
      );
    }
    if (trig === 'asset_field') {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Select value={cfg.check ?? 'warranty'} onChange={(e) => setTC('check', e.target.value)}>
            <option value="warranty">{t('assetCheck.warranty')}</option>
            <option value="useful_life">{t('assetCheck.usefulLife')}</option>
          </Select>
          <Input type="number" min={0} value={cfg.days ?? ''} onChange={(e) => setTC('days', e.target.value)} placeholder={t('placeholder.days')} />
        </div>
      );
    }
    if (trig === 'meter_reading') {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Select value={cfg.meter ?? ''} onChange={(e) => setTC('meter', e.target.value)}>
            <option value="">{t('any.meter')}</option>
            {meterList.map((m) => <option key={m.id} value={m.id}>{resolveI18n(m.name_i18n, lng)}</option>)}
          </Select>
          <Input type="number" value={cfg.threshold ?? ''} onChange={(e) => setTC('threshold', e.target.value)} placeholder={t('placeholder.exceedsValue')} />
        </div>
      );
    }
    if (trig === 'sensor_integration') {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Select value={cfg.device ?? ''} onChange={(e) => setTC('device', e.target.value)}>
            <option value="">{t('any.device')}</option>
            {deviceList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input type="number" value={cfg.score ?? ''} onChange={(e) => setTC('score', e.target.value)} placeholder={t('placeholder.score')} />
        </div>
      );
    }
    if (trig === 'parts_quantity') {
      return <Input type="number" value={cfg.threshold ?? ''} onChange={(e) => setTC('threshold', e.target.value)} placeholder={t('placeholder.fallsBelowQuantity')} />;
    }
    if (trig === 'expenditure_budget_exceeded') {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Select value={cfg.budget ?? ''} onChange={(e) => setTC('budget', e.target.value)}>
            <option value="">{t('any.budget')}</option>
            {budgetList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Input type="number" value={cfg.amount ?? ''} onChange={(e) => setTC('amount', e.target.value)} placeholder={t('placeholder.exceedsAmount')} />
        </div>
      );
    }
    if (trig === 'desk_booking') {
      return (
        <Select value={cfg.zone ?? ''} onChange={(e) => setTC('zone', e.target.value)}>
          <option value="">{t('any.zone')}</option>
          {zoneList.map((z) => <option key={z.id} value={z.id}>{resolveI18n(z.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (trig === 'facilities_booking') {
      return (
        <Select value={cfg.facility ?? ''} onChange={(e) => setTC('facility', e.target.value)}>
          <option value="">{t('any.facility')}</option>
          {facilityList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    return <p className="text-sm text-ink-muted">{t('noSettings')}</p>;
  };

  // Condition value: entity picker / typed input chosen by the selected condition field.
  const renderConditionValue = (cond: ConditionRow, idx: number) => {
    const set = (value: string) => updateCondition(idx, { value });
    const field = cond.field;
    if (field === 'priority') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.priority')}</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      );
    }
    if (field === 'type') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.type')}</option>
          {faultList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (field === 'location_tag') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.location')}</option>
          {locationList.map((l) => <option key={l.id} value={l.id}>{resolveI18n(l.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (field === 'zone') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.zone')}</option>
          {zoneList.map((z) => <option key={z.id} value={z.id}>{resolveI18n(z.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (field === 'facility') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.facility')}</option>
          {facilityList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (field === 'schedule_of_rate') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.rate')}</option>
          {rateList.map((r) => <option key={r.id} value={r.id}>{r.service}</option>)}
        </Select>
      );
    }
    if (field === 'device') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.device')}</option>
          {deviceList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      );
    }
    if (field === 'meter') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.meter')}</option>
          {meterList.map((m) => <option key={m.id} value={m.id}>{resolveI18n(m.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (field === 'cost_centre') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.budget')}</option>
          {budgetList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      );
    }
    if (field === 'is_complete') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="true">{t('bool.true')}</option>
          <option value="false">{t('bool.false')}</option>
        </Select>
      );
    }
    if (NUMERIC_FIELDS.includes(field)) {
      return <Input type="number" value={cond.value} onChange={(e) => set(e.target.value)} placeholder={field === 'has_been_pending' ? t('placeholder.minutes') : t('placeholder.threshold')} />;
    }
    return <Input value={cond.value} onChange={(e) => set(e.target.value)} placeholder={t('placeholder.value')} />;
  };

  const renderActionTarget = (action: ActionRow, idx: number) => {
    const set = (target: string) => updateAction(idx, { target });
    const type = action.type;
    if (type === 'create_expenditure') return null;
    if (type === 'assign' || type === 'alert_account' || type === 'send_push') {
      return (
        <Select value={action.target} onChange={(e) => set(e.target.value)}>
          <option value="">{type === 'assign' ? t('select.responder') : type === 'alert_account' ? t('select.account') : t('select.recipient')}</option>
          {memberList.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
        </Select>
      );
    }
    if (type === 'send_email' || type === 'send_approval_email') {
      return (
        <Select value={action.target} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.recipient')}</option>
          {memberList.map((m) => <option key={m.user_id} value={m.email}>{m.email}</option>)}
        </Select>
      );
    }
    if (type === 'send_sms') {
      // Texts go only to members; the server resolves the member's phone from
      // their technician profile or notification settings. A legacy raw number
      // stays selectable, and still works if it belongs to a member.
      const legacyNumber = action.target && !memberList.some((m) => m.user_id === action.target);
      return (
        <Select value={action.target} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.recipient')}</option>
          {legacyNumber && <option value={action.target}>{action.target}</option>}
          {memberList.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
        </Select>
      );
    }
    if (type === 'create_request') {
      return (
        <Select value={action.target} onChange={(e) => set(e.target.value)}>
          <option value="">{t('select.requestType')}</option>
          {faultList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    return (
      <Select value={action.target} onChange={(e) => set(e.target.value)}>
        <option value="">{t('select.survey')}</option>
        {surveyList.map((s) => <option key={s.id} value={s.id}>{resolveI18n(s.name_i18n, lng)}</option>)}
      </Select>
    );
  };

  const placeholderHint = t('placeholderHint', PLACEHOLDERS);

  const renderActionValue = (action: ActionRow, idx: number) => {
    const setVal = (value: string) => updateAction(idx, { value });
    const type = action.type;
    if (type === 'assign') {
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('assign.availability')}</label>
          <Select value={action.value} onChange={(e) => setVal(e.target.value)}>
            <option value="">{t('assign.always')}</option>
            <option value="only if available">{t('assign.ifAvailable')}</option>
          </Select>
        </div>
      );
    }
    if (type === 'send_email' || type === 'send_approval_email') {
      return (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('email.subject')}</label>
            <Input value={action.subject ?? ''} onChange={(e) => updateAction(idx, { subject: e.target.value })} placeholder={t('email.subjectPlaceholder', PLACEHOLDERS)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('email.body')}</label>
            <Input value={action.value} onChange={(e) => setVal(e.target.value)} placeholder={t('email.bodyPlaceholder')} />
            <p className="mt-1 text-xs text-ink-muted">{placeholderHint}</p>
          </div>
        </div>
      );
    }
    if (type === 'send_sms' || type === 'send_push' || type === 'alert_account') {
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('messageField.label')}</label>
          <Input value={action.value} onChange={(e) => setVal(e.target.value)} placeholder={t('messageField.placeholder')} />
          <p className="mt-1 text-xs text-ink-muted">{placeholderHint}</p>
        </div>
      );
    }
    if (type === 'create_request') {
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('requestField.label')}</label>
          <Input value={action.value} onChange={(e) => setVal(e.target.value)} placeholder={t('requestField.placeholder')} />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          {t('subtitle')}
        </p>
      </div>

      {role === 'org_admin' && (
        <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">{ts('automation.title')}</h2>
          <p className="mt-1 text-sm text-ink-muted">{ts('automation.hint')}</p>

          <label className="mt-3 flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={publicRequests}
              onChange={(e) => {
                setPublicRequests(e.target.checked);
                updateIntakeSettings.mutate({ allow_public_requests: e.target.checked });
              }}
              className="mt-0.5 h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
            />
            <span>
              {ts('automation.publicRequests')}
              <span className="block text-xs text-ink-muted">{ts('automation.publicHint')}</span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={autoCreateWo}
              onChange={(e) => {
                setAutoCreateWo(e.target.checked);
                updateIntakeSettings.mutate({ auto_create_work_orders: e.target.checked });
              }}
              className="mt-0.5 h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
            />
            <span>
              {ts('automation.autoWo')}
              <span className="block text-xs text-ink-muted">{ts('automation.autoHint')}</span>
            </span>
          </label>

          {publicRequests && currentOrg?.id && (
            <div className="mt-3 rounded-lg bg-surface p-3">
              <p className="text-xs text-ink-muted">{ts('automation.reportLink')}</p>
              <code className="mt-1 block break-all text-xs text-ink">
                {typeof window !== 'undefined' ? `${window.location.origin}/report?org=${currentOrg.id}` : ''}
              </code>
            </div>
          )}
        </section>
      )}

      {message && <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand">{message}</div>}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <form onSubmit={saveWorkflow} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">{editingId ? t('form.editTitle') : t('form.createTitle')}</h2>
              {editingId && (
                <button type="button" onClick={cancelEdit} className="text-sm font-medium text-ink-muted hover:text-ink">{tc('actions.cancel')}</button>
              )}
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('form.trigger')}</label>
                <select
                  value={form.trigger_type}
                  onChange={(event) => {
                    const trigger_type = event.target.value as WorkflowTrigger;
                    setForm((prev) => ({
                      ...prev,
                      trigger_type,
                      triggerConfig: { ...TRIGGER_CONFIG_DEFAULTS[trigger_type] },
                      conditions: [],
                    }));
                  }}
                  className={selectClass}
                >
                  {TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{t(`triggerOption.${codeKey(trigger)}`)}</option>)}
                </select>
                <p className="mt-1 text-xs text-ink-muted">{t(`triggerHint.${codeKey(form.trigger_type)}`)}</p>
              </div>

              {/* Trigger settings */}
              <div className="rounded-xl border border-line bg-surface p-3">
                <label className="mb-2 block text-sm font-medium text-ink">{t('form.triggerSettings')}</label>
                {renderTriggerSettings()}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('form.cooldown')}</label>
                <Input type="number" min={0} value={form.cooldownMinutes} onChange={(event) => setForm({ ...form, cooldownMinutes: event.target.value })} placeholder={t('form.cooldownPlaceholder')} />
                <p className="mt-1 text-xs text-ink-muted">{t('form.cooldownHint')}</p>
              </div>

              {/* Additional filters */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-ink">{t('form.filters')}</label>
                  {form.conditions.length > 1 && (
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span>{t('form.match')}</span>
                      <select value={form.logic} onChange={(e) => setForm({ ...form, logic: e.target.value as 'and' | 'or' })} className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:border-brand focus:outline-none">
                        <option value="and">{t('form.matchAll')}</option>
                        <option value="or">{t('form.matchAny')}</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {form.conditions.map((cond, idx) => (
                    <div key={idx} className="rounded-xl border border-line bg-surface p-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <select value={cond.field} onChange={(e) => updateCondition(idx, { field: e.target.value })} className={selectClass}>
                          {CONDITION_FIELDS.map((f) => <option key={f} value={f}>{t(`field.${f}`)}</option>)}
                        </select>
                        <select value={cond.operator} onChange={(e) => updateCondition(idx, { operator: e.target.value as ConditionOperator })} className={selectClass}>
                          {OPERATORS.map((op) => <option key={op} value={op}>{t(`operator.${op}`)}</option>)}
                        </select>
                      </div>
                      <div className="mt-2 flex items-end gap-2">
                        <div className="flex-1">{renderConditionValue(cond, idx)}</div>
                        <button type="button" onClick={() => removeCondition(idx)} className="mb-1 text-ink-muted hover:text-status-crit" aria-label={t('form.removeFilter')}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addCondition} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600">
                  <Plus size={15} /> {t('form.addFilter')}
                </button>
              </div>

              {/* Actions */}
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t('form.actions')}</label>
                <div className="space-y-3">
                  {form.actions.map((action, idx) => (
                    <div key={idx} className="rounded-xl border border-line bg-surface p-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <select value={action.type} onChange={(e) => updateAction(idx, { type: e.target.value as WorkflowActionType, target: '', value: '', subject: '' })} className={selectClass}>
                          {ACTIONS.map((a) => <option key={a} value={a}>{t(`actionOption.${a}`)}</option>)}
                        </select>
                        {action.type !== 'create_expenditure' && (
                          <div>
                            <span className="sr-only">{t(`actionTarget.${action.type}`)}</span>
                            {renderActionTarget(action, idx)}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex items-end gap-2">
                        <div className="flex-1">{renderActionValue(action, idx)}</div>
                        {form.actions.length > 1 && (
                          <button type="button" onClick={() => removeAction(idx)} className="mb-1 text-ink-muted hover:text-status-crit" aria-label={t('form.removeAction')}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addAction} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600">
                  <Plus size={15} /> {t('form.addAction')}
                </button>
              </div>

              <div className="rounded-lg bg-surface px-3 py-2 text-xs text-ink-muted">
                {t('form.savedAs')} <span className="font-medium text-ink">{genWorkflowName(form, t)}</span>
              </div>
              <Button type="submit" loading={busy}>{editingId ? t('form.update') : t('form.save')}</Button>
            </div>
          </form>

          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">{t('gallery.title')}</h2>
            <div className="mt-4 space-y-3">
              {TEMPLATE_DEFINITIONS.map((template) => (
                <div key={template.key} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{t(`templates.${template.key}.title`)}</p>
                      <p className="mt-1 text-sm text-ink-muted">{t(`templates.${template.key}.description`)}</p>
                    </div>
                    <Button variant="secondary" onClick={() => void installTemplate(template)} loading={busy}>{t('gallery.install')}</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">{t('library.title')}</h2>
            <div className="mt-4 space-y-3">
              {workflows.length === 0 && <p className="text-sm text-ink-muted">{t('library.empty')}</p>}
              {workflows.map((workflow) => (
                <button key={workflow.id} type="button" onClick={() => setSelectedWorkflowId(workflow.id)} className={`w-full rounded-xl border p-4 text-left ${selectedWorkflowId === workflow.id ? 'border-brand bg-brand/5' : 'border-line bg-surface'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{workflow.name}</p>
                      <p className="mt-1 text-sm text-ink-muted">{t(`trigger.${codeKey(workflow.trigger_type)}`, { defaultValue: workflow.trigger_type })} · {workflow.description || t('library.noDescription')}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${workflow.is_active ? 'bg-status-ok/10 text-status-ok' : 'bg-ink-muted/10 text-ink-muted'}`}>
                      {workflow.is_active ? t('library.active') : t('library.disabled')}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
                    <span>{t('library.runs', { count: workflow.run_count })}</span>
                    <span>{t('library.lastRun', { date: workflow.last_run_at ? formatDate(workflow.last_run_at, lng) : t('library.never') })}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.2em] text-ink-muted">{t('library.actions', { count: workflow.actions.length })}</span>
                    <span className="flex items-center gap-1">
                      <button type="button" onClick={(event) => { event.stopPropagation(); startEdit(workflow); }} className="rounded-lg p-2 text-ink-muted hover:bg-white hover:text-brand" aria-label={t('library.edit')}>
                        <Pencil size={15} />
                      </button>
                      <Button variant="secondary" onClick={(event) => { event.stopPropagation(); void toggleWorkflow(workflow); }} loading={busy}>{workflow.is_active ? t('library.disable') : t('library.enable')}</Button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); void deleteWorkflow(workflow); }} className="rounded-lg p-2 text-ink-muted hover:bg-white hover:text-status-crit" aria-label={t('library.delete')}>
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">{t('runs.title')}</h2>
            {selectedWorkflow ? (
              <>
                <p className="mt-2 text-sm text-ink-muted">{selectedWorkflow.name}</p>
                <div className="mt-4 space-y-2">
                  {runs.length === 0 && <p className="text-sm text-ink-muted">{t('runs.empty')}</p>}
                  {runs.map((run) => (
                    <div key={run.id} className="rounded-lg border border-line bg-surface px-3 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-ink">{t(`runStatus.${run.status}`, { defaultValue: run.status })}</span>
                        <span className="text-ink-muted">{formatDate(run.started_at, lng)}</span>
                      </div>
                      <p className="mt-1 text-ink-muted">{t('runs.trigger', { ref: run.trigger_ref || t('runs.none') })}</p>
                      {run.error && <p className="mt-1 text-status-crit">{run.error}</p>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">{t('runs.select')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
