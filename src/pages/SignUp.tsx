import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout from '../components/AuthLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Turnstile, { captchaEnabled } from '../components/Turnstile';
import { safeNext } from '../lib/redirect';

export default function SignUp() {
  const { t } = useTranslation('auth');
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Carried through sign-up (and the confirmation email) so an invitee lands
  // back on their invite instead of onboarding.
  const next = safeNext(params.get('next'));
  const signInLink = next ? `/signin?next=${encodeURIComponent(next)}` : '/signin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [confirm, setConfirm] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError(t('errors.missingFields'));
      return;
    }
    if (captchaEnabled && !captchaToken) {
      setError(t('errors.captchaRequired'));
      return;
    }
    setBusy(true);
    const { error: err, needsConfirm } = await signUp(
      email,
      password,
      captchaToken ?? undefined,
      next ? window.location.origin + next : undefined
    );
    // Tokens are single-use.
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (needsConfirm) setConfirm(true);
    // Otherwise a session is established: continue to the invite, or let
    // routing send the user to onboarding.
    else if (next) navigate(next, { replace: true });
  };

  if (confirm) {
    return (
      <AuthLayout title={t('signUp.title')}>
        <p className="text-sm text-ink">{t('signUp.checkEmail')}</p>
        <p className="mt-4 text-center text-sm text-ink-muted">
          <Link to={signInLink} className="font-medium text-brand">
            {t('signUp.signInLink')}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('signUp.title')}>
      {next?.startsWith('/invite') && <p className="mb-4 rounded-lg bg-surface p-3 text-sm text-ink">{t('signUp.invited')}</p>}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('signUp.email')}</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('signUp.password')}</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Turnstile key={captchaKey} onToken={setCaptchaToken} />
        {error && <p className="text-sm text-status-crit">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">
          {t('signUp.submit')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-muted">
        {t('signUp.haveAccount')}{' '}
        <Link to={signInLink} className="font-medium text-brand">
          {t('signUp.signInLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}
