import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { orgLogoUrl } from '../lib/orgLogo';
import { forgetJoin, rememberJoin } from '../lib/redirect';
import AuthLayout, { AuthError, AuthNotice, authButtonClass } from '../components/AuthLayout';
import Button from '../components/ui/Button';

interface LinkInfo {
  valid: boolean;
  reason: 'not_found' | 'revoked' | 'expired' | 'used_up' | null;
  org_name?: string;
  logo_path?: string | null;
  role?: string;
  already_member?: boolean;
}

/**
 * Where a shared join link or its QR code lands (/join/<token>, 0082).
 * Signed out: shows the organisation and role, then sign up / sign in and
 * come back here. Signed in: one tap to join.
 */
export default function JoinOrg() {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const { token = '' } = useParams<{ token: string }>();
  const { session } = useAuth();
  const org = useOrg();
  const navigate = useNavigate();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/join/${encodeURIComponent(token)}`;

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: err } = await supabase.rpc('fp_join_link_info', { p_token: token });
      if (!active) return;
      setInfo(err ? { valid: false, reason: 'not_found' } : (data as LinkInfo));
    })();
    return () => {
      active = false;
    };
  }, [token, session]);

  // Remember the link while signed out, so it survives sign-up and email
  // confirmation even if the confirmation lands on the home page.
  useEffect(() => {
    if (!session && info?.valid) rememberJoin(token);
  }, [session, info, token]);

  const join = async () => {
    setError(null);
    setBusy(true);
    const { data, error: err } = await supabase.rpc('fp_join_via_link', { p_token: token });
    if (err) {
      setBusy(false);
      const reason = /join_link_invalid:(\w+)/.exec(err.message)?.[1];
      setError(reason ? t(`join.reasons.${reason}`) : /plan_limit_reached/.test(err.message) ? t('join.full') : err.message);
      return;
    }
    forgetJoin();
    await org.refresh();
    org.setCurrentOrg((data as { org_id: string }).org_id);
    navigate('/', { replace: true });
  };

  const openOrg = () => {
    forgetJoin();
    navigate('/', { replace: true });
  };

  if (!info) {
    return (
      <AuthLayout title={t('join.title')}>
        <AuthNotice>{tc('loading')}</AuthNotice>
      </AuthLayout>
    );
  }

  if (!info.valid && !info.already_member) {
    return (
      <AuthLayout title={t('join.title')}>
        <AuthError>{t(`join.reasons.${info.reason ?? 'not_found'}`)}</AuthError>
        <p className="mt-4 text-sm text-white/90">{t('join.askAdmin')}</p>
        <Link to="/" className="mt-6 inline-flex min-h-[44px] items-center text-sm font-semibold underline underline-offset-2">
          {t('invite.goHome')}
        </Link>
      </AuthLayout>
    );
  }

  const roleName = tc(`roles.${info.role}`);
  const logo = orgLogoUrl(info.logo_path);

  return (
    <AuthLayout title={t('join.titleOrg', { org: info.org_name })} subtitle={t('join.asRole', { role: roleName })}>
      <div className="mb-6 flex justify-center">
        {logo ? (
          <img src={logo} alt="" className="h-20 w-20 rounded-2xl bg-white object-contain p-2" />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-white text-3xl font-bold text-brand-600">
            {(info.org_name ?? '?').slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      {error && <div className="mb-4"><AuthError>{error}</AuthError></div>}

      {!session ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-white/90">{t('join.signUpFirst')}</p>
          <Link to={`/signup?next=${encodeURIComponent(here)}`} className={`${authButtonClass} flex items-center justify-center rounded-lg bg-white font-semibold text-brand-600 hover:bg-white/90`}>
            {t('join.createAccount')}
          </Link>
          <Link to={`/signin?next=${encodeURIComponent(here)}`} className="flex min-h-[44px] items-center justify-center rounded-lg border-2 border-white text-sm font-semibold text-white hover:bg-white/10">
            {t('join.haveAccount')}
          </Link>
        </div>
      ) : info.already_member ? (
        <div className="space-y-4">
          <AuthNotice>{t('join.alreadyMember', { org: info.org_name })}</AuthNotice>
          <Button type="button" variant="inverse" onClick={openOrg} className={authButtonClass}>
            {t('join.open', { org: info.org_name })}
          </Button>
        </div>
      ) : (
        <Button type="button" variant="inverse" loading={busy} onClick={() => void join()} className={authButtonClass}>
          {t('join.join', { org: info.org_name })}
        </Button>
      )}
    </AuthLayout>
  );
}
