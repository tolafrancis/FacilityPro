import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { useOrg } from '../contexts/OrgContext';
import type { Role } from '../lib/database.types';

/**
 * Route guard: renders its child routes only when the signed-in member's
 * role is in `allow`. This is a UX backstop, not the security boundary —
 * RLS already blocks the underlying reads/writes for any role listed here.
 * Without this, a hidden nav link (AppShell's role filtering) still left a
 * direct URL reachable, landing on a page that silently showed nothing.
 */
export default function RequireRole({ allow }: { allow: Role[] }) {
  const { role, loading } = useOrg();
  const { t } = useTranslation('common');

  if (loading) return null;

  if (!role || !allow.includes(role)) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-dashed border-line bg-white p-8 text-center">
        <ShieldAlert className="mx-auto text-ink-muted" aria-hidden />
        <p className="mt-3 text-sm text-ink-muted">{t('errors.permissionDenied')}</p>
      </div>
    );
  }

  return <Outlet />;
}
