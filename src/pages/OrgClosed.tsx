import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import type { ClosedOrg } from '../contexts/OrgContext';
import AuthLayout, { AuthNotice } from '../components/AuthLayout';

/**
 * Shown when every organisation the user belongs to has been suspended or
 * deleted by the platform (0084). Their data is intact; access returns when
 * the organisation is reactivated.
 */
export default function OrgClosed({ orgs }: { orgs: ClosedOrg[] }) {
  const { t } = useTranslation('auth');
  const { signOut, user } = useAuth();
  return (
    <AuthLayout title={t('closed.title')}>
      <div className="space-y-3">
        {orgs.map((o) => (
          <AuthNotice key={o.org_id}>
            <p className="font-semibold">{o.name}</p>
            <p className="mt-1 text-white/90">{o.deleted ? t('closed.deleted') : t('closed.suspended')}</p>
            {o.reason && !o.deleted && <p className="mt-1 text-white/90">{t('closed.reason', { reason: o.reason })}</p>}
          </AuthNotice>
        ))}
        <p className="text-sm text-white/90">{t('closed.contact')}</p>
        <p className="text-xs text-white/75">{t('closed.signedInAs', { email: user?.email ?? '' })}</p>
        <button type="button" onClick={() => void signOut()} className="mt-2 min-h-[44px] w-full rounded-lg bg-white text-sm font-semibold text-brand-600 hover:bg-white/90">
          {t('closed.signOut')}
        </button>
      </div>
    </AuthLayout>
  );
}
