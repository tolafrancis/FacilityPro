import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Badge, Card, ErrorState, PageHeader, Skeleton } from '../components/ui';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { rpc, useAdminAction } from '../lib/tenants';
import {
  VERSION, compareVersions, renderTemplate, unknownPlaceholders, usePlatformSettings, useTemplates, type PlatformSettings, type Template,
} from '../lib/appmanagement';
import { Field } from './billing/shared';

const TABS = ['general', 'maintenance', 'mobile', 'templates'] as const;
type Tab = (typeof TABS)[number];
const TIMEZONES = ['Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Jakarta', 'Asia/Manila', 'Asia/Kuala_Lumpur', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Australia/Sydney', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'UTC'];
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export default function AppSettings() {
  const { t } = useTranslation('admin');
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'general';
  const settings = usePlatformSettings();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('nav.items.settings')} description={t('appSettings.subtitle')} />
      <div role="tablist" aria-label={t('appSettings.tabsLabel')} className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} onClick={() => setParams(x === 'general' ? {} : { tab: x }, { replace: true })}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === x ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}>
            {t(`appSettings.tabs.${x}`)}
            {x === 'maintenance' && settings.data?.maintenance_mode && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle" aria-label={t('appSettings.maintenanceOn')} />}
          </button>
        ))}
      </div>
      {tab === 'templates' ? <Templates /> : settings.isError ? (
        <ErrorState message={t('errors.load')} onRetry={() => void settings.refetch()} retryLabel={t('retry')} />
      ) : !settings.data ? <Skeleton className="h-80" /> : (
        <SettingsForm key={`${tab}-${settings.data.updated_at}`} tab={tab} s={settings.data} />
      )}
    </div>
  );
}

