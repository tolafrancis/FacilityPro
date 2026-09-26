import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout, { AuthError, AuthField, AuthInput, AuthNotice, AuthPassword, authButtonClass } from '../components/AuthLayout';
import Button from '../components/ui/Button';
import Turnstile, { captchaEnabled } from '../components/Turnstile';
import { safeNext } from '../lib/redirect';

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Digits with optional +, spaces, dashes, dots and brackets; 7–15 digits.
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;

export default function SignUp() {
  const { t } = useTranslation('auth');
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Carried through sign-up (and the confirmation email) so an invitee lands
  // back on their invite instead of onboarding.
  const next = safeNext(params.get('next'));
  const signInLink = next ? `/signin?next=${encodeURIComponent(next)}` : '/signin';
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => params.get('email')?.trim() ?? '');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  // ?verify=<email>: straight to the code step (sign-in sends unconfirmed
  // accounts here to enter their code or get a new one).
  const [sentTo, setSentTo] = useState<string | null>(() => {
    const v = params.get('verify')?.trim() ?? '';
    return EMAIL_RE.test(v) ? v : null;
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim();
    if (!name.trim() || !cleanEmail || !password) {
      setError(t('errors.missingFields'));
      return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      setError(t('errors.invalidEmail'));
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(t('errors.shortPassword', { count: MIN_PASSWORD }));
      return;
    }
    if (phone.trim() && (!PHONE_RE.test(phone.trim()) || phone.replace(/\D/g, '').length < 7)) {
      setError(t('errors.invalidPhone'));
      return;
    }
    if (captchaEnabled && !captchaToken) {
      setError(t('errors.captchaRequired'));
      return;
    }
    setBusy(true);
    const { error: err, needsConfirm } = await signUp(cleanEmail, password, {
      captchaToken: captchaToken ?? undefined,
      redirectTo: window.location.origin + (next ?? '/'),
      fullName: name.trim(),
      phone: phone.trim() || undefined,
    });
    // Tokens are single-use.
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    setBusy(false);
    if (err) {
      setError(/already registered/i.test(err) ? t('errors.alreadyRegistered') : err);
      return;
    }
    if (needsConfirm) setSentTo(cleanEmail);
    // Otherwise a session is established: continue to the invite, or let
    // routing send the user to onboarding.
    else navigate(next ?? '/', { replace: true });
  };

  if (sentTo) return <VerifyEmail email={sentTo} next={next} onBack={() => setSentTo(null)} />;

  return (
    <AuthLayout
      title={t('signUp.title')}
      subtitle={
        <>
          {t('signUp.haveAccount')}{' '}
          <Link to={signInLink} className="font-semibold text-white underline underline-offset-2">
            {t('signUp.signInLink')}
          </Link>
        </>
      }
      headline={t('signUp.headline')}
      blurb={t('signUp.blurb')}
    >
      {next?.startsWith('/invite') && <div className="mb-4"><AuthNotice>{t('signUp.invited')}</AuthNotice></div>}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <AuthField label={t('signUp.name')} htmlFor="signup-name">
          <AuthInput id="signup-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </AuthField>
        <AuthField label={t('signUp.email')} htmlFor="signup-email">
          <AuthInput
            id="signup-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </AuthField>
        <AuthField label={t('signUp.password')} htmlFor="signup-password" hint={t('signUp.passwordHint', { count: MIN_PASSWORD })}>
          <AuthPassword
            id="signup-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showLabel={t('showPassword')}
            hideLabel={t('hidePassword')}
          />
        </AuthField>
        <AuthField label={t('signUp.phone')} htmlFor="signup-phone" hint={t('signUp.phoneHint')}>
          <AuthInput id="signup-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+84 90 123 4567" />
        </AuthField>
        <Turnstile key={captchaKey} onToken={setCaptchaToken} action="signup" />
        {error && <AuthError>{error}</AuthError>}
        <Button type="submit" variant="inverse" loading={busy} className={authButtonClass}>
          {t('signUp.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Step 2: the 6-digit code from the email (or the link in it). */
function VerifyEmail({ email, next, onBack }: { email: string; next: string | null; onBack: () => void }) {
  const { t } = useTranslation('auth');
  const { verifySignUp, resendSignUp } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const token = code.replace(/\D/g, '');
    if (token.length !== 6) {
      setError(t('verify.codeLength'));
      return;
    }
    setBusy(true);
    const { error: err } = await verifySignUp(email, token);
    setBusy(false);
    if (err) {
      setError(t('verify.invalidCode'));
      return;
    }
    navigate(next ?? '/', { replace: true });
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    if (captchaEnabled && !captchaToken) {
      setError(t('errors.captchaRequired'));
      return;
    }
    setResending(true);
    const { error: err } = await resendSignUp(email, captchaToken ?? undefined, window.location.origin + (next ?? '/'));
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    setResending(false);
    if (err) setError(err);
    else setNotice(t('verify.resent'));
  };

  return (
    <AuthLayout title={t('verify.title')} subtitle={t('verify.body', { email })} headline={t('signUp.headline')} blurb={t('signUp.blurb')}>
      <form onSubmit={verify} className="space-y-4" noValidate>
        <AuthField label={t('verify.code')} htmlFor="verify-code">
          <AuthInput
            id="verify-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
          />
        </AuthField>
        {error && <AuthError>{error}</AuthError>}
        {notice && <AuthNotice>{notice}</AuthNotice>}
        <Button type="submit" variant="inverse" loading={busy} className={authButtonClass}>
          {t('verify.submit')}
        </Button>
      </form>
      <div className="mt-6 space-y-3 text-center text-sm">
        <Turnstile key={captchaKey} onToken={setCaptchaToken} action="signup" />
        <button type="button" onClick={() => void resend()} disabled={resending} className="min-h-[44px] font-semibold underline underline-offset-2 disabled:opacity-60">
          {t('verify.resend')}
        </button>
        <div>
          <button type="button" onClick={onBack} className="min-h-[44px] text-white/90 underline underline-offset-2">
            {t('verify.changeEmail')}
          </button>
        </div>
        {/* Tapping the email's button in this browser signs this page in
            automatically; confirmed on another device (a phone), the account
            is ready but this browser has no session, so offer sign-in. */}
        <p className="border-t border-white/20 pt-4 text-white/90">
          {t('verify.otherDevice')}{' '}
          <Link to={`/signin?email=${encodeURIComponent(email)}`} className="font-semibold text-white underline underline-offset-2">
            {t('verify.signIn')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
