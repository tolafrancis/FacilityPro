import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout, { AuthError, AuthField, AuthPassword, authButtonClass } from '../components/AuthLayout';
import Button from '../components/ui/Button';

const MIN_PASSWORD = 8;

/**
 * Landing page of the password-reset email. Supabase signs the user in from
 * the link (a recovery session); here they choose the new password.
 */
export default function ResetPassword() {
  const { t } = useTranslation('auth');
  const { session, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(t('errors.shortPassword', { count: MIN_PASSWORD }));
      return;
    }
    if (password !== confirm) {
      setError(t('reset.mismatch'));
      return;
    }
    setBusy(true);
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    navigate('/', { replace: true });
  };

  return (
    <AuthLayout title={t('reset.title')} headline={t('signIn.headline')} blurb={t('signIn.blurb')}>
      {!session ? (
        <div className="space-y-4 text-center text-sm">
          <AuthError>{t('reset.expired')}</AuthError>
          <Link to="/forgot-password" className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-2">
            {t('reset.requestNew')}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <AuthField label={t('reset.newPassword')} htmlFor="reset-password" hint={t('signUp.passwordHint', { count: MIN_PASSWORD })}>
            <AuthPassword id="reset-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} showLabel={t('showPassword')} hideLabel={t('hidePassword')} />
          </AuthField>
          <AuthField label={t('reset.confirmPassword')} htmlFor="reset-confirm">
            <AuthPassword id="reset-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} showLabel={t('showPassword')} hideLabel={t('hidePassword')} />
          </AuthField>
          {error && <AuthError>{error}</AuthError>}
          <Button type="submit" variant="inverse" loading={busy} className={authButtonClass}>
            {t('reset.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
