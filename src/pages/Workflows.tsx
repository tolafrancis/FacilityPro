import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Pencil } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { supabase } from '../lib/supabase';
import { useUnsavedChangesWarning } from '../lib/useUnsavedChanges';
import { useOrg } from '../contexts/OrgContext';
import { useBudgets, useDevices, useFacilities, useFaultTypes, useLocations, useMetersAll, useOrgMembers, useRates, useSurveys } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { PRIORITIES, formatDate } from '../lib/ui';

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

const TRIGGER_HINTS: Record<WorkflowTrigger, string> = {
  service_request: 'Fires when a request is created or completed.',
  fault_report: 'Fires on fault reports.',
  'workorder.created': 'Fires when a work order is created — assign it or notify the team.',
  asset_field: 'Scheduled check against an asset date field.',
  chat_with_staff: 'Fires when a requestor opens a conversation.',
  low_sentiment: 'Fires when AI marks an inbound message as low sentiment.',
  expenditure_budget_exceeded: 'Fires when spend exceeds a budget.',
  parts_quantity: 'Fires when a part stock drops.',
  desk_booking: 'Fires when a desk is booked.',
  facilities_booking: 'Fires when a facility is booked.',
  sensor_integration: 'Fires on each sensor reading — use a cooldown for chatty sensors.',
  meter_reading: 'Fires on each meter reading.',
  sor_submitted: 'Fires when a quote / procurement is raised against the rate schedule.',
  expenditure_approval: 'Fires when an approval is requested.',
};

const TRIGGER_LABEL: Record<WorkflowTrigger, string> = {
  service_request: 'Service Request',
  fault_report: 'Fault Report',
  'workorder.created': 'Work Order Created',
  asset_field: 'Asset Field',
  chat_with_staff: 'Chat With Staff',
  low_sentiment: 'Low Sentiment',
  expenditure_budget_exceeded: 'Budget Exceeded',
  parts_quantity: 'Parts Quantity',
  desk_booking: 'Desk Booking',
  facilities_booking: 'Facilities Booking',
  sensor_integration: 'Sensor Integration',
  meter_reading: 'Meter Reading',
  sor_submitted: 'SOR Submitted',
  expenditure_approval: 'Expenditure Approval',
};

const ACTION_LABEL: Record<WorkflowActionType, string> = {
  send_email: 'Send Email',
  send_sms: 'Send SMS',
  send_push: 'Send Push',
  assign: 'Assign To',
  create_request: 'Create Request',
  alert_account: 'Alert Account',
  send_survey: 'Send Survey',
  create_expenditure: 'Create Expenditure',
  send_approval_email: 'Send Approval Email',
};

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

const genWorkflowName = (f: WorkflowFormState) =>
  `${TRIGGER_LABEL[f.trigger_type]} → ${f.actions.map((a) => ACTION_LABEL[a.type]).join(', ')}`;
const genWorkflowDescription = (f: WorkflowFormState) =>
  `Auto: when ${TRIGGER_LABEL[f.trigger_type].toLowerCase()}, ${f.actions.map((a) => ACTION_LABEL[a.type].toLowerCase()).join(' and ')}.`;

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

const EMPTY_FORM: WorkflowFormState = {
  trigger_type: 'service_request',
  logic: 'and',
  cooldownMinutes: '0',
  triggerConfig: { ...TRIGGER_CONFIG_DEFAULTS.service_request },
  conditions: [],
  actions: [{ type: 'send_email', target: 'manager@example.com', subject: 'Request {{status}} reminder', value: 'A {{type}} request is still pending.' }],
};

