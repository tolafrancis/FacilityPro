import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ImagePlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { SUPPORTED } from '../i18n';
import AuthLayout, { AuthError, AuthField, AuthInput, AuthNotice, authButtonClass } from '../components/AuthLayout';
import Button from '../components/ui/Button';
import { pendingInvite, pendingJoin } from '../lib/redirect';
import { LOGO_TYPES, orgLogoUrl, uploadOrgLogo } from '../lib/orgLogo';

export const INDUSTRIES = [
  'manufacturing', 'oil_gas', 'health_care', 'property_management', 'facility_management',
  'hospitality', 'religious', 'government', 'fleet_management', 'other',
] as const;

const selectClass =
  'h-12 w-full rounded-lg border-2 border-transparent bg-white px-3 text-base text-ink focus:border-ink focus:outline-none';

/**
 * Two steps: the organisation (name, industry, language), then its logo.
 * The organisation is created at step 1; the app only moves to the
 * dashboard (via refresh()) once step 2 is done or skipped.
 */
export default function Onboarding() {
  const { t, i18n } = useTranslation('auth');
  const { refresh } = useOrg();
  const { user, signOut } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [lng, setLng] = useState(i18n.resolvedLanguage ?? 'en');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Someone who opened an invite before signing up shouldn't end up creating
  // a separate organisation by mistake.
  const [invite] = useState(pendingInvite);
  // Same for a join link (0082) opened before signing up.
  const [joinToken] = useState(pendingJoin);

  const createOrg = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !industry) {
      setError(t('errors.missingFields'));
      return;
    }
    setBusy(true);
    const { data: id, error: err } = await supabase.rpc('fp_create_organization', {
      p_name: name.trim(),
      p_default_lng: lng,
    });
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    await supabase.from('fp_organizations').update({ industry }).eq('id', id);
    // The phone number given at sign-up becomes the SMS number (SMS stays off
    // until the user turns it on).
    const phone = (user?.user_metadata?.phone as string | undefined)?.trim();
    if (phone && user) {
      await supabase.from('fp_notification_prefs').upsert({ user_id: user.id, phone }, { onConflict: 'user_id' });
    }
    setBusy(false);
    setOrgId(id as string);
    setStep(2);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !orgId) return;
    setError(null);
    setBusy(true);
    try {
      setLogoPath(await uploadOrgLogo(orgId, file, logoPath));
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(code === 'logo_type' ? t('onboarding.logoType') : code === 'logo_size' ? t('onboarding.logoSize') : t('errors.generic'));
    }
    setBusy(false);
  };

  // Routing sees the new membership and shows the dashboard.
  const finish = () => void refresh();

  if (step === 2) {
    const url = orgLogoUrl(logoPath);
    return (
      <AuthLayout title={t('onboarding.planTitle')} subtitle={t('onboarding.stepOf', { step: 2, total: 2 })}>
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide">{t('onboarding.logoTitle')}</p>
          <p className="text-sm text-white/85">{t('onboarding.optional')}</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mx-auto mt-5 grid h-40 w-40 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-white/60 bg-white/10 hover:bg-white/20"
            aria-label={url ? t('onboarding.changeLogo') : t('onboarding.uploadLogo')}
          >
            {url ? (
              <img src={url} alt={t('onboarding.logoAlt', { name })} className="h-full w-full bg-white object-contain p-2" />
            ) : (
              <ImagePlus size={36} aria-hidden />
            )}
          </button>
          <input ref={fileRef} type="file" accept={LOGO_TYPES.join(',')} className="sr-only" onChange={(e) => void onFile(e)} />
          <p className="mt-2 text-xs text-white/80">{t('onboarding.logoHint')}</p>
          <Button type="button" variant="secondary" loading={busy} onClick={() => fileRef.current?.click()} className="mt-4">
            {url ? t('onboarding.changeLogo') : t('onboarding.uploadLogo')}
          </Button>
        </div>
        {error && <div className="mt-4"><AuthError>{error}</AuthError></div>}
        <Button type="button" variant="inverse" onClick={finish} disabled={busy} className={`${authButtonClass} mt-8`}>
          {t('onboarding.next')}
        </Button>
        {!url && (
          <button type="button" onClick={finish} className="mt-3 min-h-[44px] w-full text-sm text-white/90 underline underline-offset-2">
            {t('onboarding.skip')}
          </button>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('onboarding.title')} subtitle={t('onboarding.stepOf', { step: 1, total: 2 })}>
      {joinToken && !invite && (
        <div className="mb-5">
          <AuthNotice>
            <p>{t('onboarding.pendingJoin')}</p>
            <Link
              to={`/join/${encodeURIComponent(joinToken)}`}
              className="mt-2 inline-flex min-h-[44px] items-center rounded-lg bg-white px-4 text-sm font-semibold text-brand-600"
            >
              {t('onboarding.finishJoin')}
            </Link>
            <p className="mt-2 text-white/85">{t('onboarding.orCreate')}</p>
          </AuthNotice>
        </div>
      )}
      {invite && (
        <div className="mb-5">
          <AuthNotice>
            <p>{t('onboarding.pendingInvite')}</p>
            <Link
              to={`/invite?token=${encodeURIComponent(invite)}`}
              className="mt-2 inline-flex min-h-[44px] items-center rounded-lg bg-white px-4 text-sm font-semibold text-brand-600"
            >
              {t('onboarding.acceptInvite')}
            </Link>
            <p className="mt-2 text-white/85">{t('onboarding.orCreate')}</p>
          </AuthNotice>
        </div>
      )}
      <form onSubmit={createOrg} className="space-y-4" noValidate>
        <AuthField label={t('onboarding.orgName')} htmlFor="onb-name">
          <AuthInput id="onb-name" autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </AuthField>
        <AuthField label={t('onboarding.industry')} htmlFor="onb-industry">
          <select id="onb-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} className={selectClass}>
            <option value="" disabled>
              {t('onboarding.select')}
            </option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {t(`industries.${i}`)}
              </option>
            ))}
          </select>
        </AuthField>
        <AuthField label={t('onboarding.defaultLanguage')} htmlFor="onb-lng">
          <select id="onb-lng" value={lng} onChange={(e) => setLng(e.target.value)} className={selectClass}>
            {SUPPORTED.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </AuthField>
        <p className="text-sm text-white/85">{t('onboarding.subtitle')}</p>
        {error && <AuthError>{error}</AuthError>}
        <Button type="submit" variant="inverse" loading={busy} className={authButtonClass}>
          {t('onboarding.next')}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-4 min-h-[44px] w-full text-center text-sm text-white/90 underline underline-offset-2"
      >
        {t('onboarding.signOut')}
      </button>
    </AuthLayout>
  );
}
