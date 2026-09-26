import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CreditCard, Pencil, Plus } from 'lucide-react';
import { useAdmin } from '../../AdminContext';
import { Badge, Card, ErrorState, Skeleton } from '../../components/ui';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { formatMoney } from '../../lib/format';
import { CURRENCIES, rpc, useAdminAction } from '../../lib/tenants';
import { PlanFormSchema, planFormToPayload, useAdminPlans, type AdminPlan, type PlanForm } from '../../lib/billing';
import { resolveI18n } from '../../../i18n/resolver';
import { Field } from './shared';

export default function PlansTab() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { can } = useAdmin();
  const plans = useAdminPlans();
  const [editing, setEditing] = useState<AdminPlan | 'new' | null>(null);

  if (plans.isError) return <ErrorState message={t('errors.load')} onRetry={() => void plans.refetch()} retryLabel={t('retry')} />;
  const limit = (v: number | undefined) => (v == null ? t('tenant.unlimited') : String(v));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-ink-muted">{t('billing.plansHint')}</p>
        {can('billing.manage') && <Button onClick={() => setEditing('new')}><Plus size={15} aria-hidden /> {t('billing.newPlan')}</Button>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
        {(plans.data ?? []).map((p) => {
          const stripeOk = !!(p.stripe_price_month || p.stripe_price_year);
          const paypalOk = !!(p.paypal_plan_month || p.paypal_plan_year);
          return (
            <Card key={p.code}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold text-ink">{resolveI18n(p.name_i18n, lng)}</p>
                  <p className="text-xs text-ink-muted"><code>{p.code}</code></p>
                </div>
                <div className="flex items-center gap-1">
                  {!p.active && <Badge>{t('billing.inactive')}</Badge>}
                  {can('billing.manage') && (
                    <button type="button" onClick={() => setEditing(p)} aria-label={t('billing.editPlan', { name: p.code })} className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink">
                      <Pencil size={15} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-ink">
                {p.price > 0 ? formatMoney(p.price, p.currency, lng) : t('billing.freePrice')}
                {p.price > 0 && <span className="text-sm font-normal text-ink-muted"> {t('tenant.perMonth')}</span>}
              </p>
              {p.price_year != null && p.price_year > 0 && (
                <p className="text-xs text-ink-muted">{t('billing.yearlyPrice', { value: formatMoney(p.price_year, p.currency, lng) })}</p>
              )}
              <ul className="mt-3 space-y-1 text-sm text-ink">
                <li>{t('billing.limitAssets')}: {limit(p.limits.assets)}</li>
                <li>{t('billing.limitMembers')}: {limit(p.limits.members)}</li>
                <li>{t('billing.limitSites')}: {limit(p.limits.sites)}</li>
                {p.features.map((f) => <li key={f} className="flex items-center gap-1.5 text-ink-muted"><Check size={13} className="text-status-ok" aria-hidden />{f}</li>)}
              </ul>
              {p.price > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  <Badge tone={stripeOk ? 'ok' : 'neutral'}><CreditCard size={12} aria-hidden /> Stripe {stripeOk ? '✓' : '—'}</Badge>
                  <Badge tone={paypalOk ? 'ok' : 'neutral'}>PayPal {paypalOk ? '✓' : '—'}</Badge>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PlanDialog({ plan, onClose }: { plan: AdminPlan | null; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [f, setF] = useState<Record<keyof PlanForm, string | boolean>>({
    code: plan?.code ?? '',
    name_en: plan?.name_i18n.en ?? '',
    name_vi: plan?.name_i18n.vi ?? '',
    price: String(plan?.price ?? ''),
    price_year: plan?.price_year != null ? String(plan.price_year) : '',
    currency: plan?.currency ?? 'USD',
    assets: plan?.limits.assets != null ? String(plan.limits.assets) : '',
    members: plan?.limits.members != null ? String(plan.limits.members) : '',
    sites: plan?.limits.sites != null ? String(plan.limits.sites) : '',
    features: (plan?.features ?? []).join('\n'),
    stripe_price_month: plan?.stripe_price_month ?? '',
    stripe_price_year: plan?.stripe_price_year ?? '',
    paypal_plan_month: plan?.paypal_plan_month ?? '',
    paypal_plan_year: plan?.paypal_plan_year ?? '',
    active: plan?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminAction((p: ReturnType<typeof planFormToPayload>) => rpc('fp_admin_save_plan', { p }), t('billing.toast.planSaved'));
  const set = (k: keyof PlanForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => (errors[k] ? t(`billing.errors.${errors[k]}`, { defaultValue: t('tenants.form.errors.required') }) : undefined);

  const submit = () => {
    const r = PlanFormSchema.safeParse(f);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(planFormToPayload(r.data), { onSuccess: onClose });
  };

  return (
    <Modal title={plan ? t('billing.editPlanTitle', { name: plan.name_i18n.en ?? plan.code }) : t('billing.newPlan')} onClose={onClose} closeLabel={t('close')} wide>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="pl-code" label={t('billing.planCode')} error={err('code')} hint={plan ? undefined : t('billing.planCodeHint')}>
            <Input id="pl-code" value={String(f.code)} onChange={set('code')} disabled={!!plan} />
          </Field>
          <Field id="pl-en" label={t('billing.nameEn')} error={err('name_en')}><Input id="pl-en" value={String(f.name_en)} onChange={set('name_en')} /></Field>
          <Field id="pl-vi" label={t('billing.nameVi')}><Input id="pl-vi" value={String(f.name_vi)} onChange={set('name_vi')} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="pl-price" label={t('billing.priceMonth')} error={err('price')}><Input id="pl-price" type="number" min="0" step="0.01" value={String(f.price)} onChange={set('price')} /></Field>
          <Field id="pl-year" label={t('billing.priceYear')} error={err('price_year')} hint={t('billing.priceYearHint')}><Input id="pl-year" type="number" min="0" step="0.01" value={String(f.price_year)} onChange={set('price_year')} /></Field>
          <Field id="pl-cur" label={t('billing.cols.currency')}>
            <Select id="pl-cur" value={String(f.currency)} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="pl-assets" label={t('billing.limitAssets')} error={err('assets')}><Input id="pl-assets" inputMode="numeric" value={String(f.assets)} onChange={set('assets')} placeholder={t('tenant.unlimited')} /></Field>
          <Field id="pl-members" label={t('billing.limitMembers')} error={err('members')}><Input id="pl-members" inputMode="numeric" value={String(f.members)} onChange={set('members')} placeholder={t('tenant.unlimited')} /></Field>
          <Field id="pl-sites" label={t('billing.limitSites')} error={err('sites')}><Input id="pl-sites" inputMode="numeric" value={String(f.sites)} onChange={set('sites')} placeholder={t('tenant.unlimited')} /></Field>
        </div>
        <Field id="pl-features" label={t('billing.features')} hint={t('billing.featuresHint')}>
          <textarea id="pl-features" rows={3} value={String(f.features)} onChange={set('features')}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
        </Field>
        <div className="rounded-lg border border-line p-3">
          <p className="text-sm font-medium text-ink">{t('billing.providerIds')}</p>
          <p className="mb-3 text-xs text-ink-muted">{t('billing.providerIdsHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pl-sm" label={t('billing.stripeMonth')} error={err('stripe_price_month')}><Input id="pl-sm" value={String(f.stripe_price_month)} onChange={set('stripe_price_month')} placeholder="price_…" /></Field>
            <Field id="pl-sy" label={t('billing.stripeYear')} error={err('stripe_price_year')}><Input id="pl-sy" value={String(f.stripe_price_year)} onChange={set('stripe_price_year')} placeholder="price_…" /></Field>
            <Field id="pl-pm" label={t('billing.paypalMonth')} error={err('paypal_plan_month')}><Input id="pl-pm" value={String(f.paypal_plan_month)} onChange={set('paypal_plan_month')} placeholder="P-…" /></Field>
            <Field id="pl-py" label={t('billing.paypalYear')} error={err('paypal_plan_year')}><Input id="pl-py" value={String(f.paypal_plan_year)} onChange={set('paypal_plan_year')} placeholder="P-…" /></Field>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={!!f.active} onChange={(e) => setF((x) => ({ ...x, active: e.target.checked }))} className="accent-[#E8552D]" />
          {t('billing.activeHint')}
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button onClick={submit} loading={save.isPending}>{t('save')}</Button>
      </div>
    </Modal>
  );
}
