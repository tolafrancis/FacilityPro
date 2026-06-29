import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useOrg } from '../contexts/OrgContext';
import type {
  Asset,
  AssetType,
  ApprovalRow,
  AssignmentRule,
  ChecklistItem,
  ChecklistRun,
  ChecklistTemplate,
  Contract,
  Conversation,
  Desk,
  DeskBooking,
  Device,
  DeviceRule,
  Facility,
  FacilityBooking,
  FaultType,
  FinanceBudget,
  FinanceExpenditure,
  FinanceRate,
  License,
  LocationRow,
  Media,
  Message,
  Meter,
  MeterReading,
  NotificationPref,
  NotificationRow,
  OrgMember,
  Part,
  Plan,
  PmSchedule,
  RequestRow,
  SlaPolicy,
  Subscription,
  Survey,
  Telemetry,
  Vendor,
  WoPart,
  WorkOrder,
} from './database.types';

function useOrgId() {
  return useOrg().currentOrg?.id;
}

export function useAssetTypes() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['asset_types', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_asset_types')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as AssetType[];
    },
  });
}

export function useFaultTypes() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['fault_types', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_fault_types')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as FaultType[];
    },
  });
}

export function useLocations() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['locations', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_locations')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as LocationRow[];
    },
  });
}

export function useAssets() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['assets', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assets')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Asset[];
    },
  });
}

export function useAsset(id: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['asset', id],
    enabled: !!orgId && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assets')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as Asset;
    },
  });
}

export function useRequests() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['requests', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_requests')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as RequestRow[];
    },
  });
}

export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['request', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_requests')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as RequestRow;
    },
  });
}

export function useWorkOrders() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['work_orders', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_work_orders')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WorkOrder[];
    },
  });
}

export function useWorkOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['work_order', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_work_orders')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as WorkOrder;
    },
  });
}

export function useMyWorkOrders(userId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['my_work_orders', orgId, userId],
    enabled: !!orgId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_work_orders')
        .select('*')
        .eq('org_id', orgId!)
        .eq('assigned_to', userId!)
        .order('due_at', { ascending: true });
      if (error) throw error;
      return data as WorkOrder[];
    },
  });
}

export function useMedia(params: { workOrderId?: string; requestId?: string }) {
  const { workOrderId, requestId } = params;
  return useQuery({
    queryKey: ['media', workOrderId ?? requestId],
    enabled: !!(workOrderId || requestId),
    queryFn: async () => {
      let q = supabase.from('fp_media').select('*');
      if (workOrderId) q = q.eq('work_order_id', workOrderId);
      if (requestId) q = q.eq('request_id', requestId);
      const { data, error } = await q.order('created_at');
      if (error) throw error;
      return data as Media[];
    },
  });
}

export function useOrgMembers() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['org_members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_org_members', { p_org: orgId! });
      if (error) throw error;
      return data as OrgMember[];
    },
  });
}

export function useFacilities() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['facilities', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_facilities')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as Facility[];
    },
  });
}

export function useFacilityBookings() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['facility_bookings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_facility_bookings')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as FacilityBooking[];
    },
  });
}

export function useDesks() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['desks', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_desks')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as Desk[];
    },
  });
}

export function useDeskBookings() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['desk_bookings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_desk_bookings')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as DeskBooking[];
    },
  });
}

export function useExpenditures() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['finance_expenditures', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_finance_expenditures')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as FinanceExpenditure[];
    },
  });
}

export function useRates() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['finance_rates', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_finance_rates')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as FinanceRate[];
    },
  });
}

export function useBudgets() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['finance_budgets', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_finance_budgets')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as FinanceBudget[];
    },
  });
}

export function useSurveys() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['surveys', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_surveys')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as Survey[];
    },
  });
}

export function useChecklistTemplates() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['checklist_templates', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_checklist_templates')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as ChecklistTemplate[];
    },
  });
}

export function useChecklistTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ['checklist_template', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_checklist_templates')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as ChecklistTemplate;
    },
  });
}

export function useChecklistItems(templateId: string | undefined) {
  return useQuery({
    queryKey: ['checklist_items', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_checklist_items')
        .select('*')
        .eq('template_id', templateId!)
        .order('ord');
      if (error) throw error;
      return data as ChecklistItem[];
    },
  });
}

export function useChecklistRun(workOrderId: string | undefined) {
  return useQuery({
    queryKey: ['checklist_run', workOrderId],
    enabled: !!workOrderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_checklist_runs')
        .select('*')
        .eq('work_order_id', workOrderId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ChecklistRun | null) ?? null;
    },
  });
}

export function usePmSchedules() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['pm_schedules', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_pm_schedules')
        .select('*')
        .eq('org_id', orgId!)
        .order('next_due_at', { nullsFirst: false });
      if (error) throw error;
      return data as PmSchedule[];
    },
  });
}

