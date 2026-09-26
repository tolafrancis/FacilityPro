import type { LucideIcon } from 'lucide-react';
import {
  Activity, BadgeCheck, BarChart3, BellRing, Bot, Boxes, Briefcase, Building, Building2, CalendarCheck, CalendarClock,
  Camera, Church, ClipboardCheck, ClipboardList, Cpu, CreditCard, Factory, FileSignature, FileText, Flame, Gauge,
  GitBranch, GraduationCap, Hammer, HardHat, Hospital, Hotel, Inbox, KeyRound, Landmark, Languages, LayoutGrid,
  LifeBuoy, MapPin, Megaphone, MessageSquareHeart, MonitorPlay, Network, Package, Plug, QrCode, Receipt, Rocket,
  Newspaper, ShieldCheck, ShoppingBag, ShoppingCart, Smartphone, Sparkles, SprayCan, Tag, Truck, UserCheck, Users,
  Wallet, Warehouse, Wrench, Zap,
} from 'lucide-react';

// The public site's catalogue: every feature, solution and resource in the
// header menus has a page (/features/:slug, /solutions/:slug,
// /resources/:slug). Only describe what FacilityPro actually does.

export interface FeatureItem {
  slug: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  points: string[];
  /** Entry in the in-app Feature directory (src/help/features.ts) whose steps show under "How it works". */
  helpId?: string;
  /** Steps for features the directory doesn't cover. */
  steps?: string[];
}

