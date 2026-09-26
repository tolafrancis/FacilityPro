import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Construction, ShieldAlert } from 'lucide-react';
import { AdminProvider, useAdmin } from './AdminContext';
import { ADMIN_NAV } from './nav';
import type { Permission } from './permissions';
import AdminShell from './components/AdminShell';
import { EmptyState, PageHeader, Skeleton } from './components/ui';
import Overview from './pages/Overview';
import Tenants from './pages/Tenants';
import TenantDetail from './pages/TenantDetail';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Billing from './pages/Billing';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Features from './pages/Features';
import Announcements from './pages/Announcements';
import AppSettings from './pages/AppSettings';
import Reports from './pages/Reports';
import AuditLog from './pages/AuditLog';
import Security from './pages/Security';
import Monitoring from './pages/Monitoring';
import MfaSetup from './components/MfaSetup';

/**
 * The platform admin panel (/admin), loaded only when opened. Every route
 * checks the staff member's permission; the database checks it again.
 */
export default function AdminApp() {
  return (
    <AdminProvider>
      <AdminRoutes />
    </AdminProvider>
  );
}

function AdminRoutes() {
  const { role, loading, mfaRequired, refresh } = useAdmin();
  if (loading) return <FullSkeleton />;
  if (!role && mfaRequired) return <MfaGate onDone={refresh} />;
  if (!role) return <NotStaff />;

  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route index element={<Guard permission="dashboard.view"><Overview /></Guard>} />
        <Route path="tenants" element={<Guard permission="tenants.view"><Tenants /></Guard>} />
        <Route path="tenants/:id" element={<Guard permission="tenants.view"><TenantDetail /></Guard>} />
        <Route path="users" element={<Guard permission="users.view"><Users /></Guard>} />
        <Route path="users/:id" element={<Guard permission="users.view"><UserDetail /></Guard>} />
        <Route path="billing" element={<Guard permission="billing.view"><Billing /></Guard>} />
        <Route path="tickets" element={<Guard permission="tickets.view"><Tickets /></Guard>} />
        <Route path="tickets/:id" element={<Guard permission="tickets.view"><TicketDetail /></Guard>} />
        <Route path="features" element={<Guard permission="platform.manage"><Features /></Guard>} />
        <Route path="announcements" element={<Guard permission="announcements.manage"><Announcements /></Guard>} />
        <Route path="settings" element={<Guard permission="platform.manage"><AppSettings /></Guard>} />
        <Route path="reports" element={<Guard permission="reports.view"><Reports /></Guard>} />
        <Route path="audit" element={<Guard permission="audit.view"><AuditLog /></Guard>} />
        <Route path="security" element={<Guard permission="security.manage"><Security /></Guard>} />
        <Route path="monitoring" element={<Guard permission="monitoring.view"><Monitoring /></Guard>} />
        {ADMIN_NAV.flatMap((g) => g.items)
          .filter((i) => !i.ready)
          .map((i) => (
            <Route key={i.key} path={`${i.to.replace('/admin/', '')}/*`} element={<Guard permission={i.permission}><ComingSoon navKey={i.key} /></Guard>} />
          ))}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}

function Guard({ permission, children }: { permission: Permission; children: JSX.Element }) {
  const { can } = useAdmin();
  const { t } = useTranslation('admin');
  if (!can(permission)) {
    return <EmptyState icon={ShieldAlert} title={t('denied.title')} body={t('denied.body')} />;
  }
  return children;
}

function ComingSoon({ navKey }: { navKey: string }) {
  const { t } = useTranslation('admin');
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={t(`nav.items.${navKey}`)} />
      <EmptyState icon={Construction} title={t('comingSoon.title')} body={t('comingSoon.body')} />
    </div>
  );
}

function NotStaff() {
  const { t } = useTranslation('admin');
  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="max-w-sm text-center">
        <ShieldAlert className="mx-auto text-ink-muted" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-ink">{t('notStaff.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('notStaff.body')}</p>
        <Link to="/" className="mt-5 inline-flex rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
          {t('profile.backToApp')}
        </Link>
      </div>
    </div>
  );
}

function FullSkeleton() {
  return (
    <div className="flex min-h-screen bg-surface">
      <div className="hidden w-60 border-r border-line bg-panel lg:block" />
      <div className="flex-1 space-y-4 p-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

/** Staff must finish two-factor sign-in before the panel opens (0089). */
function MfaGate({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('admin');
  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 shadow-sm">
        <ShieldAlert size={28} className="text-brand" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold text-ink">{t('mfa.gateTitle')}</h1>
        <p className="mb-5 mt-1 text-sm text-ink-muted">{t('mfa.gateBody')}</p>
        <MfaSetup onDone={onDone} />
      </div>
    </div>
  );
}
