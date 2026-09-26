import type { Role } from '../lib/database.types';
import gettingStarted from './content/getting-started.md?raw';
import dashboard from './content/dashboard.md?raw';
import facilities from './content/facilities.md?raw';
import assets from './content/assets.md?raw';
import preventiveMaintenance from './content/preventive-maintenance.md?raw';
import workOrders from './content/work-orders.md?raw';
import techniciansTeams from './content/technicians-teams.md?raw';
import vendors from './content/vendors.md?raw';
import inventory from './content/inventory.md?raw';
import iot from './content/iot.md?raw';
import notifications from './content/notifications.md?raw';
import reports from './content/reports.md?raw';
import userManagement from './content/user-management.md?raw';
import settings from './content/settings.md?raw';
import qsOrgAdmin from './content/qs-org_admin.md?raw';
import qsManager from './content/qs-manager.md?raw';
import qsTechnician from './content/qs-technician.md?raw';
import qsOccupant from './content/qs-occupant.md?raw';
import qsVendor from './content/qs-vendor.md?raw';
import knownIssues from './content/known-issues.md?raw';

// The User guide: one Markdown article per section (src/help/content). The
// screenshots in public/help/screens are captured from the running app with
// the demo organisation (see docs/USER_GUIDE.md).

export interface GuideSection {
  id: string;
  title: string;
  summary: string;
  body: string;
}

export const GUIDE: GuideSection[] = [
  { id: 'getting-started', title: 'Getting started', summary: 'Sign in, set up your organisation and find your way around.', body: gettingStarted },
  { id: 'dashboard', title: 'Dashboard', summary: 'Key numbers, charts, recent activity and the Create menu.', body: dashboard },
  { id: 'facilities', title: 'Facilities & locations', summary: 'Sites, buildings, floors, rooms and zones; desk and room booking.', body: facilities },
  { id: 'assets', title: 'Asset management', summary: 'The asset register, specifications, meters, documents and QR codes.', body: assets },
  { id: 'preventive-maintenance', title: 'Preventive maintenance', summary: 'Recurring schedules, meter-based plans, parts kits and checklists.', body: preventiveMaintenance },
  { id: 'work-orders', title: 'Work orders', summary: 'From a reported fault to a closed job: the full lifecycle.', body: workOrders },
  { id: 'technicians-teams', title: 'Technicians & teams', summary: 'My work, profiles, routing jobs to teams, site access and attendance.', body: techniciansTeams },
  { id: 'vendors', title: 'Vendors & contracts', summary: 'Contractors, contracts, licences, permits to work and documents.', body: vendors },
  { id: 'inventory', title: 'Inventory & purchasing', summary: 'Spare parts, stock levels, restocking and purchase orders.', body: inventory },
  { id: 'iot', title: 'IoT & sensors', summary: 'Devices, live readings, history, alerts and threshold rules.', body: iot },
  { id: 'notifications', title: 'Notifications & communication', summary: 'The bell, email/SMS/push, the Inbox, announcements and surveys.', body: notifications },
  { id: 'reports', title: 'Reports & financials', summary: 'Metrics, cost and spend, CSV exports and the activity log.', body: reports },
  { id: 'user-management', title: 'User management', summary: 'Roles, inviting people, join links, site access and 2FA.', body: userManagement },
  { id: 'settings', title: 'Settings & automation', summary: 'General, catalogs, SLA, TV displays, integrations, workflows and billing.', body: settings },
];

export interface QuickStart {
  role: Role;
  title: string;
  summary: string;
  body: string;
}

/** Only for roles that exist in FacilityPro (fp_users_orgs.role). */
export const QUICK_STARTS: QuickStart[] = [
  { role: 'org_admin', title: 'Administrator', summary: 'Set up your organisation in your first hour.', body: qsOrgAdmin },
  { role: 'manager', title: 'Manager', summary: 'Your daily and weekly routine.', body: qsManager },
  { role: 'technician', title: 'Technician', summary: 'From “assigned” to “resolved”, step by step.', body: qsTechnician },
  { role: 'occupant', title: 'Occupant (tenant)', summary: 'Report a fault and follow it.', body: qsOccupant },
  { role: 'vendor', title: 'Vendor (contractor)', summary: 'See and document the jobs you work on.', body: qsVendor },
];

export const KNOWN_ISSUES = knownIssues;

export function guideSection(id: string | undefined): GuideSection | undefined {
  return GUIDE.find((s) => s.id === id);
}
