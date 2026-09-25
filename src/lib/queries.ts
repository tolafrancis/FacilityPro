import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
  CostCenter,
  DocumentEntityType,
  DocumentLink,
  DocumentRecord,
  ExpenseCategory,
  Conversation,
  Desk,
  DeskBooking,
  Device,
  DeviceConnection,
  DeviceRule,
  Facility,
  FacilityBooking,
  FaultType,
  FinanceBudget,
  FinanceExpenditure,
  FinancePayment,
  FinanceRate,
  InventoryTransaction,
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
  PartCategory,
  Plan,
  PlatformSubscription,
  JobHealth,
  SystemCheck,
  PmRequiredPart,
  PmSchedule,
  Priority,
  ProcurementLine,
  ProcurementOrder,
  ProcurementReceipt,
  ProcurementReceiptLine,
  RequestRow,
  RequestStatus,
  SlaPolicy,
  Site,
  Subscription,
  Survey,
  TechnicianCertification,
  TechnicianProfile,
  Telemetry,
  UserSite,
  Vendor,
  VendorInvoice,
  WoLabor,
  WoPart,
  WorkOrder,
  WorkOrderStatus,
} from './database.types';

export interface PagedResult<T> {
  rows: T[];
  count: number;
}

function useOrgId() {
  return useOrg().currentOrg?.id;
}

export function useSites() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['sites', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_sites')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as Site[];
    },
  });
}

/** Which sites a member is restricted to — an empty array means unrestricted (org-wide), not "no access". */
export function useUserSites(userId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['user_sites', orgId, userId],
    enabled: !!orgId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_user_sites')
        .select('*')
        .eq('org_id', orgId!)
        .eq('user_id', userId!);
      if (error) throw error;
      return data as UserSite[];
    },
  });
}

/** All technician profiles in the org — admin/manager view (see fp_technician_profiles RLS). */
export function useTechnicianProfiles() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['technician_profiles', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_technician_profiles')
        .select('*')
        .eq('org_id', orgId!);
      if (error) throw error;
      return data as TechnicianProfile[];
    },
  });
}

/** One member's profile — visible to that member themselves, or admin/manager. */
export function useTechnicianProfile(userId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['technician_profile', orgId, userId],
    enabled: !!orgId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_technician_profiles')
        .select('*')
        .eq('org_id', orgId!)
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as TechnicianProfile | null) ?? null;
    },
  });
}

export function useTechnicianCertifications(profileId: string | undefined) {
  return useQuery({
    queryKey: ['technician_certifications', profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_technician_certifications')
        .select('*')
        .eq('technician_profile_id', profileId!)
        .order('expiry_date', { nullsFirst: false });
      if (error) throw error;
      return data as TechnicianCertification[];
    },
  });
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

export interface AssetPageFilters {
  assetTypeId?: string;
  locationId?: string;
  /** 'inService' = active + out of service; 'retired' = retired + disposed. */
  status?: 'inService' | 'retired';
}

/** Server-paginated asset list for Assets.tsx — dropdowns elsewhere keep using useAssets(). */
export function useAssetsPage(page: number, pageSize: number, filters: AssetPageFilters) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['assets_page', orgId, page, pageSize, filters],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PagedResult<Asset>> => {
      const from = (page - 1) * pageSize;
      let q = supabase.from('fp_assets').select('*', { count: 'exact' }).eq('org_id', orgId!);
      if (filters.assetTypeId) q = q.eq('asset_type_id', filters.assetTypeId);
      if (filters.locationId) q = q.eq('location_id', filters.locationId);
      if (filters.status === 'inService') q = q.in('status', ['active', 'inactive']);
      if (filters.status === 'retired') q = q.in('status', ['retired', 'disposed']);
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Asset[], count: count ?? 0 };
    },
  });
}

/** One asset's requests and work orders, fetched by asset (not whole tables). */
export function useAssetHistory(assetId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['asset_history', assetId],
    enabled: !!orgId && !!assetId,
    queryFn: async () => {
      const [req, wo] = await Promise.all([
        supabase.from('fp_requests').select('*').eq('asset_id', assetId!).order('created_at', { ascending: false }).limit(200),
        supabase.from('fp_work_orders').select('*').eq('asset_id', assetId!).order('created_at', { ascending: false }).limit(200),
      ]);
      if (req.error) throw req.error;
      if (wo.error) throw wo.error;
      return { requests: (req.data ?? []) as RequestRow[], workOrders: (wo.data ?? []) as WorkOrder[] };
    },
  });
}

