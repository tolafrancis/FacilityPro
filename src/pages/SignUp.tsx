import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout from '../components/AuthLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function SignUp() {
  const { t } = useTranslation('auth');
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError(t('errors.missingFields'));
      return;
    }
    setBusy(true);
    const { error: err, needsConfirm } = await signUp(email, password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (needsConfirm) setConfirm(true);
    // Otherwise a session is established and routing sends the user to onboarding.
  };

  if (confirm) {
    return (
      <AuthLayout title={t('signUp.title')}>
        <p className="text-sm text-ink">{t('signUp.checkEmail')}</p>
        <p className="mt-4 text-center text-sm text-ink-muted">
          <Link to="/signin" className="font-medium text-brand">
            {t('signUp.signInLink')}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('signUp.title')}>
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
        {error && <p className="text-sm text-status-crit">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">
          {t('signUp.submit')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-muted">
        {t('signUp.haveAccount')}{' '}
        <Link to="/signin" className="font-medium text-brand">
          {t('signUp.signInLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}
