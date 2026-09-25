import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import AuthLayout, { AuthError, AuthNotice } from '../components/AuthLayout';
import { forgetInvite } from '../lib/redirect';

export default function AcceptInvite() {
  const { t } = useTranslation('auth');
  const [params] = useSearchParams();
  const token = params.get('token');
  const { refresh } = useOrg();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      if (!token) {
        setStatus('error');
        setMessage(t('errors.generic'));
        return;
      }
      const { error } = await supabase.rpc('fp_accept_invite', { p_token: token });
      if (error) {
        setStatus('error');
        // Keep the remembered invite only when signing in as someone else
        // could still use it.
        if (/different email/i.test(error.message)) {
          setMessage(t('invite.wrongEmail'));
        } else {
          forgetInvite();
          setMessage(error.message);
        }
        return;
      }
      forgetInvite();
      await refresh();
      setStatus('ok');
      setTimeout(() => navigate('/', { replace: true }), 900);
    })();
  }, [token, refresh, navigate, t]);

  return (
    <AuthLayout title={t('invite.title')}>
      {status === 'working' && <AuthNotice>{t('invite.accepting')}</AuthNotice>}
      {status === 'ok' && <AuthNotice>{t('invite.success')}</AuthNotice>}
      {status === 'error' && (
        <>
          <AuthError>{message}</AuthError>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="mt-4 min-h-[44px] w-full text-center text-sm font-semibold underline underline-offset-2"
          >
            {t('invite.goHome')}
          </button>
        </>
      )}
    </AuthLayout>
  );
}