export interface DashboardKpis {
  open_requests: number;
  overdue: number;
  in_progress: number;
  resolved_30d: number;
  /** 0079 */
  tasks?: number;
  pending_tasks?: number;
  completed_7d?: number;
  assets?: number;
  faults_7d?: number;
  resolved_7d?: number;
  categories?: { fault_type_id: string | null; count: number }[];
  setup?: { members: number; invites: number; assets: number; parts: number; locations: number };
  /** 0080: last seven days, oldest first (organisation time zone) */
  daily?: { day: string; reported: number; resolved: number }[];
}

/** Dashboard counts, computed in the database (fp_dashboard_kpis, 0069). */
export function useDashboardKpis() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['dashboard_kpis', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_dashboard_kpis', { p_org: orgId });
      if (error) throw error;
      return data as DashboardKpis;
    },
  });
}

export function useRecentRequests(limit: number) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['requests_recent', orgId, limit],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_requests')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as RequestRow[];
    },
  });
}

export interface ReportFilters {
  from?: string;
  to?: string;
  locationId?: string;
  technicianId?: string;
  priority?: string;
}

export interface ReportKpis {
  open_requests: number;
  open_work: number;
  overdue: number;
  avg_resolution_hours: number | null;
  pm_due: number;
  pm_compliance: number | null;
  planned_share: number | null;
  low_stock: number;
  expiring_contracts: number;
  total_cost: number;
  total_budget: number;
  vendor_spend: { vendor_id: string; amount: number }[];
  cost_by_month: { month: string; amount: number }[];
  mtbf_days: number | null;
}

/** Reports page figures, computed in the database (fp_report_kpis, 0069). */
export function useReportKpis(f: ReportFilters) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['report_kpis', orgId, f],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_report_kpis', {
        p_org: orgId,
        p_from: f.from || null,
        p_to: f.to || null,
        p_location: f.locationId || null,
        p_technician: f.technicianId || null,
        p_priority: f.priority || null,
      });
      if (error) throw error;
      return data as ReportKpis;
    },
  });
}

/** Exact asset count (plan usage), without downloading the assets. */
export function useAssetCount() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['asset_count', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('fp_assets')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Titles for a handful of work orders, by id. */
export function useWorkOrderTitles(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['wo_titles', key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_work_orders').select('id, title').in('id', key);
      if (error) throw error;
      return new Map((data ?? []).map((w) => [w.id as string, w.title as string]));
    },
  });
}

export interface PlanUsage {
  assets: { used: number; limit: number | null };
  members: { used: number; limit: number | null };
  sites: { used: number; limit: number | null };
  trial_ends_at: string | null;
}

/** Usage against the limits actually enforced (fp_plan_usage, 0072). */
export function usePlanUsage() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['plan_usage', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_plan_usage', { p_org: orgId });
      if (error) throw error;
      return data as PlanUsage;
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

export interface RequestPageFilters {
  status?: RequestStatus | 'all';
  locationId?: string;
  /** Words to find in the title or description. */
  search?: string;
}

/**
 * PostgREST filter for a text search: every word must appear in one of the
 * columns (any order, any case). Characters that carry meaning in the filter
 * syntax (, ( ) * % \ " :) are treated as spaces; values are quoted so a word
 * with a dot (v1.2) stays one value. Returns the body of an or=(…) filter, or
 * null for an empty search.
 */
export function textSearchFilter(term: string | undefined, columns: string[]): string | null {
  const words = (term ?? '')
    .slice(0, 100)
    .replace(/[,()*%\\":]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (!words.length) return null;
  const perWord = words.map((w) => `or(${columns.map((c) => `${c}.ilike."*${w}*"`).join(',')})`);
  return `and(${perWord.join(',')})`;
}

/** Server-paginated request list for Requests.tsx. */
export function useRequestsPage(page: number, pageSize: number, filters: RequestPageFilters) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['requests_page', orgId, page, pageSize, filters],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PagedResult<RequestRow>> => {
      const from = (page - 1) * pageSize;
      let q = supabase.from('fp_requests').select('*', { count: 'exact' }).eq('org_id', orgId!);
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.locationId) q = q.eq('location_id', filters.locationId);
      const search = textSearchFilter(filters.search, ['title', 'body_original']);
      if (search) q = q.or(search);
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as RequestRow[], count: count ?? 0 };
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

export interface WorkOrderPageFilters {
  status?: WorkOrderStatus | 'all';
  locationId?: string;
  assignedTo?: string;
  priority?: Priority | 'all';
  /** Words to find in the title or instructions. */
  search?: string;
}

/** Server-paginated work-order list for WorkOrders.tsx. */
export function useWorkOrdersPage(page: number, pageSize: number, filters: WorkOrderPageFilters) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['work_orders_page', orgId, page, pageSize, filters],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PagedResult<WorkOrder>> => {
      const from = (page - 1) * pageSize;
      let q = supabase.from('fp_work_orders').select('*', { count: 'exact' }).eq('org_id', orgId!);
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.locationId) q = q.eq('location_id', filters.locationId);
      if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo);
      if (filters.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority);
      const search = textSearchFilter(filters.search, ['title', 'instructions']);
      if (search) q = q.or(search);
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as WorkOrder[], count: count ?? 0 };
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

