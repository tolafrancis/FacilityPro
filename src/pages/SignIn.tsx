import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout from '../components/AuthLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Turnstile, { captchaEnabled } from '../components/Turnstile';

export default function SignIn() {
  const { t } = useTranslation('auth');
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

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
    const { error: err } = await signIn(email, password, captchaToken ?? undefined);
    // Tokens are single-use.
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    navigate(params.get('next') ?? '/', { replace: true });
  };

  return (
    <AuthLayout title={t('signIn.title')}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('signIn.email')}</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">{t('signIn.password')}</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <Turnstile key={captchaKey} onToken={setCaptchaToken} />
        {error && <p className="text-sm text-status-crit">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">
          {t('signIn.submit')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-muted">
        {t('signIn.noAccount')}{' '}
        <Link to="/signup" className="font-medium text-brand">
          {t('signIn.signUpLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}