export interface FeatureGroup {
  key: string;
  label: string;
  badge?: string;
  items: FeatureItem[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    key: 'core',
    label: 'Work & maintenance',
    items: [
      { slug: 'fault-reporting', title: 'Issue reporting', icon: Megaphone, helpId: 'requests',
        summary: 'Staff, tenants and visitors report problems in seconds, with photos, from any phone or computer.',
        points: ['Requests from the web app, a public report form, QR codes, email and Zalo', 'Photos attached at the moment of reporting', 'Reports written in English or Vietnamese reach the team in their own language', 'The reporter follows progress and gets notified when it’s fixed'] },
      { slug: 'qr-code-fault-reporting', title: 'Scan-to-report QR codes', icon: QrCode, helpId: 'public-report',
        summary: 'Stick a QR code on every asset and room. Scanning it opens a report already filled in with where and what.',
        points: ['Print QR labels for assets and locations in bulk', 'Visitors report without an account when public reporting is on', 'Staff who scan go straight to the asset’s history', 'Rate limits and spam protection on public reports'] },
      { slug: 'work-orders', title: 'Work orders', icon: Wrench, helpId: 'work-orders',
        summary: 'Every job from open to closed: assigned, tracked against its SLA, costed and signed off.',
        points: ['Open → assigned → in progress → on hold → resolved → verified → closed', 'SLA due times by priority, with automatic escalation when overdue', 'Labour time, parts used and costs recorded on the job', 'Printable job sheets and a full history of every change'] },
      { slug: 'preventive-maintenance', title: 'Preventive maintenance', icon: CalendarClock, helpId: 'preventive-maintenance',
        summary: 'Calendar and meter-based schedules that create work orders on time, every time.',
        points: ['Schedules by days, weeks, months or meter readings (hours, km, cycles)', 'Work orders generated ahead of the due date in your time zone', 'A kit of the parts each job usually needs', 'Missed cycles caught and flagged instead of silently skipped'] },
      { slug: 'checklists', title: 'Checklists', icon: ClipboardCheck, helpId: 'checklists',
        summary: 'Standard inspections and procedures that technicians complete step by step on their phone.',
        points: ['Reusable checklist templates for inspections and PM', 'Attached to work orders and preventive schedules', 'Required answers, readings and photos', 'Completed checklists saved with the job for audits'] },
      { slug: 'photo-evidence', title: 'Photo & video proof', icon: Camera,
        steps: ['Open the request or work order.', 'Take a photo with the phone camera or upload a file.', 'It is saved with the job, visible to everyone who can see that job.'],
        summary: 'Before-and-after photos and files on requests and work orders, stored securely per organisation.',
        points: ['Capture from the phone camera or upload files', 'Visible to the people who can see the job', 'Kept with the job history for disputes and audits'] },
      { slug: 'technician-app', title: 'Technician mobile app', icon: Smartphone, helpId: 'my-work',
        summary: '“My work” on any phone: today’s jobs, directions to the asset, and updates that work even offline.',
        points: ['Installs from the browser (no app store needed)', 'Updates are saved offline and sync when the signal is back', 'Large touch targets and a bottom tab bar made for the field', 'Push, email, SMS and Zalo notifications'] },
      { slug: 'attendance', title: 'Technician attendance', icon: UserCheck, helpId: 'attendance',
        summary: 'Clock in and out on site, so you know who is working where.',
        points: ['Check-in and check-out per site', 'Attendance history per technician', 'Ties into labour time on work orders'] },
      { slug: 'permit-to-work', title: 'Permit to work', icon: HardHat, helpId: 'permits',
        summary: 'Hot work, confined spaces and other risky jobs only start once the right permit is approved.',
        points: ['Permit requests with hazards and controls', 'Approval before work begins, with validity periods', 'A record of every permit issued'] },
      { slug: 'approvals', title: 'Approvals', icon: BadgeCheck, helpId: 'approvals',
        summary: 'Jobs and spending that need a manager’s OK wait for it — and everyone can see where they stand.',
        points: ['Approval steps on work orders and purchases', 'Approve or reject with a comment', 'Notifications to approvers and requesters'] },
    ],
  },
  {
    key: 'assets',
    label: 'Assets & inventory',
    items: [
      { slug: 'asset-management', title: 'Asset management', icon: Boxes, helpId: 'assets',
        summary: 'A register of every asset with its location, history, documents and full lifecycle.',
        points: ['Asset types, serials, warranty and purchase details', 'Complete maintenance history on each asset', 'Retire or dispose of assets; their schedules pause automatically', 'QR labels that link to the asset'] },
      { slug: 'meters', title: 'Meters & readings', icon: Gauge, helpId: 'meters',
        summary: 'Record run hours, kilometres or cycles by hand or from sensors, and trigger maintenance from them.',
        points: ['Manual readings from the phone', 'Automatic readings from IoT devices', 'Meter-based preventive schedules, with resets handled'] },
      { slug: 'parts-inventory', title: 'Parts & inventory', icon: Package, helpId: 'parts',
        summary: 'Know what’s in stock, what each job used and what to reorder.',
        points: ['Stock levels by part and category', 'Parts consumed on work orders update stock', 'Low-stock visibility for reordering'] },
      { slug: 'vendors', title: 'Vendors & contractors', icon: Truck, helpId: 'vendors',
        summary: 'Your contractors in one place, with their jobs, contracts and invoices.',
        points: ['Vendor records and contacts', 'Assign work orders to vendors', 'Vendor portal access for contractors'] },
      { slug: 'contracts-licenses', title: 'Contracts & licences', icon: FileSignature, helpId: 'contracts',
        summary: 'Service contracts and licences with reminders before they expire.',
        points: ['Start and end dates, values and documents', 'Automatic expiry reminders', 'Linked to vendors and assets'] },
      { slug: 'documents', title: 'Document library', icon: FileText, helpId: 'documents',
        summary: 'Manuals, drawings, certificates and SOPs, linked to the assets and places they belong to.',
        points: ['Upload and organise documents', 'Link documents to assets and locations', 'Access follows each person’s role and sites'] },
      { slug: 'locations', title: 'Sites & locations', icon: MapPin, helpId: 'locations',
        summary: 'Model your portfolio as sites, buildings, floors, rooms and zones.',
        points: ['Unlimited nesting of buildings, floors, rooms and zones', 'Names in English and Vietnamese', 'Staff can be limited to the sites they look after'] },
    ],
  },
  {
    key: 'tenant',
    label: 'Occupant services',
    items: [
      { slug: 'tenant-portal', title: 'Tenant portal', icon: Building, helpId: 'tenant-app',
        summary: 'Occupants report faults and follow their own requests — without seeing anyone else’s data.',
        points: ['A simple home screen: report a fault, see my requests', 'Updates when their request moves', 'Invite occupants with a link or QR code'] },
      { slug: 'desk-booking', title: 'Desk booking', icon: LayoutGrid, helpId: 'desks',
        summary: 'Hot desks booked by the day, with no double bookings.',
        points: ['Desks by floor and zone', 'Book, cancel and see who sits where', 'Recent bookings listed alongside the desks'] },
      { slug: 'facility-booking', title: 'Facility & room booking', icon: CalendarCheck, helpId: 'facility-booking',
        summary: 'Meeting rooms, halls, courts and other shared spaces, booked without clashes.',
        points: ['Time-slot bookings with clash checks', 'Booking history per facility', 'Each facility linked to its place in your locations'] },
      { slug: 'surveys', title: 'Surveys & feedback', icon: MessageSquareHeart, helpId: 'surveys',
        summary: 'Ask occupants how the service was and see satisfaction trends.',
        points: ['Surveys sent to occupants by site', 'Ratings and comments collected per site', 'Sent automatically after a job with a workflow'] },
      { slug: 'broadcasts', title: 'Broadcasts', icon: BellRing, helpId: 'announcements',
        summary: 'Tell occupants about planned outages, works and news, right on their home screen.',
        points: ['Updates shown on every occupant’s home screen', 'An audience on each update, such as all tenants or one building', 'Past updates kept for your team to review'] },
      { slug: 'inbox', title: 'Multi-channel inbox', icon: Inbox, helpId: 'inbox',
        summary: 'Messages from Zalo and email land in one shared inbox and turn into requests.',
        points: ['Zalo Official Account and email channels', 'Reply from FacilityPro', 'Convert a message into a request in one click'] },
    ],
  },
  {
    key: 'finance',
    label: 'Spend & budgets',
    items: [
      { slug: 'budgets', title: 'Budgets & expenditure', icon: Wallet, helpId: 'financials',
        summary: 'Plan budgets and track what’s actually spent, by site and category.',
        points: ['Budgets by period and category', 'Expenditures recorded against budgets', 'Customers, payments and rates for billable work'] },
      { slug: 'procurement', title: 'Procurement', icon: ShoppingCart, helpId: 'purchase-orders',
        summary: 'Purchase orders from request to receipt, with approvals.',
        points: ['Purchase orders with numbered lines', 'Goods received against each order', 'Approval before spending'] },
      { slug: 'vendor-invoices', title: 'Vendor invoices', icon: Receipt, helpId: 'financials',
        summary: 'Contractor invoices matched to the work and purchase orders they belong to.',
        points: ['Record and track invoices per vendor', 'Linked to work orders and purchase orders', 'Payments matched to the purchase order and invoice (three-way match)'] },
      { slug: 'cost-tracking', title: 'Cost tracking', icon: Tag, helpId: 'reports',
        summary: 'What every job, asset and site really costs — labour, parts and contractors.',
        points: ['Labour time and parts cost on every work order', 'Cost centres for chargebacks', 'Cost reports by asset, site and period'] },
    ],
  },
  {
    key: 'reporting',
    label: 'Insights & connections',
    items: [
      { slug: 'reports', title: 'Reports & dashboards', icon: BarChart3, helpId: 'reports',
        summary: 'Live dashboards and exportable reports on requests, work orders, SLAs, costs and assets.',
        points: ['Dashboard with open work, overdue jobs and weekly faults', 'SLA compliance and response times', 'CSV exports of every list'] },
      { slug: 'tv-displays', title: 'TV display boards', icon: MonitorPlay, helpId: 'tv-displays',
        summary: 'Show live work order status on a TV — like an “order ready” board for your maintenance team.',
        points: ['New / In progress / On hold / Done columns or a list', 'Refreshes itself; highlights jobs that just changed', 'Secret link you can switch off or replace at any time'] },
      { slug: 'workflows', title: 'No-code workflows', icon: GitBranch, helpId: 'workflows',
        summary: 'When something happens, do something: assign, notify, escalate — without code.',
        points: ['Triggers on requests, work orders, schedules and more', 'Actions: assign, email, SMS, push, Zalo, create work orders', 'Time-based rules and escalations'] },
      { slug: 'iot', title: 'IoT & sensors', icon: Cpu, helpId: 'iot-devices',
        summary: 'Connect sensors and meters so faults are reported before anyone notices.',
        points: ['MQTT, LoRaWAN (TTN / ChirpStack), Modbus through an edge gateway, and an HTTP API', 'Live readings, history charts and alert rules', 'Alerts that open work orders and escalate if nobody responds'] },
      { slug: 'integrations', title: 'Integrations', icon: Plug, helpId: 'integrations',
        summary: 'Works with the channels and tools you already use.',
        points: ['Zalo, email, SMS and web push notifications', 'IoT ingest API and gateways', 'Card and PayPal billing'] },
      { slug: 'security', title: 'Security & permissions', icon: ShieldCheck, helpId: 'team',
        summary: 'Every organisation’s data is isolated, and every person only sees what their role allows.',
        points: ['Roles: admin, manager, technician, occupant, vendor', 'Site-level access for staff', 'Two-factor authentication and a full audit trail'] },
    ],
  },
  {
    key: 'ai',
    label: 'AI & automation',
    badge: 'AI',
    items: [
      { slug: 'smart-assistant', title: 'Smart assistant', icon: Bot,
        summary: 'Describe a fault, an inspection or a follow-up in plain language and get a suggested response and an action plan.',
        points: ['A suggested response and a list of recommended actions', 'Works for faults, inspections and follow-ups', 'The AI runs on the server, so no keys ever reach the browser', 'Built-in guidance, clearly labelled, when AI isn’t available'],
        steps: ['Open Smart assistant from the menu.', 'Describe the situation in your own words.', 'Click Generate recommendation and follow the suggested actions.'] },
      { slug: 'sentiment', title: 'Sentiment scoring', icon: Sparkles,
        summary: 'Incoming inbox messages are scored by AI, so unhappy customers stand out and get a fast response.',
        points: ['Inbound inbox messages scored automatically', 'A “Low sentiment” workflow trigger to alert a manager or escalate', 'Off until an administrator switches it on'],
        steps: ['Go to Settings → General and tick Score inbox messages’ sentiment with AI.', 'In Workflows, create a workflow with the Low sentiment trigger.', 'Choose who is notified or what happens next, and save.'] },
      { slug: 'bilingual', title: 'English & Vietnamese', icon: Languages, helpId: 'language',
        summary: 'The whole platform in English and Vietnamese, including requests written in either language.',
        points: ['Switch language per person', 'Catalogues and locations named in both languages', 'Notifications in each person’s language'] },
      { slug: 'automation', title: 'Scheduled automation', icon: Zap, helpId: 'workflows',
        summary: 'Background jobs that keep things moving: PM generation, escalations, reminders and alerts.',
        points: ['Overdue work escalated automatically', 'Contract and licence reminders', 'Health checks that alert if anything stops'] },
    ],
  },
];

