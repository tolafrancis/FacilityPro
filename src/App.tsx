import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import { useOrg } from './contexts/OrgContext';
import AppShell from './components/AppShell';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Onboarding from './pages/Onboarding';
import AcceptInvite from './pages/AcceptInvite';
import Dashboard from './pages/Dashboard';
import Locations from './pages/Locations';
import Assets from './pages/Assets';
import AssetDetail from './pages/AssetDetail';
import Requests from './pages/Requests';
import NewRequest from './pages/NewRequest';
import RequestDetail from './pages/RequestDetail';
import WorkOrders from './pages/WorkOrders';
import WorkOrderDetail from './pages/WorkOrderDetail';
import MyWork from './pages/MyWork';
import Settings from './pages/Settings';
import Checklists from './pages/Checklists';
import ChecklistTemplate from './pages/ChecklistTemplate';
import Maintenance from './pages/Maintenance';
import Parts from './pages/Parts';
import Vendors from './pages/Vendors';
import Reports from './pages/Reports';
import Approvals from './pages/Approvals';
import Security from './pages/Security';
import JobSheet from './pages/JobSheet';
import Inbox from './pages/Inbox';
import Billing from './pages/Billing';
import Devices from './pages/Devices';
import DeviceDetail from './pages/DeviceDetail';
import PublicReport from './pages/PublicReport';
import Landing from './pages/Landing';
import Documents from './pages/Documents';
import Permits from './pages/Permits';
import Attendance from './pages/Attendance';
import SmartAssistant from './pages/SmartAssistant';
import TenantExperience from './pages/TenantExperience';
import Financial from './pages/Financial';
import Workflows from './pages/Workflows';
import Surveys from './pages/Surveys';
import Desks from './pages/Desks';
import Facilities from './pages/Facilities';

function FullPageLoader() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen place-items-center text-ink-muted">{t('loading')}</div>
  );
}

export default function App() {
  const { session, loading: authLoading } = useAuth();
  const { memberships, loading: orgLoading } = useOrg();
  const location = useLocation();

  if (authLoading) return <FullPageLoader />;

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/report" element={<PublicReport />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/invite" element={<Navigate to={`/signin?next=${next}`} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (orgLoading) return <FullPageLoader />;

  const hasOrg = memberships.length > 0;

  return (
    <Routes>
      <Route path="/invite" element={<AcceptInvite />} />
      <Route path="/report" element={<PublicReport />} />
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
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/assets/:id" element={<AssetDetail />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/checklists" element={<Checklists />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/surveys" element={<Surveys />} />
            <Route path="/desks" element={<Desks />} />
            <Route path="/facilities" element={<Facilities />} />
            <Route path="/checklists/:id" element={<ChecklistTemplate />} />
            <Route path="/parts" element={<Parts />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/devices/:id" element={<DeviceDetail />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/locations" element={<Locations />} />
            <Route path="/security" element={<Security />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/permits" element={<Permits />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/smart-assistant" element={<SmartAssistant />} />
            <Route path="/tenant-experience" element={<TenantExperience />} />
            <Route path="/financial" element={<Financial />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </>
      )}
    </Routes>
  );
}
