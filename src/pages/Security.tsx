import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationPref } from '../lib/queries';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

interface Factor {
  id: string;
  friendly_name?: string;
  status: string;
}

export default function Security() {
  const { t } = useTranslation('security');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pref = useNotificationPref(user?.id);

  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState<{ factorId: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (pref.data?.phone != null) setPhone(pref.data.phone);
  }, [pref.data?.phone]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnroll = async () => {
    setError(null);
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (err || !data) {
      setError(err?.message ?? 'Enrollment failed');
      return;
    }
    setEnrolling({ factorId: data.id, uri: data.totp.uri });
  };

  const confirmEnroll = async () => {
    if (!enrolling) return;
    setBusy(true);
    setError(null);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
      factorId: enrolling.factorId,
    });
    if (chErr || !ch) {
      setError(chErr?.message ?? 'Challenge failed');
      setBusy(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: ch.id,
      code,
    });
    setBusy(false);
    if (vErr) {
      setError(vErr.message);
      return;
    }
    setEnrolling(null);
    setCode('');
    void refresh();
  };

  const removeFactor = async (factorId: string) => {
    await supabase.auth.mfa.unenroll({ factorId });
    void refresh();
  };

  const savePref = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error: err } = await supabase
        .from('fp_notification_prefs')
        .upsert({ user_id: user?.id, ...patch }, { onConflict: 'user_id' });
      if (err) throw err;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notification_pref', user?.id] }),
  });

  const verified = factors.filter((f) => f.status === 'verified');
  const emailEnabled = pref.data?.email_enabled ?? false;
  const smsEnabled = pref.data?.sms_enabled ?? false;
  const pushEnabled = pref.data?.push_enabled ?? false;

  const VAPID_PUBLIC = (import.meta.env as Record<string, string | undefined>)
    .VITE_VAPID_PUBLIC_KEY;
  const pushSupported =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    !!VAPID_PUBLIC;

  const enablePush = async () => {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC as string),
      });
      const json = sub.toJSON();
      const { error: subError } = await supabase.from('fp_push_subscriptions').upsert(
        {
          user_id: user?.id,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
        { onConflict: 'endpoint' }
      );
      // Without the stored subscription the server can't deliver anything, so
      // don't turn the preference on.
      if (subError) throw new Error(subError.message);
      savePref.mutate({ push_enabled: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const disablePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Best effort: turning the preference off below already stops delivery.
        await supabase.from('fp_push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
    } catch {
      /* ignore */
    }
    savePref.mutate({ push_enabled: false });
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>

      <section className="mt-6 rounded-xl border border-line bg-white p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-brand" aria-hidden />
          <h2 className="font-semibold text-ink">{t('mfa.title')}</h2>
        </div>
        <p className="mt-1 text-sm text-ink-muted">{t('mfa.hint')}</p>

        {verified.length > 0 && (
          <ul className="mt-3 space-y-2">
            {verified.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
              >
                <span className="text-ink">
                  {f.friendly_name || t('mfa.authenticatorApp')}
                  <span className="ml-2 text-xs text-status-ok">{t('mfa.active')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFactor(f.id)}
                  className="text-ink-muted hover:text-status-crit"
                  aria-label={t('mfa.remove')}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {!enrolling ? (
          <Button className="mt-4" variant="secondary" onClick={startEnroll}>
            {verified.length > 0 ? t('mfa.addAnother') : t('mfa.enable')}
          </Button>
        ) : (
          <div className="mt-4 rounded-lg border border-line p-4">
            <p className="text-sm text-ink">{t('mfa.scan')}</p>
            <div className="mt-3 inline-block rounded-lg border border-line p-3">
              <QRCodeSVG value={enrolling.uri} size={160} />
            </div>
            <div className="mt-3 max-w-xs">
              <label className="mb-1 block text-sm font-medium text-ink">{t('mfa.code')}</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                placeholder="123456"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={confirmEnroll} loading={busy} disabled={code.length < 6}>
                {t('mfa.verify')}
              </Button>
              <Button variant="secondary" onClick={() => setEnrolling(null)}>
                {t('mfa.cancel')}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-status-crit">{error}</p>}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold text-ink">{t('email.title')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('email.hint')}</p>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(e) => savePref.mutate({ email_enabled: e.target.checked })}
            className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
          />
          {t('email.toggle')}
        </label>
        {user?.email && (
          <p className="mt-2 text-xs text-ink-muted">{t('email.deliverTo', { email: user.email })}</p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold text-ink">{t('sms.title')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('sms.hint')}</p>
        <div className="mt-3 max-w-xs">
          <label className="mb-1 block text-sm font-medium text-ink">{t('sms.phone')}</label>
          <div className="flex gap-2">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+84…"
              inputMode="tel"
            />
            <Button variant="secondary" onClick={() => savePref.mutate({ phone })}>
              {tc('actions.save')}
            </Button>
          </div>
          <p className="mt-1 text-xs text-ink-muted">{t('sms.phoneHint')}</p>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={smsEnabled}
            onChange={(e) => savePref.mutate({ sms_enabled: e.target.checked })}
            className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
          />
          {t('sms.toggle')}
        </label>
      </section>

      {pushSupported && (
        <section className="mt-6 rounded-xl border border-line bg-white p-4">
          <h2 className="font-semibold text-ink">{t('push.title')}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('push.hint')}</p>
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={pushEnabled}
              onChange={(e) => (e.target.checked ? void enablePush() : void disablePush())}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
            />
            {t('push.toggle')}
          </label>
        </section>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}
