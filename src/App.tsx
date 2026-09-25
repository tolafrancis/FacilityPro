import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import { useOrg } from './contexts/OrgContext';
import AppShell from './components/AppShell';
import RequireRole from './components/RequireRole';
import NotFound from './components/NotFound';
import { rememberInvite } from './lib/redirect';

// Every page is its own chunk, fetched on first visit rather than bundled
// into the initial load — the whole app (Financial, Devices, Workflows and
// everything else) was shipping as one ~900KB entry chunk regardless of
// which page a role ever opens.
const SignIn = lazy(() => import('./pages/SignIn'));
const SignUp = lazy(() => import('./pages/SignUp'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));
const AssetScan = lazy(() => import('./pages/AssetScan'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
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

// An invite opened while signed out: remember the token (it must survive
// sign-up and email confirmation), then sign in or sign up.
function InviteSignedOut({ next }: { next: string }) {
  const location = useLocation();
  rememberInvite(new URLSearchParams(location.search).get('token'));
  return <Navigate to={`/signin?next=${next}`} replace />;
}

export default function App() {
  const { session, loading: authLoading } = useAuth();
  const { memberships, loading: orgLoading, error: orgError, refresh: refreshOrgs } = useOrg();
  const location = useLocation();

  if (authLoading) return <FullPageLoader />;

  if (!session) {
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
      <Routes>
        <Route path="/invite" element={<AcceptInvite />} />
        <Route path="/report" element={<PublicReport />} />
        <Route path="/a/:code" element={<AssetScan />} />
        {/* The reset email's link signs the user in; they set the password here. */}
        <Route path="/reset-password" element={<ResetPassword />} />
        {!hasOrg ? (
          <>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          </>
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
