export type I18nText = Record<string, string>;

export type Role =
  | 'super_admin'
  | 'org_admin'
  | 'manager'
  | 'technician'
  | 'occupant'
  | 'vendor';

export interface Organization {
  id: string;
  name: string;
  default_lng: string;
  active_languages: string[];
  subscription_tier: string;
  allow_public_requests?: boolean;
  auto_create_work_orders?: boolean;
  settings?: { timezone?: string; currency?: string } | null;
  /** 0079 */
  industry?: string | null;
  logo_path?: string | null;
}

export interface Membership {
  org_id: string;
  role: Role;
  fp_organizations: Organization;
}

export interface Site {
  id: string;
  org_id: string;
  name_i18n: I18nText;
  address: string | null;
  created_at: string;
}

export interface UserSite {
  user_id: string;
  org_id: string;
  site_id: string;
}

export interface TechnicianProfile {
  id: string;
  org_id: string;
  user_id: string;
  employee_id: string | null;
  phone: string | null;
  labor_rate: number | null;
  shift: string | null;
  skills: string[];
  created_at: string;
}

export interface TechnicianCertification {
  id: string;
  org_id: string;
  technician_profile_id: string;
  name: string;
  issuer: string | null;
  expiry_date: string | null;
  created_at: string;
}

export type LocationKind = 'building' | 'floor' | 'room' | 'zone';

export interface LocationRow {
  id: string;
  org_id: string;
  site_id: string | null;
  parent_id: string | null;
  name_i18n: I18nText;
  kind: LocationKind;
  created_at: string;
}

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface AssetType {
  id: string;
  org_id: string;
  name_i18n: I18nText;
  is_active?: boolean;
}

export interface FaultType {
  id: string;
  org_id: string;
  name_i18n: I18nText;
  default_priority: Priority;
  is_active?: boolean;
}

export type AssetStatus = 'active' | 'inactive' | 'retired' | 'disposed';

export interface Asset {
  id: string;
  org_id: string;
  location_id: string | null;
  asset_type_id: string | null;
  name_i18n: I18nText;
  serial: string | null;
  manufacturer: string | null;
  model: string | null;
  warranty_expiry: string | null;
  qr_code: string | null;
  status: AssetStatus;
  retired_at: string | null;
  created_at: string;
}

export type RequestStatus =
  | 'new'
  | 'triaged'
  | 'assigned'
  | 'in_progress'
  | 'on_hold'
  | 'resolved'
  | 'closed'
  | 'rejected';

export interface RequestRow {
  id: string;
  org_id: string;
  asset_id: string | null;
  location_id: string | null;
  fault_type_id: string | null;
  title: string | null;
  body_original: string | null;
  source_lng: string;
  severity: string | null;
  priority: Priority;
  channel: string;
  status: RequestStatus;
  created_by: string | null;
  created_at: string;
}

export type WorkOrderStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'on_hold'
  | 'resolved'
  | 'verified'
  | 'closed';

export interface WorkOrder {
  id: string;
  org_id: string;
  /** Bumped on every change (0072); used to detect edit conflicts. */
  version: number;
  request_id: string | null;
  asset_id: string | null;
  assigned_to: string | null;
  title: string | null;
  instructions: string | null;
  priority: Priority;
  status: WorkOrderStatus;
  due_at: string | null;
  // Lifecycle timestamps are set by the database (0060), never by the client.
  started_at: string | null;
  resolved_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  closed_at: string | null;
  hold_reason: string | null;
  reopened_count: number;
  labour_minutes: number;
  cost: number;
  checklist_template_id: string | null;
  pm_schedule_id: string | null;
  location_id: string | null;
  fault_type_id: string | null;
  severity: string | null;
  failure_code: string | null;
  completion_code: string | null;
  downtime_minutes: number | null;
  cost_center_id: string | null;
  vendor_id: string | null;
  created_at: string;
}

export const FAILURE_CODES = ['wear', 'misuse', 'defect', 'external', 'unknown'] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

export const COMPLETION_CODES = ['repaired', 'replaced', 'no_fault_found', 'deferred'] as const;
export type CompletionCode = (typeof COMPLETION_CODES)[number];

export type DocumentEntityType = 'asset' | 'work_order' | 'vendor' | 'contract' | 'location' | 'part';