export function useParts() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['parts', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_parts')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as Part[];
    },
  });
}

export function useWoParts(workOrderId: string | undefined) {
  return useQuery({
    queryKey: ['wo_parts', workOrderId],
    enabled: !!workOrderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_wo_parts')
        .select('*')
        .eq('work_order_id', workOrderId!)
        .order('created_at');
      if (error) throw error;
      return data as WoPart[];
    },
  });
}

export function useMetersAll() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['meters_all', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_meters')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as Meter[];
    },
  });
}

export function useMeters(assetId: string | undefined) {
  return useQuery({
    queryKey: ['meters', assetId],
    enabled: !!assetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_meters')
        .select('*')
        .eq('asset_id', assetId!)
        .order('created_at');
      if (error) throw error;
      return data as Meter[];
    },
  });
}

export function useMeterReadings(meterId: string | undefined) {
  return useQuery({
    queryKey: ['meter_readings', meterId],
    enabled: !!meterId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_meter_readings')
        .select('*')
        .eq('meter_id', meterId!)
        .order('read_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as MeterReading[];
    },
  });
}

export function useVendors() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['vendors', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_vendors')
        .select('*')
        .eq('org_id', orgId!)
        .order('name');
      if (error) throw error;
      return data as Vendor[];
    },
  });
}

export function useContracts() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['contracts', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_contracts')
        .select('*')
        .eq('org_id', orgId!)
        .order('expiry_date', { nullsFirst: false });
      if (error) throw error;
      return data as Contract[];
    },
  });
}

export function useLicenses() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['licenses', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_licenses')
        .select('*')
        .eq('org_id', orgId!)
        .order('expiry_date', { nullsFirst: false });
      if (error) throw error;
      return data as License[];
    },
  });
}

export function useSlaPolicies() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['sla_policies', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_sla_policies')
        .select('*')
        .eq('org_id', orgId!);
      if (error) throw error;
      return data as SlaPolicy[];
    },
  });
}

export function useAssignmentRules() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['assignment_rules', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assignment_rules')
        .select('*')
        .eq('org_id', orgId!)
        .order('ord');
      if (error) throw error;
      return data as AssignmentRule[];
    },
  });
}

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as NotificationRow[];
    },
  });
}

export function useAuditLog() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['audit_log', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_audit_log')
        .select('id, actor, entity_type, action, at')
        .eq('org_id', orgId!)
        .order('at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as {
        id: number;
        actor: string | null;
        entity_type: string;
        action: string;
        at: string;
      }[];
    },
  });
}

export function useApprovals(status?: 'pending' | 'approved' | 'rejected') {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['approvals', orgId, status ?? 'all'],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase.from('fp_approvals').select('*').eq('org_id', orgId!);
      if (status) q = q.eq('status', status);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return data as ApprovalRow[];
    },
  });
}

export function useApprovalsForWo(workOrderId: string | undefined) {
  return useQuery({
    queryKey: ['approvals_wo', workOrderId],
    enabled: !!workOrderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_approvals')
        .select('*')
        .eq('work_order_id', workOrderId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ApprovalRow[];
    },
  });
}

export function useNotificationPref(userId: string | undefined) {
  return useQuery({
    queryKey: ['notification_pref', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_notification_prefs')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as NotificationPref | null) ?? null;
    },
  });
}

export function useConversations() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['conversations', orgId],
    enabled: !!orgId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_conversations')
        .select('*')
        .eq('org_id', orgId!)
        .order('last_message_at', { ascending: false });
      if (error) throw error;
      return data as Conversation[];
    },
  });
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at');
      if (error) throw error;
      return data as Message[];
    },
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_plans')
        .select('*')
        .eq('active', true)
        .order('sort');
      if (error) throw error;
      return data as Plan[];
    },
  });
}

export function useSubscription() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['subscription', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_subscriptions')
        .select('*')
        .eq('org_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return (data as Subscription | null) ?? null;
    },
  });
}

export function useDevices() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['devices', orgId],
    enabled: !!orgId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_devices')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Device[];
    },
  });
}

export function useDevice(deviceId: string | undefined) {
  return useQuery({
    queryKey: ['device', deviceId],
    enabled: !!deviceId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_devices')
        .select('*')
        .eq('id', deviceId!)
        .single();
      if (error) throw error;
      return data as Device;
    },
  });
}

export function useDeviceRules(deviceId: string | undefined) {
  return useQuery({
    queryKey: ['device_rules', deviceId],
    enabled: !!deviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_device_rules')
        .select('*')
        .eq('device_id', deviceId!)
        .order('created_at');
      if (error) throw error;
      return data as DeviceRule[];
    },
  });
}

export function useTelemetry(deviceId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ['telemetry', deviceId, limit],
    enabled: !!deviceId,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_telemetry')
        .select('*')
        .eq('device_id', deviceId!)
        .order('ts', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as Telemetry[];
    },
  });
}
