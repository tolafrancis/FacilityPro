import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { LOGO_TYPES, orgLogoUrl, uploadOrgLogo } from '../../lib/orgLogo';
import { resolveI18n } from '../../i18n/resolver';
import { CURRENCIES, INDUSTRIES, TenantFormSchema, rpc, useAdminAction, usePlans, type TenantDetail, type TenantForm } from '../lib/tenants';

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'UTC'];
  }
})();

/**
 * Create a tenant (company, contact, plan and trial, owner invite) or edit
 * one (profile and branding; plan changes are a separate action).
 */
export default function TenantFormDialog({ tenant, onClose, onCreated }: {
  tenant?: TenantDetail;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const plans = usePlans();
  const editing = !!tenant;
  const o = tenant?.org;
  const [form, setForm] = useState<TenantForm>({
    name: o?.name ?? '',
    industry: (o?.industry as TenantForm['industry']) ?? '',
    default_lng: (o?.default_lng as 'en' | 'vi') ?? 'en',
    contact_name: o?.contact_name ?? '',
    contact_email: o?.contact_email ?? '',
    contact_phone: o?.contact_phone ?? '',
    address: o?.address ?? '',
    timezone: o?.timezone ?? 'Asia/Ho_Chi_Minh',
    currency: (o?.currency as TenantForm['currency']) ?? 'VND',
    subdomain: o?.subdomain ?? '',
    brand_color: o?.brand_color ?? '',
    plan_code: 'pro',
    billing_interval: 'month',
    trial_days: 14,
    owner_email: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logoPath, setLogoPath] = useState<string | null>(o?.logo_path ?? null);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof TenantForm>(k: K, v: TenantForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const create = useAdminAction(async (f: TenantForm) => rpc<string>('fp_admin_create_tenant', { p: f }), t('tenants.toast.created'));
  const update = useAdminAction(async (f: Record<string, unknown>) => rpc('fp_admin_update_tenant', { p_org: o!.id, p: f }), t('tenants.toast.saved'));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = TenantFormSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = t(`tenants.form.errors.${issue.message}`, { defaultValue: t('tenants.form.errors.invalid') });
      setErrors(errs);
      return;
    }
    setErrors({});
    const data = parsed.data;
    if (editing) {
      const { plan_code: _p, billing_interval: _b, trial_days: _t, owner_email: _o, ...profile } = data;
      await update.mutateAsync({ ...profile, logo_path: logoPath ?? '' });
      onClose();
    } else {
      const id = await create.mutateAsync(data);
      onCreated?.(id as string);
      onClose();
    }
  };

  const onLogo = async (file: File | undefined) => {
    if (!file || !o) return;
    setUploading(true);
    try {
      setLogoPath(await uploadOrgLogo(o.id, file, logoPath, false));
    } catch (err) {
      setErrors((x) => ({ ...x, logo: t(`tenants.form.errors.${err instanceof Error ? err.message : 'invalid'}`, { defaultValue: t('tenants.form.errors.invalid') }) }));
    }
    setUploading(false);
  };

  const planOptions = useMemo(() => (plans.data ?? []).filter((p) => p.active), [plans.data]);
  const busy = create.isPending || update.isPending;
  const logoUrl = orgLogoUrl(logoPath);

  return (
    <Modal title={editing ? t('tenants.form.editTitle') : t('tenants.form.createTitle')} onClose={onClose} closeLabel={t('close')} wide>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Section title={t('tenants.form.company')}>
          <Field id="tf-name" label={t('tenants.form.name')} error={errors.name} required>
            <Input id="tf-name" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} autoFocus />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="tf-industry" label={t('tenants.form.industry')}>
              <Select id="tf-industry" value={form.industry ?? ''} onChange={(e) => set('industry', e.target.value as TenantForm['industry'])}>
                <option value="">—</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{t(`industries.${i}`)}</option>)}
              </Select>
            </Field>
            <Field id="tf-lng" label={t('tenants.form.language')}>
              <Select id="tf-lng" value={form.default_lng} onChange={(e) => set('default_lng', e.target.value as 'en' | 'vi')}>
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
              </Select>
            </Field>
          </div>
        </Section>

        <Section title={t('tenants.form.contact')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="tf-cname" label={t('tenants.form.contactName')} error={errors.contact_name}>
              <Input id="tf-cname" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} maxLength={120} />
            </Field>
            <Field id="tf-cemail" label={t('tenants.form.contactEmail')} error={errors.contact_email}>
              <Input id="tf-cemail" type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} maxLength={120} />
            </Field>
            <Field id="tf-cphone" label={t('tenants.form.contactPhone')} error={errors.contact_phone}>
              <Input id="tf-cphone" type="tel" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} maxLength={40} />
            </Field>
            <Field id="tf-address" label={t('tenants.form.address')} error={errors.address}>
              <Input id="tf-address" value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={500} />
            </Field>
          </div>
        </Section>

        <Section title={t('tenants.form.regional')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="tf-tz" label={t('tenants.form.timezone')}>
              <Select id="tf-tz" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
              </Select>
            </Field>
            <Field id="tf-cur" label={t('tenants.form.currency')}>
              <Select id="tf-cur" value={form.currency} onChange={(e) => set('currency', e.target.value as TenantForm['currency'])}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title={t('tenants.form.branding')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="tf-sub" label={t('tenants.form.subdomain')} error={errors.subdomain} hint={form.subdomain ? `${form.subdomain}.facilitypro.tech` : t('tenants.form.subdomainHint')}>
              <Input id="tf-sub" value={form.subdomain} onChange={(e) => set('subdomain', e.target.value.toLowerCase())} maxLength={42} placeholder="acme" />
            </Field>
            <Field id="tf-color" label={t('tenants.form.brandColor')} error={errors.brand_color}>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={t('tenants.form.brandColor')} value={form.brand_color || '#E8552D'} onChange={(e) => set('brand_color', e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded border border-line bg-panel" />
                <Input id="tf-color" value={form.brand_color} onChange={(e) => set('brand_color', e.target.value)} placeholder="#E8552D" maxLength={7} />
              </div>
            </Field>
          </div>
          {editing && (
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface">
                {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" /> : <ImagePlus size={20} className="text-ink-muted" aria-hidden />}
              </div>
              <label className="cursor-pointer text-sm font-medium text-brand hover:text-brand-600">
                {uploading ? t('loading') : logoUrl ? t('tenants.form.changeLogo') : t('tenants.form.uploadLogo')}
                <input type="file" accept={LOGO_TYPES.join(',')} className="sr-only" onChange={(e) => void onLogo(e.target.files?.[0])} />
              </label>
              {logoUrl && (
                <button type="button" onClick={() => setLogoPath(null)} className="text-xs text-ink-muted underline hover:text-ink">{t('tenants.form.removeLogo')}</button>
              )}
              {errors.logo && <p className="text-xs text-status-crit">{errors.logo}</p>}
            </div>
          )}
        </Section>

        {!editing && (
          <Section title={t('tenants.form.subscription')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="tf-plan" label={t('tenants.form.plan')}>
                <Select id="tf-plan" value={form.plan_code} onChange={(e) => set('plan_code', e.target.value)}>
                  {planOptions.map((p) => <option key={p.code} value={p.code}>{resolveI18n(p.name_i18n, lng)}</option>)}
                </Select>
              </Field>
              <Field id="tf-interval" label={t('tenants.form.interval')}>
                <Select id="tf-interval" value={form.billing_interval} onChange={(e) => set('billing_interval', e.target.value as 'month' | 'year')}>
                  <option value="month">{t('tenants.form.monthly')}</option>
                  <option value="year">{t('tenants.form.yearly')}</option>
                </Select>
              </Field>
              <Field id="tf-trial" label={t('tenants.form.trialDays')} error={errors.trial_days}>
                <Input id="tf-trial" type="number" inputMode="numeric" min={0} max={90} value={String(form.trial_days ?? 0)} onChange={(e) => set('trial_days', Number(e.target.value))} />
              </Field>
            </div>
            <Field id="tf-owner" label={t('tenants.form.ownerEmail')} error={errors.owner_email} hint={t('tenants.form.ownerHint')}>
              <Input id="tf-owner" type="email" value={form.owner_email} onChange={(e) => set('owner_email', e.target.value)} maxLength={120} />
            </Field>
          </Section>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" loading={busy}>{editing ? t('save') : t('tenants.form.create')}</Button>
        </div>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ id, label, error, hint, required, children }: { id: string; label: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-status-crit"> *</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-status-crit">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
