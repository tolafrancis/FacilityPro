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
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Asset[], count: count ?? 0 };
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