export const ALL_FEATURES: FeatureItem[] = FEATURE_GROUPS.flatMap((g) => g.items);

// ---------------------------------------------------------------------------
// Solutions
// ---------------------------------------------------------------------------
export interface Solution {
  slug: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  challenges: string[];
  features: string[]; // feature slugs
}

export interface SolutionColumn {
  key: string;
  label: string;
  color: string;
  items: Solution[];
}

export const SOLUTION_COLUMNS: SolutionColumn[] = [
  {
    key: 'facilities',
    label: 'Facilities management',
    color: '#E8552D',
    items: [
      { slug: 'commercial', title: 'Commercial buildings', icon: Building2,
        summary: 'Keep offices and mixed-use towers running, with tenants who can see their requests move.',
        challenges: ['Hundreds of requests from many tenants', 'Contractors across trades', 'Proving SLA performance to owners'],
        features: ['fault-reporting', 'tenant-portal', 'work-orders', 'preventive-maintenance', 'vendors', 'reports'] },
      { slug: 'residential', title: 'Residential', icon: Building,
        summary: 'Apartments and condominiums: residents report faults by QR code or Zalo, and management keeps up.',
        challenges: ['Residents who expect quick answers', 'Common areas and shared equipment', 'Announcements about works and outages'],
        features: ['qr-code-fault-reporting', 'tenant-portal', 'broadcasts', 'inbox', 'facility-booking', 'surveys'] },
      { slug: 'education', title: 'Education', icon: GraduationCap,
        summary: 'Campuses with many buildings, rooms and assets — maintained between timetables.',
        challenges: ['Large, spread-out estates', 'Safety inspections and compliance', 'Rooms and halls to book'],
        features: ['locations', 'checklists', 'preventive-maintenance', 'facility-booking', 'asset-management', 'reports'] },
      { slug: 'industrial', title: 'Industrial & manufacturing', icon: Factory,
        summary: 'Less unplanned downtime with meter-based maintenance, sensors and permit-controlled work.',
        challenges: ['Critical equipment that can’t stop', 'Hazardous work', 'Spare parts on hand'],
        features: ['preventive-maintenance', 'meters', 'iot', 'permit-to-work', 'parts-inventory', 'cost-tracking'] },
      { slug: 'government', title: 'Government', icon: Landmark,
        summary: 'Public buildings maintained transparently, with approvals and a full audit trail.',
        challenges: ['Accountability for spending', 'Many sites and departments', 'Public fault reporting'],
        features: ['approvals', 'procurement', 'security', 'fault-reporting', 'reports', 'budgets'] },
      { slug: 'hotels', title: 'Hotels & hospitality', icon: Hotel,
        summary: 'Rooms back in service fast, and guests never see the maintenance.',
        challenges: ['Room faults that block bookings', 'Round-the-clock shifts', 'Guest satisfaction'],
        features: ['work-orders', 'technician-app', 'tv-displays', 'preventive-maintenance', 'surveys', 'attendance'] },
      { slug: 'retail', title: 'Retail', icon: ShoppingBag,
        summary: 'Stores and malls with lights on, air-conditioning cold and contractors accountable.',
        challenges: ['Many stores, few technicians', 'Contractor-heavy maintenance', 'Trading hours'],
        features: ['vendors', 'vendor-invoices', 'work-orders', 'qr-code-fault-reporting', 'cost-tracking', 'reports'] },
    ],
  },
  {
    key: 'field',
    label: 'Field services',
    color: '#2563EB',
    items: [
      { slug: 'cleaning', title: 'Cleaning services', icon: SprayCan,
        summary: 'Cleaning rounds with checklists, photo proof and attendance on every site.',
        challenges: ['Proving the work was done', 'Staff across many client sites'],
        features: ['checklists', 'photo-evidence', 'attendance', 'surveys', 'technician-app'] },
      { slug: 'mechanical-electrical', title: 'Mechanical & electrical', icon: Wrench,
        summary: 'M&E contractors running PM contracts for many clients from one system.',
        challenges: ['Contract PM schedules for many clients', 'Parts and labour costing'],
        features: ['preventive-maintenance', 'work-orders', 'parts-inventory', 'cost-tracking', 'contracts-licenses'] },
      { slug: 'hvac', title: 'HVAC & refrigeration', icon: Activity,
        summary: 'Chillers, AHUs and cold rooms serviced on time — and watched by sensors between visits.',
        challenges: ['Temperature-critical equipment', 'Seasonal peaks'],
        features: ['iot', 'meters', 'preventive-maintenance', 'checklists', 'workflows'] },
      { slug: 'fire-safety', title: 'Fire & life safety', icon: Flame,
        summary: 'Inspections, tests and certificates that are never missed.',
        challenges: ['Statutory inspection intervals', 'Certificates and records for audits'],
        features: ['checklists', 'preventive-maintenance', 'documents', 'contracts-licenses', 'reports'] },
      { slug: 'lifts', title: 'Lifts & escalators', icon: Hammer,
        summary: 'Breakdowns reported instantly and service visits tracked against the contract.',
        challenges: ['Passenger entrapments need immediate response', 'Contractual response times'],
        features: ['work-orders', 'qr-code-fault-reporting', 'vendors', 'tv-displays', 'reports'] },
    ],
  },
  {
    key: 'industries',
    label: 'Industry sectors',
    color: '#16A34A',
    items: [
      { slug: 'healthcare', title: 'Hospitals & healthcare', icon: Hospital,
        summary: 'Medical and building equipment maintained to standard, with records ready for inspection.',
        challenges: ['Equipment that patients depend on', 'Infection-control and compliance records'],
        features: ['asset-management', 'preventive-maintenance', 'checklists', 'documents', 'permit-to-work', 'reports'] },
      { slug: 'property-management', title: 'Property management', icon: Briefcase,
        summary: 'A portfolio of buildings, owners and tenants — one place for every request and cost.',
        challenges: ['Reporting to many owners', 'Tenant communication'],
        features: ['locations', 'tenant-portal', 'budgets', 'reports', 'broadcasts', 'vendors'] },
      { slug: 'facility-management', title: 'Facility management companies', icon: Users,
        summary: 'FM providers running many client sites, each with its own data, SLAs and reports.',
        challenges: ['Separate data per client', 'SLA reporting per contract'],
        features: ['security', 'work-orders', 'reports', 'attendance', 'contracts-licenses', 'tv-displays'] },
      { slug: 'oil-gas', title: 'Oil & gas', icon: Warehouse,
        summary: 'Permit-controlled work, sensor monitoring and audit trails for remote and hazardous sites.',
        challenges: ['Hazardous work control', 'Remote assets'],
        features: ['permit-to-work', 'iot', 'checklists', 'asset-management', 'security'] },
      { slug: 'religious', title: 'Religious buildings', icon: Church,
        summary: 'Churches, temples and mosques cared for by small teams and volunteers.',
        challenges: ['Small teams, many volunteers', 'Halls and rooms to book'],
        features: ['fault-reporting', 'facility-booking', 'preventive-maintenance', 'broadcasts'] },
      { slug: 'fleet', title: 'Fleet management', icon: Truck,
        summary: 'Vehicles serviced by kilometre or hours, with every repair and cost on record.',
        challenges: ['Service intervals by distance', 'Repair costs per vehicle'],
        features: ['meters', 'preventive-maintenance', 'asset-management', 'cost-tracking', 'parts-inventory'] },
    ],
  },
];

