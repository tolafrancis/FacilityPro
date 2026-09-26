import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

interface Factor { id: string; friendly_name?: string | null; status: string }

/**
 * Two-factor authentication with an authenticator app (Supabase Auth TOTP):
 * verify an existing factor to raise this session to aal2, or add one.
 */
export default function MfaSetup({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('admin');
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [aal, setAal] = useState<string | null>(null);
  const [enrolment, setEnrolment] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [{ data: list }, { data: level }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
    setFactors(((list?.all ?? []) as Factor[]));
    setAal(level?.currentLevel ?? null);
  };
  useEffect(() => { void load(); }, []);

  const verified = (factors ?? []).filter((f) => f.status === 'verified');
  const target = enrolment?.id ?? verified[0]?.id;

  const start = async () => {
    setBusy(true);
    setError(null);
    // Leftovers from an abandoned attempt would block a new one.
    for (const f of (factors ?? []).filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `FacilityPro admin ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (e || !data) { setError(t('mfa.enrolFailed')); return; }
    setEnrolment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const verify = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId: target, code: code.trim() });
    setBusy(false);
    if (e) { setError(t('mfa.wrongCode')); return; }
    setCode('');
    setEnrolment(null);
    await load();
    onDone();
  };

  if (!factors) return <p className="text-sm text-ink-muted">{t('loading')}</p>;
  if (verified.length && aal === 'aal2' && !enrolment) {
    return <p className="flex items-center gap-2 text-sm text-status-ok"><ShieldCheck size={16} aria-hidden /> {t('mfa.active')}</p>;
  }

  return (
    <div className="space-y-3">
      {enrolment ? (
        <>
          <p className="text-sm text-ink">{t('mfa.scan')}</p>
          <div className="flex flex-wrap items-center gap-4">
            <img src={enrolment.qr} alt={t('mfa.qrAlt')} className="h-40 w-40 rounded-lg border border-line bg-white p-2" />
            <div className="min-w-0 text-xs text-ink-muted">
              <p>{t('mfa.cantScan')}</p>
              <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-ink">{enrolment.secret}</code>
            </div>
          </div>
        </>
      ) : verified.length ? (
        <p className="text-sm text-ink">{t('mfa.enterCode')}</p>
      ) : (
        <>
          <p className="text-sm text-ink">{t('mfa.intro')}</p>
          <Button onClick={() => void start()} loading={busy}><ShieldCheck size={15} aria-hidden /> {t('mfa.setUp')}</Button>
        </>
      )}
      {target && (
        <form className="flex max-w-xs gap-2" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <Input aria-label={t('mfa.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
          <Button type="submit" disabled={code.length !== 6} loading={busy}>{t('mfa.verify')}</Button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-status-crit">{error}</p>}
    </div>
  );
}