export interface DocumentLink {
  id: string;
  org_id: string;
  document_id: string;
  entity_type: DocumentEntityType;
  entity_id: string;
  created_at: string;
}

export interface DocumentRecord {
  id: string;
  org_id: string;
  title: string;
  category: string;
  owner: string;
  summary: string | null;
  link: string | null;
  file_name: string | null;
  file_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  /** 'staff' = admins, managers, technicians; 'everyone' also occupants and vendors. */
  visibility: 'staff' | 'everyone';
  created_at: string;
}

export interface Media {
  id: string;
  org_id: string;
  work_order_id: string | null;
  request_id: string | null;
  path: string;
  kind: string;
  phase: string | null;
  created_at: string;
}

export interface OrgMember {
  user_id: string;
  email: string;
  role: Role;
}

export type ChecklistItemType = 'pass_fail' | 'value' | 'photo' | 'text';

export interface ChecklistTemplate {
  id: string;
  org_id: string;
  name_i18n: I18nText;
  created_at: string;
}

export interface Survey {
  id: string;
  org_id: string;
  name_i18n: I18nText;
  questions: string[];
  is_active: boolean;
  created_at: string;
}

export interface Desk {
  id: string;
  org_id: string;
  name_i18n: I18nText;
  zone_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DeskBooking {
  id: string;
  org_id: string;
  desk_id: string;
  booked_by: string | null;
  booker_name: string | null;
  booked_for: string | null;
  created_at: string;
}

export interface Facility {
  id: string;
  org_id: string;
  name_i18n: I18nText;
  location_id: string | null;
  capacity: number | null;
  is_active: boolean;
  created_at: string;
}

export interface FacilityBooking {
  id: string;
  org_id: string;
  facility_id: string;
  booked_by: string | null;
  booker_name: string | null;
  booked_for: string | null;
  created_at: string;
}

export interface FinanceExpenditure {
  id: string;
  org_id: string;
  description: string;
  category: string;
  amount: number;
  vendor: string | null;
  vendor_id: string | null;
  work_order_id: string | null;
  asset_id: string | null;
  part_id: string | null;
  category_id: string | null;
  cost_center_id: string | null;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
}

export interface CostCenter {
  id: string;
  org_id: string;
  name: string;
  code: string | null;
  created_at: string;
}

export type ProcurementStatus = 'rfq' | 'po' | 'received' | 'approved';

export interface ProcurementOrder {
  id: string;
  org_id: string;
  title: string;
  vendor: string | null; // legacy free-text label, pre-vendor_id rows only
  vendor_id: string | null;
  cost_center_id: string | null;
  po_number: string | null;
  amount: number;
  status: ProcurementStatus;
  notes: string | null;
  created_at: string;
}

export interface ProcurementLine {
  id: string;
  org_id: string;
  procurement_id: string;
  part_id: string | null;
  description: string;
  quantity: number;
  unit_cost: number;
  created_at: string;
}

export interface ProcurementReceipt {
  id: string;
  org_id: string;
  procurement_id: string;
  received_by: string | null;
  received_at: string;
  note: string | null;
  created_at: string;
}

export interface ProcurementReceiptLine {
  id: string;
  org_id: string;
  receipt_id: string;
  procurement_line_id: string;
  quantity_received: number;
  created_at: string;
}

export interface FinancePayment {
  id: string;
  org_id: string;
  description: string;
  amount: number;
  method: string;
  reference: string | null;
  status: 'pending' | 'completed';
  procurement_id: string | null;
  vendor_id: string | null;
  invoice_id: string | null;
  created_at: string;
}

export type VendorInvoiceStatus = 'pending' | 'matched' | 'disputed' | 'paid';

export interface VendorInvoice {
  id: string;
  org_id: string;
  procurement_id: string | null;
  vendor_id: string | null;
  invoice_number: string | null;
  amount: number;
  invoice_date: string | null;
  status: VendorInvoiceStatus;
  notes: string | null;
  created_at: string;
}

export interface FinanceRate {
  id: string;
  org_id: string;
  service: string;
  unit: string;
  rate: number;
  currency: string;
  created_at: string;
}

export interface FinanceBudget {
  id: string;
  org_id: string;
  name: string;
  amount: number;
  period: string;
  notes: string | null;
  cost_center_id: string | null;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  org_id: string;
  template_id: string;
  ord: number;
  label_i18n: I18nText;
  item_type: ChecklistItemType;
  required: boolean;
}

export interface ChecklistResult {
  status?: 'pass' | 'fail' | 'done';
  value?: string;
  note?: string;
}

export interface ChecklistRun {
  id: string;
  org_id: string;
  template_id: string | null;
  work_order_id: string | null;
  performed_by: string | null;
  results: Record<string, ChecklistResult>;
  completed_at: string | null;
  created_at: string;
}

export type PmTriggerType = 'calendar' | 'meter';

export interface PmSchedule {
  id: string;
  org_id: string;
  asset_id: string | null;
  name_i18n: I18nText;
  interval_days: number;
  checklist_template_id: string | null;
  assigned_to: string | null;
  priority: Priority;
  next_due_at: string | null;
  last_run_at: string | null;
  active: boolean;
  trigger_type: PmTriggerType;
  meter_id: string | null;
  meter_threshold: number | null;
  last_meter_value: number | null;
  lead_time_days: number;
  created_at: string;
}

export interface PmRequiredPart {
  id: string;
  org_id: string;
  pm_schedule_id: string;
  part_id: string;
  quantity: number;
  created_at: string;
}

export interface Part {
  id: string;
  org_id: string;
  name_i18n: I18nText;
  sku: string | null;
  unit: string | null;
  stock_balance: number;
  reorder_level: number;
  unit_cost: number;
  preferred_vendor_id: string | null;
  category_id: string | null;
  created_at: string;
}

export interface PartCategory {
  id: string;
  org_id: string;
  name_i18n: I18nText;
  created_at: string;
}

export type InventoryTransactionType = 'issue' | 'receipt' | 'adjustment' | 'cycle_count';

export interface InventoryTransaction {
  id: string;
  org_id: string;
  part_id: string;
  type: InventoryTransactionType;
  quantity_delta: number;
  ref_table: string | null;
  ref_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface WoPart {
  id: string;
  org_id: string;
  work_order_id: string;
  part_id: string;
  quantity: number;
  unit_cost_snapshot: number | null;
  created_at: string;
}

export interface WoLabor {
  id: string;
  org_id: string;
  work_order_id: string;
  user_id: string | null;
  minutes: number;
  rate_snapshot: number;
  logged_at: string;
  created_at: string;
}

export interface Meter {
  id: string;
  org_id: string;
  asset_id: string;
  name_i18n: I18nText;
  unit: string | null;
  created_at: string;
}

export interface MeterReading {
  id: string;
  org_id: string;
  meter_id: string;
  value: number;
  read_at: string;
  read_by: string | null;
}

export interface Vendor {
  id: string;
  org_id: string;
  name: string;
  category: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface Contract {
  id: string;
  org_id: string;
  vendor_id: string | null;
  title: string;
  document_url: string | null;
  start_date: string | null;
  expiry_date: string | null;
  reminder_days: number;
  created_at: string;
}

export interface License {
  id: string;
  org_id: string;
  name: string;
  holder: string | null;
  document_url: string | null;
  expiry_date: string | null;
  reminder_days: number;
  created_at: string;
}

export interface SlaPolicy {
  id: string;
  org_id: string;
  priority: Priority;
  resolution_hours: number;
}

export interface AssignmentRule {
  id: string;
  org_id: string;
  fault_type_id: string | null;
  priority: Priority | null;
  assigned_to: string;
  ord: number;
}

export interface NotificationRow {
  id: string;
  org_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  /** Generated text in each language (0075); falls back to title/body. */
  title_i18n?: Record<string, string> | null;
  body_i18n?: Record<string, string> | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRow {
  id: string;
  org_id: string;
  work_order_id: string;
  status: ApprovalStatus;
  note: string | null;
  requested_by: string | null;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface NotificationPref {
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  phone: string | null;
  updated_at: string;
}

export type ConversationChannel = 'manual' | 'web' | 'whatsapp' | 'zalo' | 'line' | 'email';

export interface Conversation {
  id: string;
  org_id: string;
  channel: ConversationChannel;
  contact_name: string | null;
  contact_handle: string | null;
  status: 'open' | 'closed';
  last_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  org_id: string;
  conversation_id: string;
  direction: 'in' | 'out';
  body: string;
  sender: string | null;
  /** Outbound delivery on the external channel (set by channel-send / webhook receipts). */
  delivery_status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  delivery_error: string | null;
  created_at: string;
}

export interface PlanLimits {
  assets?: number;
  members?: number;
  sites?: number;
}

export interface Plan {
  code: string;
  name_i18n: I18nText;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  limits: PlanLimits;
  payment_url: string | null;
  sort: number;
  active: boolean;
  // 0083/0086: yearly price, features, and the provider price/plan IDs.
  price_year?: number | null;
  features?: string[];
  stripe_price_month?: string | null;
  stripe_price_year?: string | null;
  paypal_plan_month?: string | null;
  paypal_plan_year?: string | null;
}

export type SubscriptionStatus =
  | 'active'
  | 'pending'
  | 'past_due'
  | 'canceled'
  | 'trialing';

export interface Subscription {
  org_id: string;
  plan_code: string | null;
  status: SubscriptionStatus;
  provider: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  note: string | null;
  requested_plan_code: string | null;
  requested_at: string | null;
  cancel_requested_at: string | null;
  updated_at: string;
  billing_interval?: 'month' | 'year';
  trial_ends_at?: string | null;
  cancel_at_period_end?: boolean;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
}

/** Row of fp_job_health(): one background job's status (platform admins). */
export interface JobHealth {
  job: string;
  description: string;
  max_silence_minutes: number;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_ok: boolean | null;
  last_error: string | null;
  healthy: boolean;
}

/** Row of fp_system_health(): delivery and workflow checks (0066). */
export interface SystemCheck {
  check_name: 'outbox_failed' | 'outbox_backlog' | 'workflow_failures';
  ok: boolean;
  detail: string;
}

/** Row of fp_platform_subscriptions(): the platform operator's billing queue. */
export interface PlatformSubscription {
  org_id: string;
  org_name: string;
  plan_code: string | null;
  status: SubscriptionStatus;
  requested_plan_code: string | null;
  requested_at: string | null;
  cancel_requested_at: string | null;
  current_period_end: string | null;
}

export interface Device {
  id: string;
  org_id: string;
  asset_id: string | null;
  name: string;
  kind: string | null;
  device_key: string;
  meter_id: string | null;
  metric_map: Record<string, string>;
  last_seen_at: string | null;
  /** Alert admins/managers when no data arrives for this long (0067). */
  offline_after_minutes: number | null;
  offline_alerted_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  /** IoT platform (0077). */
  location_id: string | null;
  site_id: string | null;
  device_type_id: string | null;
  model_id: string | null;
  protocol: string | null;
  external_id: string | null;
  gateway_id: string | null;
  connection_config: Record<string, unknown>;
  firmware_version: string | null;
}

export interface Telemetry {
  id: string;
  org_id: string;
  device_id: string;
  metric: string;
  value: number | null;
  unit: string | null;
  ts: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export type DeviceRuleOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'pct_above_baseline' | 'pct_below_baseline';
export type DeviceRuleAction = 'alert' | 'notify' | 'work_order' | 'both';

export interface DeviceRule {
  id: string;
  org_id: string;
  device_id: string;
  metric: string | null;
  op: DeviceRuleOp;
  threshold: number;
  action: DeviceRuleAction;
  severity: string;
  message: string | null;
  cooldown_minutes: number;
  last_fired_at: string | null;
  active: boolean;
  created_at: string;
  /** 0077 */
  name: string | null;
  alert_severity: 'info' | 'warning' | 'critical' | 'emergency';
  conditions: { device_id?: string; metric: string; op: string; threshold: number }[];
  notify_roles: string[];
  active_hours: { days?: number[]; from?: string; to?: string } | null;
  suppress_until: string | null;
  escalate_after_minutes: number | null;
  auto_resolve: boolean;
}

export type DeviceConnProtocol = 'mqtt' | 'mqtts' | 'ws' | 'wss';

export interface DeviceConnection {
  id: string;
  org_id: string;
  device_id: string;
  protocol: DeviceConnProtocol;
  host: string;
  port: number;
  topic: string;
  username: string | null;
  password: string | null;
  client_id: string | null;
  qos: 0 | 1 | 2;
  enabled: boolean;
  last_connected_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}