function SettingsForm({ tab, s }: { tab: Exclude<Tab, 'templates'>; s: PlatformSettings }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [f, setF] = useState({
    app_name: s.app_name, default_lng: s.default_lng, supported_lngs: s.supported_lngs, default_timezone: s.default_timezone,
    email_from_name: s.email_from_name, email_from_address: s.email_from_address ?? '', support_email: s.support_email ?? '',
    maintenance_mode: s.maintenance_mode, maintenance_message: s.maintenance_message ?? '', maintenance_until: toLocal(s.maintenance_until),
    mobile_min_version: s.mobile_min_version ?? '', mobile_latest_version: s.mobile_latest_version ?? '', mobile_force_update: s.mobile_force_update,
  });
  const save = useAdminAction((p: Record<string, unknown>) => rpc('fp_admin_save_settings', { p }), t('appSettings.toast.saved'));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const email = (v: string) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

  if (tab === 'general') {
    const valid = f.app_name.trim() && f.supported_lngs.length && f.supported_lngs.includes(f.default_lng) && email(f.email_from_address) && email(f.support_email);
    return (
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="st-name" label={t('appSettings.appName')}><Input id="st-name" value={f.app_name} maxLength={60} onChange={(e) => set('app_name', e.target.value)} /></Field>
          <Field id="st-tz" label={t('appSettings.timezone')} hint={t('appSettings.timezoneHint')}>
            <Select id="st-tz" value={f.default_timezone} onChange={(e) => set('default_timezone', e.target.value)}>
              {[...new Set([f.default_timezone, ...TIMEZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
            </Select>
          </Field>
          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-ink">{t('appSettings.languages')}</legend>
            <div className="flex gap-4">
              {(['en', 'vi'] as const).map((l) => (
                <label key={l} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" className="accent-[#E8552D]" checked={f.supported_lngs.includes(l)}
                    onChange={(e) => set('supported_lngs', e.target.checked ? [...f.supported_lngs, l] : f.supported_lngs.filter((x) => x !== l))} />
                  {t(`appSettings.lng.${l}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="st-lng" label={t('appSettings.defaultLanguage')} error={!f.supported_lngs.includes(f.default_lng) ? t('appSettings.defaultNotSupported') : undefined}>
            <Select id="st-lng" value={f.default_lng} onChange={(e) => set('default_lng', e.target.value)}>
              {(['en', 'vi'] as const).map((l) => <option key={l} value={l}>{t(`appSettings.lng.${l}`)}</option>)}
            </Select>
          </Field>
          <Field id="st-from" label={t('appSettings.fromName')}><Input id="st-from" value={f.email_from_name} onChange={(e) => set('email_from_name', e.target.value)} /></Field>
          <Field id="st-fromaddr" label={t('appSettings.fromAddress')} hint={t('appSettings.fromAddressHint')} error={!email(f.email_from_address) ? t('tenants.form.errors.email') : undefined}>
            <Input id="st-fromaddr" type="email" value={f.email_from_address} onChange={(e) => set('email_from_address', e.target.value)} placeholder="no-reply@facilitypro.tech" />
          </Field>
          <Field id="st-support" label={t('appSettings.supportEmail')} hint={t('appSettings.supportEmailHint')} error={!email(f.support_email) ? t('tenants.form.errors.email') : undefined}>
            <Input id="st-support" type="email" value={f.support_email} onChange={(e) => set('support_email', e.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate({
            app_name: f.app_name, default_lng: f.default_lng, supported_lngs: f.supported_lngs, default_timezone: f.default_timezone,
            email_from_name: f.email_from_name, email_from_address: f.email_from_address, support_email: f.support_email,
          })}>{t('save')}</Button>
        </div>
      </Card>
    );
  }

  if (tab === 'maintenance') {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4">
          <div>
            <p className="font-medium text-ink">{t('appSettings.maintenanceMode')}</p>
            <p className="text-sm text-ink-muted">{t('appSettings.maintenanceHint')}</p>
          </div>
          <Badge tone={s.maintenance_mode ? 'warn' : 'ok'}>{s.maintenance_mode ? t('appSettings.maintenanceOn') : t('appSettings.maintenanceOff')}</Badge>
        </div>
        <div className="mt-4 grid gap-4">
          <Field id="st-msg" label={t('appSettings.message')} hint={t('appSettings.messageHint')}>
            <textarea id="st-msg" rows={3} maxLength={500} value={f.maintenance_message} onChange={(e) => set('maintenance_message', e.target.value)}
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
          </Field>
          <Field id="st-until" label={t('appSettings.until')} hint={t('appSettings.untilHint')}>
            <Input id="st-until" type="datetime-local" value={f.maintenance_until} onChange={(e) => set('maintenance_until', e.target.value)} />
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{t('announcements.preview')}</p>
            <div className="rounded-lg border border-line bg-surface p-5 text-center">
              <Wrench size={22} className="mx-auto text-brand" aria-hidden />
              <p className="mt-2 font-semibold text-ink">{t('appSettings.previewTitle', { app: f.app_name })}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{f.maintenance_message || t('appSettings.previewDefault')}</p>
              {f.maintenance_until && <p className="mt-2 text-sm text-ink">{t('appSettings.previewUntil', { when: new Date(f.maintenance_until).toLocaleString(lng) })}</p>}
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate({ maintenance_message: f.maintenance_message, maintenance_until: f.maintenance_until ? new Date(f.maintenance_until).toISOString() : '' })}>
            {t('appSettings.saveMessage')}
          </Button>
          {s.maintenance_mode ? (
            <Button loading={save.isPending} onClick={() => save.mutate({ maintenance_mode: false, maintenance_until: '' })}>{t('appSettings.turnOff')}</Button>
          ) : (
            <Button variant="danger" loading={save.isPending} onClick={() => save.mutate({
              maintenance_mode: true, maintenance_message: f.maintenance_message,
              maintenance_until: f.maintenance_until ? new Date(f.maintenance_until).toISOString() : '',
            })}>{t('appSettings.turnOn')}</Button>
          )}
        </div>
      </Card>
    );
  }

  const bad = (v: string) => !!v && !VERSION.test(v);
  const order = f.mobile_min_version && f.mobile_latest_version && !bad(f.mobile_min_version) && !bad(f.mobile_latest_version) && compareVersions(f.mobile_min_version, f.mobile_latest_version) > 0;
  return (
    <Card description={t('appSettings.mobileHint')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="st-latest" label={t('appSettings.latestVersion')} error={bad(f.mobile_latest_version) ? t('appSettings.versionFormat') : undefined}>
          <Input id="st-latest" value={f.mobile_latest_version} onChange={(e) => set('mobile_latest_version', e.target.value.trim())} placeholder="1.4.2" />
        </Field>
        <Field id="st-min" label={t('appSettings.minVersion')} hint={t('appSettings.minVersionHint')}
          error={bad(f.mobile_min_version) ? t('appSettings.versionFormat') : order ? t('appSettings.versionOrder') : undefined}>
          <Input id="st-min" value={f.mobile_min_version} onChange={(e) => set('mobile_min_version', e.target.value.trim())} placeholder="1.2" />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="accent-[#E8552D]" checked={f.mobile_force_update} onChange={(e) => set('mobile_force_update', e.target.checked)} />
        {t('appSettings.forceUpdate')}
      </label>
      <div className="mt-5 flex justify-end">
        <Button disabled={bad(f.mobile_min_version) || bad(f.mobile_latest_version) || !!order} loading={save.isPending}
          onClick={() => save.mutate({ mobile_min_version: f.mobile_min_version, mobile_latest_version: f.mobile_latest_version, mobile_force_update: f.mobile_force_update })}>
          {t('save')}
        </Button>
      </div>
    </Card>
  );
}

function Templates() {
  const { t } = useTranslation('admin');
  const templates = useTemplates();
  const [selected, setSelected] = useState<string>('');
  const rows = templates.data ?? [];
  const current = rows.find((r) => `${r.key}|${r.channel}|${r.lng}` === selected) ?? rows[0];
  if (templates.isError) return <ErrorState message={t('errors.load')} onRetry={() => void templates.refetch()} retryLabel={t('retry')} />;
  if (templates.isLoading) return <Skeleton className="h-80" />;
  if (!current) return <Card><p className="text-sm text-ink-muted">{t('appSettings.noTemplates')}</p></Card>;
  return (
    <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
      <Card>
        <ul className="-mx-2 space-y-0.5">
          {rows.map((r) => {
            const id = `${r.key}|${r.channel}|${r.lng}`;
            const active = r === current;
            return (
              <li key={id}>
                <button type="button" onClick={() => setSelected(id)} aria-current={active}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${active ? 'bg-brand/10 text-ink' : 'text-ink-muted hover:bg-ink/5 hover:text-ink'}`}>
                  {t(`appSettings.templateNames.${r.key.replace('.', '_')}`, { defaultValue: r.key })}
                  <span className="ml-1 text-xs uppercase text-ink-muted">· {r.lng}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <TemplateEditor key={`${current.key}|${current.lng}|${current.updated_at}`} tpl={current} />
    </div>
  );
}

function TemplateEditor({ tpl }: { tpl: Template }) {
  const { t } = useTranslation('admin');
  const [subject, setSubject] = useState(tpl.subject ?? '');
  const [body, setBody] = useState(tpl.body);
  const sample: Record<string, string> = useMemo(() => ({ number: '1042', subject: 'QR codes not scanning', agent: 'Mai', message: t('appSettings.sampleMessage') }), [t]);
  const unknown = unknownPlaceholders(`${subject}\n${body}`, tpl.variables);
  const save = useAdminAction(async () => {
    const { error } = await supabase.from('fp_message_templates')
      .update({ subject, body, updated_at: new Date().toISOString() })
      .eq('key', tpl.key).eq('channel', tpl.channel).eq('lng', tpl.lng);
    if (error) throw error;
  }, t('appSettings.toast.templateSaved'));
  useEffect(() => { setSubject(tpl.subject ?? ''); setBody(tpl.body); }, [tpl]);
  return (
    <Card title={t(`appSettings.templateNames.${tpl.key.replace('.', '_')}`, { defaultValue: tpl.key })} description={t('appSettings.templateHint')}>
      <div className="space-y-3">
        <Field id="tp-subject" label={t('appSettings.subject')}><Input id="tp-subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field id="tp-body" label={t('appSettings.body')}
          hint={t('appSettings.variables', { list: tpl.variables.map((v) => `{{${v}}}`).join(', '), interpolation: { escapeValue: false } })}
          error={unknown.length ? t('appSettings.unknownVars', { list: unknown.join(', ') }) : undefined}>
          <textarea id="tp-body" rows={7} value={body} onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
        </Field>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{t('announcements.preview')}</p>
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-ink">{renderTemplate(subject, sample)}</p>
            <p className="mt-2 whitespace-pre-line text-sm text-ink">{renderTemplate(body, sample)}</p>
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { setSubject(tpl.subject ?? ''); setBody(tpl.body); }}>{t('appSettings.revert')}</Button>
        <Button disabled={!body.trim() || unknown.length > 0} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('save')}</Button>
      </div>
    </Card>
  );
}
