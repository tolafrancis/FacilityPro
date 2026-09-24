import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import AuthLayout from '../components/AuthLayout';
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
      {status === 'working' && <p className="text-sm text-ink">{t('invite.accepting')}</p>}
      {status === 'ok' && <p className="text-sm text-status-ok">{t('invite.success')}</p>}
      {status === 'error' && (
        <>
          <p className="text-sm text-status-crit">{message}</p>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="mt-4 text-sm font-medium text-brand hover:text-brand-600"
          >
            {t('invite.goHome')}
          </button>
        </>
      )}
    </AuthLayout>
  );
}
