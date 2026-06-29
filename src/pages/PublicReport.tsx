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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !org) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('fp_public_report', {
      p_org: org,
      p_title: title.trim(),
      p_body: description.trim() || null,
      p_severity: severity,
      p_lng: lng,
      p_asset: asset,
      p_location: location,
      p_reporter: reporter.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
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
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('whatPlaceholder')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">{t('details')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
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
                <Input value={reporter} onChange={(e) => setReporter(e.target.value)} placeholder={t('reporterPlaceholder')} />
              </div>
              {error && <p className="text-sm text-status-crit">{error}</p>}
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