/** The work order created from a request, if any (one per request, 0060). */
export function useWorkOrderForRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: ['work_order_for_request', requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_work_orders')
        .select('id, title, status')
        .eq('request_id', requestId!)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<WorkOrder, 'id' | 'title' | 'status'> | null;
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

export function usePmRequiredParts(pmScheduleId: string | undefined) {
  return useQuery({
    queryKey: ['pm_required_parts', pmScheduleId],
    enabled: !!pmScheduleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_pm_required_parts')
        .select('*')
        .eq('pm_schedule_id', pmScheduleId!)
        .order('created_at');
      if (error) throw error;
      return data as PmRequiredPart[];
    },
  });
}

export interface PartPageFilters {
  categoryId?: string;
}

/** Server-paginated parts list for Parts.tsx. */
export function usePartsPage(page: number, pageSize: number, filters: PartPageFilters) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['parts_page', orgId, page, pageSize, filters],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PagedResult<Part>> => {
      const from = (page - 1) * pageSize;
      let q = supabase.from('fp_parts').select('*', { count: 'exact' }).eq('org_id', orgId!);
      if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
      const { data, error, count } = await q.order('created_at').range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Part[], count: count ?? 0 };
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

export function usePartCategories() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['part_categories', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_part_categories')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as PartCategory[];
    },
  });
}

export function useInventoryTransactions(partId: string | undefined) {
  return useQuery({
    queryKey: ['inventory_transactions', partId],
    enabled: !!partId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_inventory_transactions')
        .select('*')
        .eq('part_id', partId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as InventoryTransaction[];
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

export function useWoLabor(workOrderId: string | undefined) {
  return useQuery({
    queryKey: ['wo_labor', workOrderId],
    enabled: !!workOrderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_wo_labor')
        .select('*')
        .eq('work_order_id', workOrderId!)
        .order('logged_at');
      if (error) throw error;
      return data as WoLabor[];
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

export interface VendorPageFilters {
  category?: string;
}

/** Server-paginated vendor list for Vendors.tsx. */
export function useVendorsPage(page: number, pageSize: number, filters: VendorPageFilters) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['vendors_page', orgId, page, pageSize, filters],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PagedResult<Vendor>> => {
      const from = (page - 1) * pageSize;
      let q = supabase.from('fp_vendors').select('*', { count: 'exact' }).eq('org_id', orgId!);
      if (filters.category) q = q.eq('category', filters.category);
      const { data, error, count } = await q.order('name').range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Vendor[], count: count ?? 0 };
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

export function useExpenseCategories() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['expense_categories', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_expense_categories')
        .select('*')
        .eq('org_id', orgId!)
        .order('name');
      if (error) throw error;
      return data as ExpenseCategory[];
    },
  });
}

export function useCostCenters() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['cost_centers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_cost_centers')
        .select('*')
        .eq('org_id', orgId!)
        .order('name');
      if (error) throw error;
      return data as CostCenter[];
    },
  });
}

export function useProcurementOrders() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['procurement_orders', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_finance_procurement')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ProcurementOrder[];
    },
  });
}