// The 15 FacilityBot Workflow KB articles, modelled as installable templates.
const TEMPLATE_DEFINITIONS = [
  {
    title: 'Auto-assign work orders',
    description: 'Assign new work orders to a responder (optionally filtered by priority). Pick the responder after installing.',
    trigger_type: 'workorder.created' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'assign', target: '', value: '' }],
  },
  {
    title: 'Email based on asset useful life',
    description: 'Email when an asset passes a set number of days since its purchase date.',
    trigger_type: 'asset_field' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [{ field: 'days_since_purchase', operator: 'exceeds', value: '1825' }] },
    actions: [{ type: 'send_email', target: 'manager@example.com', value: 'Asset useful life reached' }],
  },
  {
    title: 'Email when asset warranty expiry is near',
    description: 'Email when an asset is within a set number of days of its warranty expiry.',
    trigger_type: 'asset_field' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [{ field: 'days_before_expiry', operator: 'falls_below', value: '30' }] },
    actions: [{ type: 'send_email', target: 'manager@example.com', value: 'Warranty expiring soon' }],
  },
  {
    title: 'Email reminder if request has been pending',
    description: 'Email a reminder when a request has been pending for too long.',
    trigger_type: 'service_request' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [{ field: 'has_been_pending', operator: 'pending_for', value: '60' }] },
    actions: [{ type: 'send_email', target: 'manager@example.com', value: 'Request still pending' }],
  },
  {
    title: 'Email when requestor asks to "Chat with Staff"',
    description: 'Email staff when a requestor asks to chat with a person.',
    trigger_type: 'chat_with_staff' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'send_email', target: 'support@example.com', value: 'Requestor wants to chat with staff' }],
  },
  {
    title: 'Email when expenditure budget is exceeded',
    description: 'Email when spend exceeds the configured budget for a cost centre.',
    trigger_type: 'expenditure_budget_exceeded' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [{ field: 'budget_amount', operator: 'exceeds', value: '10000' }] },
    actions: [{ type: 'send_email', target: 'finance@example.com', value: 'Budget exceeded' }],
  },
  {
    title: 'Email if requestor sentiment is low',
    description: 'Email for service recovery when AI detects low requestor sentiment.',
    trigger_type: 'low_sentiment' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'send_email', target: 'manager@example.com', value: 'Low sentiment detected' }],
  },
  {
    title: 'Email when parts quantity falls below amount',
    description: 'Email when a part drops below its reorder threshold.',
    trigger_type: 'parts_quantity' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [{ field: 'quantity', operator: 'falls_below', value: '30' }] },
    actions: [{ type: 'send_email', target: 'stores@example.com', value: 'Part below reorder level' }],
  },
  {
    title: 'Alert when desk booking is made',
    description: 'Alert an account when a desk is booked in a zone.',
    trigger_type: 'desk_booking' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'alert_account', target: '', value: 'Desk booked' }],
  },
  {
    title: 'Create ticket when a sensor is triggered',
    description: 'Create a request when a sensor reading crosses its trigger condition.',
    trigger_type: 'sensor_integration' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [{ field: 'sensor_score', operator: 'gte', value: '3' }] },
    actions: [{ type: 'create_request', target: '', value: 'Sensor threshold crossed' }],
    cooldown_minutes: 15,
  },
  {
    title: 'Create ticket when meter reading exceeds threshold',
    description: 'Create a request when a meter reading exceeds a threshold.',
    trigger_type: 'meter_reading' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [{ field: 'meter_value', operator: 'exceeds', value: '100' }] },
    actions: [{ type: 'create_request', target: '', value: 'Meter reading above threshold' }],
  },
  {
    title: 'Email when meter reading exceeds threshold',
    description: 'Email when a meter reading exceeds a threshold.',
    trigger_type: 'meter_reading' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [{ field: 'meter_value', operator: 'exceeds', value: '100' }] },
    actions: [{ type: 'send_email', target: 'manager@example.com', value: 'Meter reading above threshold' }],
  },
  {
    title: 'Survey after request completion',
    description: 'Send a survey to the requestor when a request is completed.',
    trigger_type: 'service_request' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [{ field: 'is_complete', operator: 'is_true', value: 'true' }] },
    actions: [{ type: 'send_survey', target: '', value: '' }],
  },
  {
    title: 'Expenditure request from SOR response',
    description: 'Create an expenditure request when a Schedule of Rates response is submitted.',
    trigger_type: 'sor_submitted' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'create_expenditure', target: '', value: '' }],
  },
  {
    title: 'Expenditure approval email',
    description: 'Send an approval email when an expenditure needs sign-off.',
    trigger_type: 'expenditure_approval' as WorkflowTrigger,
    conditions: { logic: 'and', rules: [] },
    actions: [{ type: 'send_approval_email', target: 'approver@example.com', value: 'Expenditure needs approval' }],
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

const ACTION_TARGET_LABEL: Record<WorkflowActionType, string> = {
  send_email: 'Recipient',
  send_sms: 'Recipient',
  send_push: 'Recipient',
  assign: 'Responder',
  create_request: 'Request type',
  alert_account: 'Account',
  send_survey: 'Survey',
  create_expenditure: '',
  send_approval_email: 'Approver',
};

export default function Workflows() {
  const { currentOrg, role } = useOrg();
  const { i18n } = useTranslation();
  const { t: ts } = useTranslation('settings');
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
  const [form, setForm] = useState<WorkflowFormState>(EMPTY_FORM);
  // What the form held when it was last loaded or saved: anything else is
  // unsaved work worth a warning before it's thrown away.
  const [baseline, setBaseline] = useState<WorkflowFormState>(EMPTY_FORM);
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
        name: genWorkflowName(form),
        description: genWorkflowDescription(form),
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
      setForm(EMPTY_FORM);
      setBaseline(EMPTY_FORM);
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ['workflows', currentOrg.id] });
      setMessage(editingId ? 'Workflow updated.' : 'Workflow saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save workflow.');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (workflow: Workflow) => {
    if (dirty && !window.confirm('Discard your unsaved changes and open this workflow?')) return;
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
    if (dirty && !window.confirm('Discard your unsaved changes to this workflow?')) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
  };

  const deleteWorkflow = async (workflow: Workflow) => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete workflow "${workflow.name}"?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('fp_workflows').delete().eq('id', workflow.id);
      if (error) throw error;
      if (editingId === workflow.id) cancelEdit();
      if (selectedWorkflowId === workflow.id) setSelectedWorkflowId(null);
      await queryClient.invalidateQueries({ queryKey: ['workflows', currentOrg?.id] });
      setMessage('Workflow deleted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete workflow.');
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
        name: template.title,
        description: template.description,
        trigger_type: template.trigger_type,
        conditions: template.conditions,
        actions: template.actions,
        labels: [template.trigger_type],
        is_active: true,
        run_order: 100,
        version: 1,
        cooldown_minutes: (template as { cooldown_minutes?: number }).cooldown_minutes ?? 0,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['workflows', currentOrg.id] });
      setMessage(`Installed template: ${template.title}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to install template.');
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
      setMessage(error instanceof Error ? error.message : 'Unable to update workflow.');
    } finally {
      setBusy(false);
    }
  };

  const selectClass = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

  // Trigger settings: the primary fields for the selected trigger.
  const renderTriggerSettings = () => {
    const tc = form.triggerConfig;
    const t = form.trigger_type;
    if (t === 'service_request' || t === 'fault_report') {
      return (
        <div className="space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            <Select value={tc.when ?? 'created'} onChange={(e) => setTC('when', e.target.value)}>
              <option value="created">When created</option>
              <option value="completed">When completed</option>
              <option value="pending">When pending too long</option>
            </Select>
            {tc.when === 'pending' && (
              <Input type="number" min={1} value={tc.minutes ?? '60'} onChange={(e) => setTC('minutes', e.target.value)} placeholder="minutes" />
            )}
          </div>
          <Select value={tc.type ?? ''} onChange={(e) => setTC('type', e.target.value)}>
            <option value="">Any request / fault type</option>
            {faultList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
          </Select>
          {faultList.length === 0 && (
            <p className="text-xs text-ink-muted">No fault types yet — add them in Settings → Catalogs.</p>
          )}
        </div>
      );
    }
    if (t === 'workorder.created') {
      return (
        <div className="space-y-2">
          <Select value={tc.priority ?? ''} onChange={(e) => setTC('priority', e.target.value)}>
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select value={tc.type ?? ''} onChange={(e) => setTC('type', e.target.value)}>
            <option value="">Any request / fault type</option>
            {faultList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
          </Select>
          {faultList.length === 0 && (
            <p className="text-xs text-ink-muted">No fault types yet — add them in Settings → Catalogs.</p>
          )}
        </div>
      );
    }
    if (t === 'asset_field') {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Select value={tc.check ?? 'warranty'} onChange={(e) => setTC('check', e.target.value)}>
            <option value="warranty">Warranty expiry near (days before)</option>
            <option value="useful_life">Useful life (days since purchase)</option>
          </Select>
          <Input type="number" min={0} value={tc.days ?? ''} onChange={(e) => setTC('days', e.target.value)} placeholder="days" />
        </div>
      );
    }
    if (t === 'meter_reading') {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Select value={tc.meter ?? ''} onChange={(e) => setTC('meter', e.target.value)}>
            <option value="">Any meter</option>
            {meterList.map((m) => <option key={m.id} value={m.id}>{resolveI18n(m.name_i18n, lng)}</option>)}
          </Select>
          <Input type="number" value={tc.threshold ?? ''} onChange={(e) => setTC('threshold', e.target.value)} placeholder="exceeds value" />
        </div>
      );
    }
    if (t === 'sensor_integration') {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Select value={tc.device ?? ''} onChange={(e) => setTC('device', e.target.value)}>
            <option value="">Any device / sensor</option>
            {deviceList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input type="number" value={tc.score ?? ''} onChange={(e) => setTC('score', e.target.value)} placeholder="score ≥" />
        </div>
      );
    }
    if (t === 'parts_quantity') {
      return <Input type="number" value={tc.threshold ?? ''} onChange={(e) => setTC('threshold', e.target.value)} placeholder="falls below quantity" />;
    }
    if (t === 'expenditure_budget_exceeded') {
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Select value={tc.budget ?? ''} onChange={(e) => setTC('budget', e.target.value)}>
            <option value="">Any cost centre / budget</option>
            {budgetList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Input type="number" value={tc.amount ?? ''} onChange={(e) => setTC('amount', e.target.value)} placeholder="exceeds amount" />
        </div>
      );
    }
    if (t === 'desk_booking') {
      return (
        <Select value={tc.zone ?? ''} onChange={(e) => setTC('zone', e.target.value)}>
          <option value="">Any zone</option>
          {zoneList.map((z) => <option key={z.id} value={z.id}>{resolveI18n(z.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (t === 'facilities_booking') {
      return (
        <Select value={tc.facility ?? ''} onChange={(e) => setTC('facility', e.target.value)}>
          <option value="">Any facility</option>
          {facilityList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    return <p className="text-sm text-ink-muted">This trigger needs no extra settings.</p>;
  };

  // Condition value: entity picker / typed input chosen by the selected condition field.
  const renderConditionValue = (cond: ConditionRow, idx: number) => {
    const set = (value: string) => updateCondition(idx, { value });
    const field = cond.field;
    if (field === 'priority') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">Select priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      );
    }
    if (field === 'type') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">Select request / fault type</option>
          {faultList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (field === 'location_tag') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">Select location</option>
          {locationList.map((l) => <option key={l.id} value={l.id}>{resolveI18n(l.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (field === 'zone') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">Select zone</option>
          {zoneList.map((z) => <option key={z.id} value={z.id}>{resolveI18n(z.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (field === 'facility') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">Select facility</option>
          {facilityList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (field === 'schedule_of_rate') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">Select schedule of rate</option>
          {rateList.map((r) => <option key={r.id} value={r.id}>{r.service}</option>)}
        </Select>
      );
    }
    if (field === 'device') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">Select device / sensor</option>
          {deviceList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      );
    }
    if (field === 'meter') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">Select meter</option>
          {meterList.map((m) => <option key={m.id} value={m.id}>{resolveI18n(m.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    if (field === 'cost_centre') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="">Select cost centre / budget</option>
          {budgetList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      );
    }
    if (field === 'is_complete') {
      return (
        <Select value={cond.value} onChange={(e) => set(e.target.value)}>
          <option value="true">true</option>
          <option value="false">false</option>
        </Select>
      );
    }
    if (NUMERIC_FIELDS.includes(field)) {
      return <Input type="number" value={cond.value} onChange={(e) => set(e.target.value)} placeholder={field === 'has_been_pending' ? 'minutes' : 'threshold'} />;
    }
    return <Input value={cond.value} onChange={(e) => set(e.target.value)} placeholder="value" />;
  };

  const renderActionTarget = (action: ActionRow, idx: number) => {
    const set = (target: string) => updateAction(idx, { target });
    const type = action.type;
    if (type === 'create_expenditure') return null;
    if (type === 'assign' || type === 'alert_account' || type === 'send_push') {
      return (
        <Select value={action.target} onChange={(e) => set(e.target.value)}>
          <option value="">{type === 'assign' ? 'Select responder' : type === 'alert_account' ? 'Select account' : 'Select recipient'}</option>
          {memberList.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
        </Select>
      );
    }
    if (type === 'send_email' || type === 'send_approval_email') {
      return (
        <Select value={action.target} onChange={(e) => set(e.target.value)}>
          <option value="">Select recipient</option>
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
          <option value="">Select recipient</option>
          {legacyNumber && <option value={action.target}>{action.target}</option>}
          {memberList.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
        </Select>
      );
    }
    if (type === 'create_request') {
      return (
        <Select value={action.target} onChange={(e) => set(e.target.value)}>
          <option value="">Select request type</option>
          {faultList.map((f) => <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>)}
        </Select>
      );
    }
    return (
      <Select value={action.target} onChange={(e) => set(e.target.value)}>
        <option value="">Select survey</option>
        {surveyList.map((s) => <option key={s.id} value={s.id}>{resolveI18n(s.name_i18n, lng)}</option>)}
      </Select>
    );
  };

  const placeholderHint = 'Placeholders like {{priority}}, {{type}}, {{status}}, {{location_tag}} are filled from the event.';

  const renderActionValue = (action: ActionRow, idx: number) => {
    const setVal = (value: string) => updateAction(idx, { value });
    const type = action.type;
    if (type === 'assign') {
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Availability</label>
          <Select value={action.value} onChange={(e) => setVal(e.target.value)}>
            <option value="">Always</option>
            <option value="only if available">Only if responder is available</option>
          </Select>
        </div>
      );
    }
    if (type === 'send_email' || type === 'send_approval_email') {
      return (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Subject</label>
            <Input value={action.subject ?? ''} onChange={(e) => updateAction(idx, { subject: e.target.value })} placeholder="Email subject (supports {{placeholders}})" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Body</label>
            <Input value={action.value} onChange={(e) => setVal(e.target.value)} placeholder="Email body" />
            <p className="mt-1 text-xs text-ink-muted">{placeholderHint}</p>
          </div>
        </div>
      );
    }
    if (type === 'send_sms' || type === 'send_push' || type === 'alert_account') {
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Message</label>
          <Input value={action.value} onChange={(e) => setVal(e.target.value)} placeholder="Message to include" />
          <p className="mt-1 text-xs text-ink-muted">{placeholderHint}</p>
        </div>
      );
    }
    if (type === 'create_request') {
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Request description</label>
          <Input value={action.value} onChange={(e) => setVal(e.target.value)} placeholder="What should the ticket say?" />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Workflows</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Create reusable automations for requests, work orders, telemetry, and reminders, then keep an audit trail of each run.
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
              <h2 className="text-lg font-semibold text-ink">{editingId ? 'Edit workflow' : 'Create workflow'}</h2>
              {editingId && (
                <button type="button" onClick={cancelEdit} className="text-sm font-medium text-ink-muted hover:text-ink">Cancel</button>
              )}
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Trigger</label>
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
                  <option value="service_request">Service Request</option>
                  <option value="fault_report">Fault Report</option>
                  <option value="workorder.created">Work Order Created</option>
                  <option value="asset_field">Asset Field (warranty / useful life)</option>
                  <option value="chat_with_staff">Chat With Staff</option>
                  <option value="low_sentiment">Low Sentiment (AI)</option>
                  <option value="expenditure_budget_exceeded">Expenditure Budget Exceeded</option>
                  <option value="parts_quantity">Parts Quantity</option>
                  <option value="desk_booking">Desk Booking</option>
                  <option value="facilities_booking">Facilities Booking</option>
                  <option value="sensor_integration">Sensor Integration</option>
                  <option value="meter_reading">Meter Reading</option>
                  <option value="sor_submitted">Service from Schedule of Rate (SOR) Submitted</option>
                  <option value="expenditure_approval">Expenditure Approval Needed</option>
                </select>
                <p className="mt-1 text-xs text-ink-muted">{TRIGGER_HINTS[form.trigger_type]}</p>
              </div>

              {/* Trigger settings */}
              <div className="rounded-xl border border-line bg-surface p-3">
                <label className="mb-2 block text-sm font-medium text-ink">Trigger settings</label>
                {renderTriggerSettings()}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Cooldown (minutes)</label>
                <Input type="number" min={0} value={form.cooldownMinutes} onChange={(event) => setForm({ ...form, cooldownMinutes: event.target.value })} placeholder="0 = fire every time" />
                <p className="mt-1 text-xs text-ink-muted">Minimum gap between runs — useful to throttle chatty sensors/meters.</p>
              </div>

              {/* Additional filters */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-ink">Additional filters (optional)</label>
                  {form.conditions.length > 1 && (
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span>Match</span>
                      <select value={form.logic} onChange={(e) => setForm({ ...form, logic: e.target.value as 'and' | 'or' })} className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:border-brand focus:outline-none">
                        <option value="and">ALL</option>
                        <option value="or">ANY</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {form.conditions.map((cond, idx) => (
                    <div key={idx} className="rounded-xl border border-line bg-surface p-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <select value={cond.field} onChange={(e) => updateCondition(idx, { field: e.target.value })} className={selectClass}>
                          <option value="priority">Priority</option>
                          <option value="type">Request / Fault Type</option>
                          <option value="location_tag">Location Tag</option>
                          <option value="has_been_pending">Has Been Pending (minutes)</option>
                          <option value="is_complete">Is Complete</option>
                          <option value="days_since_purchase">Days Since Purchase Date</option>
                          <option value="days_before_expiry">Days Before Warranty Expiry</option>
                          <option value="quantity">Parts Quantity</option>
                          <option value="meter_value">Meter Reading Value</option>
                          <option value="meter">Meter</option>
                          <option value="sensor_score">Sensor Score</option>
                          <option value="device">Device / Sensor</option>
                          <option value="budget_amount">Budget Amount</option>
                          <option value="cost_centre">Cost Centre / Budget</option>
                          <option value="schedule_of_rate">Schedule of Rate</option>
                          <option value="zone">Zone</option>
                          <option value="facility">Facility</option>
                        </select>
                        <select value={cond.operator} onChange={(e) => updateCondition(idx, { operator: e.target.value as ConditionOperator })} className={selectClass}>
                          <option value="equals">equals</option>
                          <option value="not">not equals</option>
                          <option value="contains">contains</option>
                          <option value="in">in</option>
                          <option value="exceeds">exceeds (&gt;)</option>
                          <option value="gte">greater than or equal (≥)</option>
                          <option value="falls_below">falls below (&lt;)</option>
                          <option value="pending_for">has been pending for (minutes)</option>
                          <option value="is_true">is true</option>
                        </select>
                      </div>
                      <div className="mt-2 flex items-end gap-2">
                        <div className="flex-1">{renderConditionValue(cond, idx)}</div>
                        <button type="button" onClick={() => removeCondition(idx)} className="mb-1 text-ink-muted hover:text-status-crit" aria-label="Remove filter">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addCondition} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600">
                  <Plus size={15} /> Add filter
                </button>
              </div>

              {/* Actions */}
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Actions</label>
                <div className="space-y-3">
                  {form.actions.map((action, idx) => (
                    <div key={idx} className="rounded-xl border border-line bg-surface p-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <select value={action.type} onChange={(e) => updateAction(idx, { type: e.target.value as WorkflowActionType, target: '', value: '', subject: '' })} className={selectClass}>
                          <option value="send_email">Send Email</option>
                          <option value="send_sms">Send SMS</option>
                          <option value="send_push">Send Push</option>
                          <option value="assign">Assign To</option>
                          <option value="create_request">Create Request</option>
                          <option value="alert_account">Alert Account</option>
                          <option value="send_survey">Send Survey to Requestor</option>
                          <option value="create_expenditure">Create Expenditure Request</option>
                          <option value="send_approval_email">Send Approval Email</option>
                        </select>
                        {action.type !== 'create_expenditure' && (
                          <div>
                            <span className="sr-only">{ACTION_TARGET_LABEL[action.type]}</span>
                            {renderActionTarget(action, idx)}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex items-end gap-2">
                        <div className="flex-1">{renderActionValue(action, idx)}</div>
                        {form.actions.length > 1 && (
                          <button type="button" onClick={() => removeAction(idx)} className="mb-1 text-ink-muted hover:text-status-crit" aria-label="Remove action">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addAction} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600">
                  <Plus size={15} /> Add action
                </button>
              </div>

              <div className="rounded-lg bg-surface px-3 py-2 text-xs text-ink-muted">
                Will be saved as: <span className="font-medium text-ink">{genWorkflowName(form)}</span>
              </div>
              <Button type="submit" loading={busy}>{editingId ? 'Update workflow' : 'Save workflow'}</Button>
            </div>
          </form>

          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Template gallery</h2>
            <div className="mt-4 space-y-3">
              {TEMPLATE_DEFINITIONS.map((template) => (
                <div key={template.title} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{template.title}</p>
                      <p className="mt-1 text-sm text-ink-muted">{template.description}</p>
                    </div>
                    <Button variant="secondary" onClick={() => void installTemplate(template)} loading={busy}>Install</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Workflow library</h2>
            <div className="mt-4 space-y-3">
              {workflows.length === 0 && <p className="text-sm text-ink-muted">No workflows yet. Start with a template or create one from scratch.</p>}
              {workflows.map((workflow) => (
                <button key={workflow.id} type="button" onClick={() => setSelectedWorkflowId(workflow.id)} className={`w-full rounded-xl border p-4 text-left ${selectedWorkflowId === workflow.id ? 'border-brand bg-brand/5' : 'border-line bg-surface'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{workflow.name}</p>
                      <p className="mt-1 text-sm text-ink-muted">{workflow.trigger_type} · {workflow.description || 'No description'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${workflow.is_active ? 'bg-status-ok/10 text-status-ok' : 'bg-ink-muted/10 text-ink-muted'}`}>
                      {workflow.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
                    <span>Runs: {workflow.run_count}</span>
                    <span>Last: {workflow.last_run_at ? formatDate(workflow.last_run_at, lng) : 'Never'}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.2em] text-ink-muted">{workflow.actions.length} actions</span>
                    <span className="flex items-center gap-1">
                      <button type="button" onClick={(event) => { event.stopPropagation(); startEdit(workflow); }} className="rounded-lg p-2 text-ink-muted hover:bg-white hover:text-brand" aria-label="Edit workflow">
                        <Pencil size={15} />
                      </button>
                      <Button variant="secondary" onClick={(event) => { event.stopPropagation(); void toggleWorkflow(workflow); }} loading={busy}>{workflow.is_active ? 'Disable' : 'Enable'}</Button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); void deleteWorkflow(workflow); }} className="rounded-lg p-2 text-ink-muted hover:bg-white hover:text-status-crit" aria-label="Delete workflow">
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Run history</h2>
            {selectedWorkflow ? (
              <>
                <p className="mt-2 text-sm text-ink-muted">{selectedWorkflow.name}</p>
                <div className="mt-4 space-y-2">
                  {runs.length === 0 && <p className="text-sm text-ink-muted">No runs recorded yet.</p>}
                  {runs.map((run) => (
                    <div key={run.id} className="rounded-lg border border-line bg-surface px-3 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-ink">{run.status}</span>
                        <span className="text-ink-muted">{formatDate(run.started_at, lng)}</span>
                      </div>
                      <p className="mt-1 text-ink-muted">Trigger: {run.trigger_ref || 'n/a'}</p>
                      {run.error && <p className="mt-1 text-status-crit">{run.error}</p>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">Select a workflow to see recent runs.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
