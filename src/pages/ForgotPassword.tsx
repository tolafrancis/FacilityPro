import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout, { AuthError, AuthField, AuthInput, AuthNotice, authButtonClass } from '../components/AuthLayout';
import Button from '../components/ui/Button';
import Turnstile, { captchaEnabled } from '../components/Turnstile';

export default function ForgotPassword() {
  const { t } = useTranslation('auth');
  const { requestPasswordReset } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError(t('errors.missingFields'));
      return;
    }
    if (captchaEnabled && !captchaToken) {
      setError(t('errors.captchaRequired'));
      return;
    }
    setBusy(true);
    const { error: err } = await requestPasswordReset(email.trim(), captchaToken ?? undefined);
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    setBusy(false);
    // Same answer whether or not the address has an account.
    if (err && !/not found|no user/i.test(err)) setError(err);
    else setSent(true);
  };

  return (
    <AuthLayout
      title={t('forgot.title')}
      subtitle={sent ? undefined : t('forgot.body')}
      headline={t('signIn.headline')}
      blurb={t('signIn.blurb')}
    >
      {sent ? (
        <AuthNotice>{t('forgot.sent', { email: email.trim() })}</AuthNotice>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <AuthField label={t('signIn.email')} htmlFor="forgot-email">
            <AuthInput id="forgot-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
          </AuthField>
          <Turnstile key={captchaKey} onToken={setCaptchaToken} action="login" />
          {error && <AuthError>{error}</AuthError>}
          <Button type="submit" variant="inverse" loading={busy} className={authButtonClass}>
            {t('forgot.submit')}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/signin" className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-2">
          {t('forgot.back')}
        </Link>
      </p>
    </AuthLayout>
  );
}