export function useProcurementLines(procurementId: string | undefined) {
  return useQuery({
    queryKey: ['procurement_lines', procurementId],
    enabled: !!procurementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_procurement_lines')
        .select('*')
        .eq('procurement_id', procurementId!)
        .order('created_at');
      if (error) throw error;
      return data as ProcurementLine[];
    },
  });
}

export function useProcurementReceipts(procurementId: string | undefined) {
  return useQuery({
    queryKey: ['procurement_receipts', procurementId],
    enabled: !!procurementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_procurement_receipts')
        .select('*')
        .eq('procurement_id', procurementId!)
        .order('received_at', { ascending: false });
      if (error) throw error;
      return data as ProcurementReceipt[];
    },
  });
}

export function useProcurementReceiptLines(procurementId: string | undefined) {
  return useQuery({
    queryKey: ['procurement_receipt_lines', procurementId],
    enabled: !!procurementId,
    queryFn: async () => {
      // Receipt lines don't carry procurement_id directly; join through the
      // receipt so "received so far per line" can be computed for a PO.
      const { data, error } = await supabase
        .from('fp_procurement_receipt_lines')
        .select('*, fp_procurement_receipts!inner(procurement_id)')
        .eq('fp_procurement_receipts.procurement_id', procurementId!);
      if (error) throw error;
      return data as ProcurementReceiptLine[];
    },
  });
}

export function useVendorInvoices(procurementId: string | undefined) {
  return useQuery({
    queryKey: ['vendor_invoices', procurementId],
    enabled: !!procurementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_vendor_invoices')
        .select('*')
        .eq('procurement_id', procurementId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as VendorInvoice[];
    },
  });
}

export function useAllVendorInvoices() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['vendor_invoices_all', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_vendor_invoices')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as VendorInvoice[];
    },
  });
}

export function useFinancePayments() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['finance_payments_full', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_finance_payments')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as FinancePayment[];
    },
  });
}

export function useDocuments() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['documents', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_documents')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DocumentRecord[];
    },
  });
}

export function useOrgDocumentLinks() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['document_links_all', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_document_links')
        .select('*')
        .eq('org_id', orgId!);
      if (error) throw error;
      return data as DocumentLink[];
    },
  });
}

export function useDocumentLinks(entityType: DocumentEntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: ['document_links', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_document_links')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at');
      if (error) throw error;
      return data as DocumentLink[];
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
        .eq('user_id', userId!)
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

/** Platform operator (fp_platform_admins) — manages plans and activates subscriptions. */
export function useIsPlatformAdmin() {
  return useQuery({
    queryKey: ['is_platform_admin'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_is_platform_admin');
      if (error) throw error;
      return data === true;
    },
  });
}

/** Every org's subscription, pending requests first. Platform admins only. */
export function usePlatformSubscriptions(enabled: boolean) {
  return useQuery({
    queryKey: ['platform_subscriptions'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_platform_subscriptions');
      if (error) throw error;
      return (data ?? []) as PlatformSubscription[];
    },
  });
}

/** Background job health (pg_cron jobs + outbox). Platform admins only. */
export function useJobHealth(enabled: boolean) {
  return useQuery({
    queryKey: ['job_health'],
    enabled,
    meta: { errorHandled: true }, // the panel shows it
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_job_health');
      if (error) throw error;
      return (data ?? []) as JobHealth[];
    },
  });
}

export function useSystemChecks(enabled: boolean) {
  return useQuery({
    queryKey: ['system_checks'],
    enabled,
    meta: { errorHandled: true }, // the panel shows it
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_system_health');
      if (error) throw error;
      return (data ?? []) as SystemCheck[];
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

/** The full device row, including its key: org admins and managers only (RLS). */
export function useDevice(deviceId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['device', deviceId],
    enabled: !!deviceId && enabled,
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

export function useDeviceConnection(deviceId: string | undefined) {
  return useQuery({
    queryKey: ['device_connection', deviceId],
    enabled: !!deviceId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_device_connections')
        .select('*')
        .eq('device_id', deviceId!)
        .maybeSingle();
      if (error) throw error;
      return (data as DeviceConnection | null) ?? null;
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

export interface Announcement {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

/** Latest announcements (fp_broadcasts) for the tenant home screen. */
export function useAnnouncements(limit: number) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['broadcasts', orgId, 'latest', limit],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_broadcasts')
        .select('id, title, message, created_at')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });
}
