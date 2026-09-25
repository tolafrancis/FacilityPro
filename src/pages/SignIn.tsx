import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout, { AuthError, AuthField, AuthInput, AuthNotice, AuthPassword, authButtonClass } from '../components/AuthLayout';
import Button from '../components/ui/Button';
import Turnstile, { captchaEnabled } from '../components/Turnstile';
import { safeNext } from '../lib/redirect';

export default function SignIn() {
  const { t } = useTranslation('auth');
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const signUpLink = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup';

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
    const { error: err } = await signIn(email.trim(), password, captchaToken ?? undefined, keep);
    // Tokens are single-use.
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    setBusy(false);
    if (err) {
      setError(/invalid login credentials/i.test(err) ? t('errors.badCredentials') : /email not confirmed/i.test(err) ? t('errors.notConfirmed') : err);
      return;
    }
    navigate(next ?? '/', { replace: true });
  };

  return (
    <AuthLayout
      title={t('signIn.title')}
      subtitle={
        <>
          {t('signIn.noAccount')}{' '}
          <Link to={signUpLink} className="font-semibold text-white underline underline-offset-2">
            {t('signIn.signUpLink')}
          </Link>
        </>
      }
      headline={t('signIn.headline')}
      blurb={t('signIn.blurb')}
    >
      {next?.startsWith('/invite') && <div className="mb-4"><AuthNotice>{t('signIn.invited')}</AuthNotice></div>}
      {params.get('reset') === 'done' && <div className="mb-4"><AuthNotice>{t('reset.done')}</AuthNotice></div>}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <AuthField label={t('signIn.email')} htmlFor="signin-email">
          <AuthInput
            id="signin-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </AuthField>
        <AuthField label={t('signIn.password')} htmlFor="signin-password">
          <AuthPassword
            id="signin-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showLabel={t('showPassword')}
            hideLabel={t('hidePassword')}
          />
        </AuthField>
        <div className="flex items-center justify-between gap-3 text-sm">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
              className="h-5 w-5 accent-white"
            />
            {t('signIn.keepLoggedIn')}
          </label>
          <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim())}` : ''}`} className="flex min-h-[44px] items-center text-white underline underline-offset-2">
            {t('signIn.forgot')}
          </Link>
        </div>
        <Turnstile key={captchaKey} onToken={setCaptchaToken} action="login" />
        {error && <AuthError>{error}</AuthError>}
        <Button type="submit" variant="inverse" loading={busy} className={authButtonClass}>
          {t('signIn.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
