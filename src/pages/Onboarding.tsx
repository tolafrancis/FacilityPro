import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { SUPPORTED } from '../i18n';
import AuthLayout from '../components/AuthLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { pendingInvite } from '../lib/redirect';

export default function Onboarding() {
  const { t, i18n } = useTranslation('auth');
  const { refresh } = useOrg();
  const { signOut } = useAuth();
  const [name, setName] = useState('');
  const [lng, setLng] = useState(i18n.resolvedLanguage ?? 'en');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Someone who opened an invite before signing up shouldn't end up creating
  // a separate organisation by mistake.
  const [invite] = useState(pendingInvite);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name) {
      setError(t('errors.missingFields'));
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.rpc('fp_create_organization', {
      p_name: name,
      p_default_lng: lng,
    });
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    await refresh();
    setBusy(false);
    // Routing detects the new membership and shows the dashboard.
  };

  return (
    <AuthLayout title={t('onboarding.title')} subtitle={t('onboarding.subtitle')}>
      {invite && (
        <div className="mb-5 rounded-lg border border-brand/30 bg-brand/5 p-3 text-sm text-ink">
          <p>{t('onboarding.pendingInvite')}</p>
          <Link
            to={`/invite?token=${encodeURIComponent(invite)}`}
            className="mt-2 inline-block rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            {t('onboarding.acceptInvite')}
          </Link>
          <p className="mt-2 text-ink-muted">{t('onboarding.orCreate')}</p>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            {t('onboarding.orgName')}
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            {t('onboarding.defaultLanguage')}
          </label>
          <select
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            {SUPPORTED.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-status-crit">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">
          {t('onboarding.submit')}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-4 w-full text-center text-sm text-ink-muted hover:text-ink"
      >
        {t('onboarding.signOut')}
      </button>
    </AuthLayout>
  );
}