export const ALL_SOLUTIONS: Solution[] = SOLUTION_COLUMNS.flatMap((c) => c.items);

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------
export interface Resource {
  slug: string;
  title: string;
  icon: LucideIcon;
  /** Somewhere else instead of a resource page. */
  href?: string;
  summary?: string;
  sections?: { heading: string; body: string[] }[];
  /** A page with its own layout instead of sections. */
  view?: 'integrations';
}

// ---------------------------------------------------------------------------
// Integrations directory (/resources/integrations)
// ---------------------------------------------------------------------------
export interface Integration {
  name: string;
  category: string;
  icon: LucideIcon;
  summary: string;
  /** Live: switch it on yourself. On request: our team connects it for you. */
  status: 'Live' | 'On request';
}

export const INTEGRATION_CATEGORIES = ['Messaging', 'Notifications', 'Sensors & IoT', 'Payments'] as const;

export const INTEGRATIONS: Integration[] = [
  { name: 'Zalo Official Account', category: 'Messaging', icon: MessageSquareHeart, status: 'On request',
    summary: 'Tenants message your Zalo OA; conversations land in the FacilityPro inbox and become requests in one click.' },
  { name: 'WhatsApp', category: 'Messaging', icon: MessageSquareHeart, status: 'On request',
    summary: 'Reply to tenants on WhatsApp from the shared inbox and turn their messages into work.' },
  { name: 'Web push', category: 'Notifications', icon: BellRing, status: 'Live',
    summary: 'Instant alerts on phones and computers for new jobs, approvals and status changes.' },
  { name: 'SMS', category: 'Notifications', icon: Smartphone, status: 'On request',
    summary: 'Text-message alerts for people who aren’t at a screen, chosen per person.' },
  { name: 'Email notifications', category: 'Notifications', icon: Inbox, status: 'Live',
    summary: 'Assignment, approval and reminder emails, sent in each person’s language.' },
  { name: 'MQTT', category: 'Sensors & IoT', icon: Cpu, status: 'Live',
    summary: 'Sensors and controllers publish readings over MQTT with a per-device key.' },
  { name: 'HTTP ingest API', category: 'Sensors & IoT', icon: Network, status: 'Live',
    summary: 'Post readings from any system that can make a web request.' },
  { name: 'The Things Network', category: 'Sensors & IoT', icon: Network, status: 'Live',
    summary: 'LoRaWAN devices on TTN forward their uplinks straight into FacilityPro.' },
  { name: 'ChirpStack', category: 'Sensors & IoT', icon: Network, status: 'Live',
    summary: 'Private LoRaWAN networks on ChirpStack connect the same way.' },
  { name: 'Modbus (edge gateway)', category: 'Sensors & IoT', icon: Cpu, status: 'Live',
    summary: 'Meters and plant controllers on Modbus connect through the FacilityPro edge gateway.' },
  { name: 'Card payments (Stripe)', category: 'Payments', icon: CreditCard, status: 'Live',
    summary: 'Pay for your FacilityPro plan by card.' },
  { name: 'PayPal', category: 'Payments', icon: Wallet, status: 'Live',
    summary: 'Pay for your FacilityPro plan with PayPal.' },
];

