import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resolveI18n } from '../i18n/resolver';
import type { I18nText, Priority } from '../lib/database.types';
import LanguageSwitcher from '../components/LanguageSwitcher';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Turnstile, { captchaEnabled } from '../components/Turnstile';

const SEVERITIES: Priority[] = ['low', 'medium', 'high', 'critical'];

interface PublicContext {
  allowed: boolean;
  org_name?: string;
  asset_name?: I18nText | null;
  location_name?: I18nText | null;
}

export default function PublicReport() {
  const { t, i18n } = useTranslation('report');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [params] = useSearchParams();
  const org = params.get('org');
  const asset = params.get('asset');
  const location = params.get('location');

  const [ctx, setCtx] = useState<PublicContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Priority>('medium');
  const [reporter, setReporter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    if (!org) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('fp_public_context', {
          p_org: org,
          p_asset: asset,
          p_location: location,
        });
        if (active) setCtx((data as PublicContext) ?? { allowed: false });
      } catch {
        if (active) setCtx({ allowed: false });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [org, asset, location]);

  // Known server refusals, shown in the reporter's language.
  const errorText = (code: string) =>
    ['rate_limited', 'report_too_long', 'report_invalid_asset', 'report_invalid_location', 'captcha_failed', 'captcha_unavailable'].includes(code)
      ? t(`errors.${code}`)
      : t('errors.generic');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !org) return;
    if (captchaEnabled && !captchaToken) {
      setError(t('errors.captcha_required'));
      return;
    }
    setBusy(true);
    setError(null);
    const fields = {
      org,
      title: title.trim(),
      body: description.trim() || null,
      severity,
      lng,
      asset,
      location,
      reporter: reporter.trim() || null,
    };
    let id: string | null = null;
    let code: string | null = null;
    if (captchaEnabled) {
      // Verified server-side by the public-report Edge Function.
      const { data, error: err } = await supabase.functions.invoke('public-report', {
        body: { ...fields, captchaToken },
      });
      if (err) {
        const payload = await (err as { context?: Response }).context?.json?.().catch(() => null);
        code = (payload as { error?: string } | null)?.error ?? 'generic';
      } else {
        id = (data as { id?: string } | null)?.id ?? null;
      }
      // Turnstile tokens are single-use.
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    } else {
      const { data, error: err } = await supabase.rpc('fp_public_report', {
        p_org: fields.org,
        p_title: fields.title,
        p_body: fields.body,
        p_severity: fields.severity,
        p_lng: fields.lng,
        p_asset: fields.asset,
        p_location: fields.location,
        p_reporter: fields.reporter,
      });
      if (err) code = err.message.split(/[\s:]/)[0];
      else id = data as string;
    }
    setBusy(false);
    if (code) {
      setError(errorText(code));
      return;
    }
    setReference(id ? id.slice(0, 8).toUpperCase() : null);
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm font-bold text-white">
            F
          </div>
          <span className="font-semibold text-ink">{tc('app.name')}</span>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto max-w-md p-4">
        {loading ? (
          <p className="mt-10 text-center text-sm text-ink-muted">{tc('loading')}</p>
        ) : !org || !ctx?.allowed ? (
          <div className="mt-10 rounded-xl border border-line bg-white p-6 text-center">
            <p className="text-sm text-ink-muted">{t('unavailable')}</p>
          </div>
        ) : done ? (
          <div className="mt-10 rounded-xl border border-line bg-white p-8 text-center">
            <CheckCircle2 className="mx-auto text-status-ok" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold text-ink">{t('thanksTitle')}</h1>
            <p className="mt-1 text-sm text-ink-muted">{t('thanksBody')}</p>
            {reference && (
              <p className="mt-3 text-sm text-ink">
                {t('reference')}: <span className="font-mono font-semibold">{reference}</span>
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 rounded-xl border border-line bg-white p-5">
            <h1 className="text-xl font-semibold text-ink">{t('title')}</h1>
            {ctx.org_name && <p className="mt-1 text-sm text-ink-muted">{ctx.org_name}</p>}
            {ctx.asset_name && (
              <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm text-ink">
                {t('asset')}: {resolveI18n(ctx.asset_name, lng)}
                {ctx.location_name ? ` · ${resolveI18n(ctx.location_name, lng)}` : ''}
              </p>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('what')}</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('whatPlaceholder')} maxLength={200} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('details')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                  placeholder={t('detailsPlaceholder')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('severity')}</label>
                <Select value={severity} onChange={(e) => setSeverity(e.target.value as Priority)}>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {tc(`severity.${s}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('reporter')}</label>
                <Input value={reporter} onChange={(e) => setReporter(e.target.value)} placeholder={t('reporterPlaceholder')} maxLength={200} />
              </div>
              <Turnstile key={captchaKey} onToken={setCaptchaToken} action="public_report" />
              {error && <p role="alert" className="text-sm text-status-crit">{error}</p>}
              <Button type="submit" loading={busy} disabled={!title.trim()} className="w-full justify-center">
                {t('submit')}
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
