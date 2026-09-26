import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStatus, useStaffRole } from './lib/platform';
import { MaintenanceScreen, MaintenanceStaffStrip } from './components/PlatformNotices';
import { useAuth } from './contexts/AuthContext';
import { useOrg } from './contexts/OrgContext';
import AppShell from './components/AppShell';
import RequireRole from './components/RequireRole';
import NotFound from './components/NotFound';
import { rememberInvite, safeNext } from './lib/redirect';

// Every page is its own chunk, fetched on first visit rather than bundled
// into the initial load — the whole app (Financial, Devices, Workflows and
// everything else) was shipping as one ~900KB entry chunk regardless of
// which page a role ever opens.
const SignIn = lazy(() => import('./pages/SignIn'));
const DisplayBoard = lazy(() => import('./pages/DisplayBoard'));
const MarketingPage = lazy(() => import('./pages/MarketingPage'));
const SignUp = lazy(() => import('./pages/SignUp'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));
const AssetScan = lazy(() => import('./pages/AssetScan'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TenantHome = lazy(() => import('./pages/TenantHome'));
const JoinOrg = lazy(() => import('./pages/JoinOrg'));
const OrgClosed = lazy(() => import('./pages/OrgClosed'));
// Platform admin panel: its own bundle, downloaded only by staff who open /admin.
const AdminApp = lazy(() => import('./admin/AdminApp'));
const Locations = lazy(() => import('./pages/Locations'));
const Assets = lazy(() => import('./pages/Assets'));
const AssetDetail = lazy(() => import('./pages/AssetDetail'));
const Requests = lazy(() => import('./pages/Requests'));
const NewRequest = lazy(() => import('./pages/NewRequest'));
const RequestDetail = lazy(() => import('./pages/RequestDetail'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const WorkOrderDetail = lazy(() => import('./pages/WorkOrderDetail'));
const MyWork = lazy(() => import('./pages/MyWork'));
const Settings = lazy(() => import('./pages/Settings'));
const Checklists = lazy(() => import('./pages/Checklists'));
const ChecklistTemplate = lazy(() => import('./pages/ChecklistTemplate'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Parts = lazy(() => import('./pages/Parts'));
const Vendors = lazy(() => import('./pages/Vendors'));
const Reports = lazy(() => import('./pages/Reports'));
const Approvals = lazy(() => import('./pages/Approvals'));
const Security = lazy(() => import('./pages/Security'));
const JobSheet = lazy(() => import('./pages/JobSheet'));
const Inbox = lazy(() => import('./pages/Inbox'));
const Billing = lazy(() => import('./pages/Billing'));
const Support = lazy(() => import('./pages/Support'));
const SupportTicket = lazy(() => import('./pages/SupportTicket'));
const Devices = lazy(() => import('./pages/Devices'));
const DeviceDetail = lazy(() => import('./pages/DeviceDetail'));
const PublicReport = lazy(() => import('./pages/PublicReport'));
const Landing = lazy(() => import('./pages/Landing'));
const Documents = lazy(() => import('./pages/Documents'));
const Permits = lazy(() => import('./pages/Permits'));
const Attendance = lazy(() => import('./pages/Attendance'));
const SmartAssistant = lazy(() => import('./pages/SmartAssistant'));
const TenantExperience = lazy(() => import('./pages/TenantExperience'));
const Financial = lazy(() => import('./pages/Financial'));
const Workflows = lazy(() => import('./pages/Workflows'));
const Surveys = lazy(() => import('./pages/Surveys'));
const Desks = lazy(() => import('./pages/Desks'));
const Facilities = lazy(() => import('./pages/Facilities'));

function FullPageLoader() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen place-items-center text-ink-muted">{t('loading')}</div>
  );
}

function OrgLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-sm text-center">
        <p className="text-sm text-ink">{t('errors.generic')}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          {t('actions.retry')}
        </button>
      </div>
    </div>
  );
}

// Sign-in / sign-up pages opened while signed in: go where the link was
// heading (?next=, e.g. /admin from a staff invite), else the dashboard.
function SignedInRedirect() {
  const location = useLocation();
  return <Navigate to={safeNext(new URLSearchParams(location.search).get('next')) ?? '/'} replace />;
}

// An invite opened while signed out: remember the token (it must survive
// sign-up and email confirmation), then sign in or sign up.
function InviteSignedOut({ next }: { next: string }) {
  const location = useLocation();
  rememberInvite(new URLSearchParams(location.search).get('token'));
  return <Navigate to={`/signin?next=${next}`} replace />;
}

export default function App() {
  const { session, loading: authLoading } = useAuth();
  const { memberships, role, closedOrgs, loading: orgLoading, error: orgError, refresh: refreshOrgs } = useOrg();
  const location = useLocation();
  // Maintenance mode (admin panel, 0088): everyone but platform staff sees
  // the maintenance page; staff can still sign in and work.
  const appStatus = useAppStatus().data;
  const maintenance = !!appStatus?.maintenance_mode;
  const staffRole = useStaffRole(!!session && maintenance);

  // TV display boards (0092): the link is the key; no sign-in, organisation
  // or maintenance screen, so a wall screen keeps working on its own.
  // Public site pages behind the header menus: the same for everyone.
  if (/^\/(features|solutions|resources)\//.test(location.pathname)) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/features/:slug" element={<MarketingPage kind="feature" />} />
          <Route path="/solutions/:slug" element={<MarketingPage kind="solution" />} />
          <Route path="/resources/:slug" element={<MarketingPage kind="resource" />} />
        </Routes>
      </Suspense>
    );
  }

  if (location.pathname.startsWith('/display/')) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/display/:token" element={<DisplayBoard />} />
        </Routes>
      </Suspense>
    );
  }

  if (authLoading) return <FullPageLoader />;

  if (maintenance && appStatus) {
    const signInPages = ['/signin', '/forgot-password', '/reset-password'];
    if (!session && !signInPages.includes(location.pathname)) return <MaintenanceScreen status={appStatus} />;
    if (session && staffRole.isLoading) return <FullPageLoader />;
    if (session && !staffRole.data) return <MaintenanceScreen status={appStatus} />;
  }

  if (!session) {
    // A confirmation or reset link that has expired (or was already used)
    // comes back as #error=…&error_code=otp_expired: say so on the sign-in
    // page instead of leaving the visitor on the home page.
    if (/(^|[#&?])error_code=|(^|[#&?])error=access_denied/.test(location.hash + location.search) && location.pathname !== '/signin') {
      return <Navigate to="/signin?link=expired" replace />;
    }
    const next = encodeURIComponent(location.pathname + location.search);
    return (
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/report" element={<PublicReport />} />
          <Route path="/a/:code" element={<AssetScan />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/invite" element={<InviteSignedOut next={next} />} />
          <Route path="/join/:token" element={<JoinOrg />} />
          <Route path="/admin/*" element={<Navigate to={`/signin?next=${next}`} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (orgLoading) return <FullPageLoader />;

  // Don't treat a failed load as "no organisation": that would send an existing
  // member to onboarding, where they could create a duplicate org.
  if (orgError) return <OrgLoadError onRetry={() => void refreshOrgs()} />;

  const hasOrg = memberships.length > 0;

  return (
    <Suspense fallback={<FullPageLoader />}>
      {maintenance && <MaintenanceStaffStrip />}
      <Routes>
        <Route path="/invite" element={<AcceptInvite />} />
        <Route path="/join/:token" element={<JoinOrg />} />
        {/* Platform staff may have no organisation of their own. */}
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/report" element={<PublicReport />} />
        <Route path="/a/:code" element={<AssetScan />} />
        {/* The reset email's link signs the user in; they set the password here. */}
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Already signed in: the sign-in/sign-up pages go to the app. */}
        <Route path="/signin" element={<SignedInRedirect />} />
        <Route path="/signup" element={<SignedInRedirect />} />
        <Route path="/forgot-password" element={<Navigate to="/" replace />} />
        {/* Finishing onboarding leaves the address at /onboarding while the
            new organisation loads: send it to the dashboard, not "Not found". */}
        {hasOrg && <Route path="/onboarding" element={<Navigate to="/" replace />} />}
        {!hasOrg && closedOrgs.length > 0 ? (
          // Every organisation this user belongs to is suspended or deleted:
          // explain, rather than offering to create a new one.
          <Route path="*" element={<OrgClosed orgs={closedOrgs} />} />
        ) : !hasOrg ? (
          <>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          </>
        ) : role === 'occupant' ? (
          // Tenants: report a fault and follow their own requests (0081 closes
          // the staff data to them; these are the only pages they need).
          <Route element={<AppShell />}>
            <Route path="/" element={<TenantHome />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/requests/new" element={<NewRequest />} />
            <Route path="/requests/:id" element={<RequestDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        ) : (
          <>
            <Route path="/work-orders/:id/print" element={<JobSheet />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/my-work" element={<MyWork />} />
              <Route path="/requests" element={<Requests />} />
              <Route path="/requests/new" element={<NewRequest />} />
              <Route path="/requests/:id" element={<RequestDetail />} />
              <Route path="/work-orders" element={<WorkOrders />} />
              <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
              <Route element={<RequireRole allow={['org_admin', 'manager', 'technician']} />}>
                <Route path="/inbox" element={<Inbox />} />
              </Route>
              <Route path="/assets" element={<Assets />} />
              <Route path="/assets/:id" element={<AssetDetail />} />
              <Route path="/maintenance" element={<Maintenance />} />
              <Route path="/checklists" element={<Checklists />} />
              <Route path="/desks" element={<Desks />} />
              <Route path="/facilities" element={<Facilities />} />
              <Route path="/checklists/:id" element={<ChecklistTemplate />} />
              <Route path="/parts" element={<Parts />} />
              <Route path="/vendors" element={<Vendors />} />
              <Route path="/locations" element={<Locations />} />
              <Route path="/security" element={<Security />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/permits" element={<Permits />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/smart-assistant" element={<SmartAssistant />} />
              <Route path="/tenant-experience" element={<TenantExperience />} />
              <Route path="/support" element={<Support />} />
              <Route path="/support/:id" element={<SupportTicket />} />
              {/* Admin/manager pages: their data and writes are limited to these
                  roles by RLS, so other roles would only see controls that fail. */}
              {/* Devices: technicians see live data, alerts and history (0077);
                  configuration and keys stay admin/manager-only in the page. */}
              <Route element={<RequireRole allow={['org_admin', 'manager', 'technician']} />}>
                <Route path="/devices" element={<Devices />} />
                <Route path="/devices/:id" element={<DeviceDetail />} />
              </Route>
              <Route element={<RequireRole allow={['org_admin', 'manager']} />}>
                <Route path="/approvals" element={<Approvals />} />
                <Route path="/workflows" element={<Workflows />} />
                <Route path="/surveys" element={<Surveys />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/financial" element={<Financial />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </>
        )}
      </Routes>
    </Suspense>
  );
}