export const RESOURCES: Resource[][] = [
  [
    { slug: 'blog', title: 'Blog', icon: Newspaper, href: '/blog' },
    { slug: 'getting-started', title: 'Getting started guide', icon: Rocket,
      summary: 'From sign-up to your first work order in an afternoon.',
      sections: [
        { heading: '1. Create your organisation', body: ['Sign up with your work email, confirm it with the 6-digit code, then name your organisation, choose your industry and add your logo.'] },
        { heading: '2. Add your sites and locations', body: ['Under Locations, add each site, then its buildings, floors and rooms. Names can be in English and Vietnamese.'] },
        { heading: '3. Invite your team', body: ['Settings → Team & roles: invite by email, or create a join link / QR code per role (manager, technician, occupant, vendor) and share it.'] },
        { heading: '4. Register assets and print QR codes', body: ['Add your key equipment under Assets, then print QR labels so anyone can report a fault by scanning.'] },
        { heading: '5. Set up preventive maintenance', body: ['Under Maintenance, create schedules by calendar or meter. Work orders are generated automatically before they’re due.'] },
        { heading: '6. Automate', body: ['Use Workflows to assign, notify and escalate automatically, and put a TV display board up in the maintenance office.'] },
      ] },
    { slug: 'implementation-guide', title: 'Rollout playbook', icon: ClipboardList,
      summary: 'A step-by-step plan for moving your team onto FacilityPro, one site at a time, without disrupting day-to-day work.',
      sections: [
        { heading: 'Step 1: Decide what success looks like', body: [
          'Write down the two or three things you want to change: faster response to faults, fewer missed inspections, clearer costs per site. These become the numbers you check in Reports later.',
          'Name one owner for the rollout, usually the facilities manager, and one champion on each site who will answer their colleagues’ questions.',
        ] },
        { heading: 'Step 2: Pick a pilot site', body: [
          'Choose a site with an engaged team and a manageable number of assets. A good pilot is busy enough to prove the value, but small enough to fix problems quickly.',
        ] },
        { heading: 'Step 3: Load the essentials, not everything', body: [
          'Add the site’s buildings, floors and rooms under Locations, then its critical equipment under Assets. Start with what breaks most or costs most; the rest can follow.',
          'Load the default fault and asset types under Settings → Catalogs and adjust them to your language. Set response times per priority under Settings → SLA.',
        ] },
        { heading: 'Step 4: Bring people in by role', body: [
          'Invite managers and technicians by email, or print a join-link QR code for each role. Occupants and vendors join the same way and only ever see what their role allows.',
          'Ask everyone to take the one-minute tour, and point each role to its quick-start in the Help Center.',
        ] },
        { heading: 'Step 5: Switch on one front door for faults', body: [
          'Put QR labels on assets and rooms, share the public report link, and connect Zalo or WhatsApp if your tenants use them. Then retire the old phone numbers and chat groups, so every request lands in one list.',
        ] },
        { heading: 'Step 6: Automate the routine', body: [
          'Create preventive maintenance schedules for your critical assets, attach checklists to them, and add workflows that assign, remind and escalate for you. Put a TV display board in the maintenance office so everyone sees the queue.',
        ] },
        { heading: 'Step 7: Review after 30 days, then expand', body: [
          'Open Reports and compare response times, overdue work and costs with the goals from step 1. Fix what slowed people down, then repeat steps 3 to 6 on the next site.',
        ] },
        { heading: 'Go-live checklist', body: [
          '☐ Goals and rollout owner agreed · ☐ Pilot site locations and critical assets loaded · ☐ Fault types and SLA targets set · ☐ Team invited by role · ☐ QR labels printed and placed · ☐ Old reporting channels retired · ☐ First PM schedules running · ☐ 30-day review booked',
        ] },
      ] },
    { slug: 'pricing', title: 'Pricing', icon: CreditCard, href: '/#pricing' },
  ],
  [
    { slug: 'security', title: 'Security & privacy', icon: ShieldCheck,
      summary: 'How FacilityPro protects your organisation’s data.',
      sections: [
        { heading: 'Data isolation', body: ['Every organisation’s records are separated at the database level with row-level security: one customer can never read another’s data.'] },
        { heading: 'Roles and sites', body: ['Admins, managers, technicians, occupants and vendors each see only what their role needs; staff can be limited to their sites. Occupants only ever see their own requests.'] },
        { heading: 'Accounts', body: ['Email verification, two-factor authentication with an authenticator app, and sign-in protection against automated attacks.'] },
        { heading: 'Audit trail', body: ['Changes to work orders and settings are recorded with who and when.'] },
        { heading: 'Hosting', body: ['Hosted on Supabase (PostgreSQL) with encrypted connections.'] },
      ] },
    { slug: 'iot-api', title: 'IoT & API documentation', icon: Network,
      summary: 'Connect sensors, gateways and meters to FacilityPro.',
      sections: [
        { heading: 'Ways to connect', body: ['Devices send readings over MQTT or HTTP with a per-device key; LoRaWAN devices come in through The Things Network or ChirpStack; Modbus equipment connects through the FacilityPro edge gateway.'] },
        { heading: 'What happens to readings', body: ['Readings are normalised into data points (temperature, energy, vibration, …), shown live and as history, and checked against alert rules.'] },
        { heading: 'Alerts and work', body: ['An alert can open a work order automatically and escalates if nobody acknowledges it. Devices that stop reporting are flagged as offline.'] },
        { heading: 'Commands', body: ['Supported devices can receive commands (for example on/off) from FacilityPro through the gateway.'] },
      ] },
    { slug: 'mobile-offline', title: 'Mobile & offline use', icon: Smartphone,
      summary: 'FacilityPro on phones and tablets, including where there’s no signal.',
      sections: [
        { heading: 'Install from the browser', body: ['Open FacilityPro on your phone and choose “Add to Home Screen”. No app store needed, and it’s always up to date.'] },
        { heading: 'Works offline', body: ['Updates made without a signal — status changes, notes, checklist answers — are kept on the device and sent automatically when you’re back online.'] },
        { heading: 'Notifications', body: ['Web push, email, SMS and Zalo, chosen by each person.'] },
      ] },
  ],
  [
    { slug: 'tv-display-guide', title: 'TV display boards', icon: MonitorPlay, href: '/features/tv-displays' },
    { slug: 'integrations', title: 'Integrations', icon: Plug, view: 'integrations',
      summary: 'Everything FacilityPro connects to today: messaging, notifications, sensors and payments.' },
    { slug: 'help', title: 'Help & support', icon: LifeBuoy,
      summary: 'Where to find answers inside FacilityPro, and how to reach our team.',
      sections: [
        { heading: 'Help on every page', body: ['Click ? Help in the top bar for an explanation of the page you’re on: what it does, what you can do there and what the fields mean.'] },
        { heading: 'User guide and feature directory', body: ['The Help Center (menu → User guide) has a step-by-step guide, quick-starts for each role and a searchable directory of every feature.'] },
        { heading: 'Guided tour', body: ['New users get a one-minute tour of the screen on their first visit. Restart it any time from ? Help → Take the tour.'] },
        { heading: 'Support tickets', body: ['Signed-in staff can open a ticket under Menu → Help & support: choose the type and urgency, describe the problem and follow the replies in the same place.'] },
        { heading: 'Talk to us', body: ['Not a customer yet? Book a demo and we’ll show you around and answer your questions.'] },
      ] },
    { slug: 'demo', title: 'Book a demo', icon: KeyRound, href: '/#demo' },
  ],
];

export const ALL_RESOURCES: Resource[] = RESOURCES.flat();

export function findFeature(slug: string | undefined) {
  return ALL_FEATURES.find((f) => f.slug === slug);
}
export function findSolution(slug: string | undefined) {
  return ALL_SOLUTIONS.find((s) => s.slug === slug);
}
export function findResource(slug: string | undefined) {
  return ALL_RESOURCES.find((r) => r.slug === slug && !r.href);
}
export function featureGroupOf(slug: string) {
  return FEATURE_GROUPS.find((g) => g.items.some((i) => i.slug === slug));
}

/** Where a resource menu item goes. */
export function resourceHref(r: Resource) {
  return r.href ?? `/resources/${r.slug}`;
}
