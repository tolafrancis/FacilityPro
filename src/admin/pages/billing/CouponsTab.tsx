import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus } from 'lucide-react';
import { useAdmin } from '../../AdminContext';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { formatMoney } from '../../lib/format';
import { CURRENCIES, rpc, useAdminAction } from '../../lib/tenants';
import { CouponFormSchema, useCoupons, type Coupon } from '../../lib/billing';
import { Field } from './shared';

export default function CouponsTab() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { can } = useAdmin();
  const coupons = useCoupons();
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);

  if (coupons.isError) return <ErrorState message={t('errors.load')} onRetry={() => void coupons.refetch()} retryLabel={t('retry')} />;
  const rows = coupons.data ?? [];
  const expired = (c: Coupon) => !!c.expires_at && new Date(c.expires_at) < new Date();
  const usedUp = (c: Coupon) => c.max_redemptions != null && c.redemptions >= c.max_redemptions;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-ink-muted">{t('billing.couponsHint')}</p>
        {can('billing.manage') && <Button onClick={() => setEditing('new')}><Plus size={15} aria-hidden /> {t('billing.newCoupon')}</Button>}
      </div>
      <Card>
        {coupons.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('billing.noCoupons')} />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-5 py-2 font-medium">{t('billing.coupon')}</th>
                  <th className="px-3 py-2 font-medium">{t('billing.discount')}</th>
                  <th className="px-3 py-2 font-medium">{t('billing.duration')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('billing.redeemed')}</th>
                  <th className="px-3 py-2 font-medium">{t('billing.expires')}</th>
                  <th className="px-5 py-2"><span className="sr-only">{t('tenant.users.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.code} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      <code className="font-semibold text-ink">{c.code}</code>
                      {!c.active ? <span className="ml-2"><Badge>{t('billing.inactive')}</Badge></span>
                        : expired(c) ? <span className="ml-2"><Badge tone="warn">{t('billing.expired')}</Badge></span>
                        : usedUp(c) ? <span className="ml-2"><Badge tone="warn">{t('billing.usedUp')}</Badge></span>
                        : <span className="ml-2"><Badge tone="ok">{t('billing.live')}</Badge></span>}
                      {c.description && <p className="text-xs text-ink-muted">{c.description}</p>}
                    </td>
                    <td className="px-3 py-2.5">{c.percent_off != null ? `${c.percent_off}%` : formatMoney(c.amount_off ?? 0, c.currency ?? 'USD', lng)}</td>
                    <td className="px-3 py-2.5">{c.duration === 'repeating' ? t('billing.durations.months', { count: c.duration_months ?? 0 }) : t(`billing.durations.${c.duration}`)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.redemptions}{c.max_redemptions != null && ` / ${c.max_redemptions}`}</td>
                    <td className="px-3 py-2.5 text-ink-muted">{c.expires_at ? new Date(c.expires_at).toLocaleDateString(lng) : '—'}</td>
                    <td className="px-5 py-2.5 text-right">
                      {can('billing.manage') && (
                        <button type="button" onClick={() => setEditing(c)} aria-label={t('billing.editCoupon', { code: c.code })} className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink">
                          <Pencil size={15} aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <CouponDialog coupon={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CouponDialog({ coupon, onClose }: { coupon: Coupon | null; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [f, setF] = useState({
    code: coupon?.code ?? '',
    description: coupon?.description ?? '',
    kind: coupon?.amount_off != null ? 'amount' : 'percent',
    value: String(coupon?.percent_off ?? coupon?.amount_off ?? ''),
    currency: coupon?.currency ?? 'USD',
    duration: coupon?.duration ?? 'once',
    duration_months: coupon?.duration_months != null ? String(coupon.duration_months) : '',
    max_redemptions: coupon?.max_redemptions != null ? String(coupon.max_redemptions) : '',
    expires_at: coupon?.expires_at ? coupon.expires_at.slice(0, 10) : '',
    active: coupon?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminAction((p: Record<string, unknown>) => rpc('fp_admin_save_coupon', { p }), t('billing.toast.couponSaved'));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => (errors[k] ? t(`billing.errors.${errors[k]}`, { defaultValue: t('tenants.form.errors.required') }) : undefined);
  const locked = !!coupon; // the discount itself can't change once created

  const submit = () => {
    const r = CouponFormSchema.safeParse(f);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    const v = r.data;
    save.mutate({
      code: v.code, description: v.description,
      percent_off: v.kind === 'percent' ? v.value : null, amount_off: v.kind === 'amount' ? v.value : null, currency: v.currency,
      duration: v.duration, duration_months: v.duration_months === '' ? null : v.duration_months,
      max_redemptions: v.max_redemptions === '' ? null : v.max_redemptions,
      expires_at: v.expires_at ? new Date(`${v.expires_at}T23:59:59`).toISOString() : null, active: v.active,
    }, { onSuccess: onClose });
  };

  return (
    <Modal title={coupon ? t('billing.editCoupon', { code: coupon.code }) : t('billing.newCoupon')} onClose={onClose} closeLabel={t('close')} wide>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="cp-code" label={t('billing.coupon')} error={err('code')} hint={t('billing.couponCodeHint')}>
            <Input id="cp-code" value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase() }))} disabled={locked} />
          </Field>
          <Field id="cp-desc" label={t('billing.description')}><Input id="cp-desc" value={f.description} maxLength={200} onChange={set('description')} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="cp-kind" label={t('billing.discount')}>
            <Select id="cp-kind" value={f.kind} onChange={set('kind')} disabled={locked}>
              <option value="percent">{t('billing.percentOff')}</option>
              <option value="amount">{t('billing.amountOff')}</option>
            </Select>
          </Field>
          <Field id="cp-value" label={f.kind === 'percent' ? '%' : t('billing.cols.amount')} error={err('value')}>
            <Input id="cp-value" type="number" min="0" step="0.01" value={f.value} onChange={set('value')} disabled={locked} />
          </Field>
          {f.kind === 'amount' && (
            <Field id="cp-cur" label={t('billing.cols.currency')}>
              <Select id="cp-cur" value={f.currency} onChange={set('currency')} disabled={locked}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
            </Field>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="cp-dur" label={t('billing.duration')}>
            <Select id="cp-dur" value={f.duration} onChange={set('duration')} disabled={locked}>
              {(['once', 'repeating', 'forever'] as const).map((d) => <option key={d} value={d}>{t(`billing.durations.${d}`)}</option>)}
            </Select>
          </Field>
          {f.duration === 'repeating' && (
            <Field id="cp-months" label={t('billing.months')} error={err('duration_months')}>
              <Input id="cp-months" type="number" min="1" max="36" value={f.duration_months} onChange={set('duration_months')} disabled={locked} />
            </Field>
          )}
          <Field id="cp-max" label={t('billing.maxRedemptions')} error={err('max_redemptions')}>
            <Input id="cp-max" type="number" min="1" value={f.max_redemptions} onChange={set('max_redemptions')} placeholder={t('tenant.unlimited')} />
          </Field>
          <Field id="cp-exp" label={t('billing.expires')}>
            <Input id="cp-exp" type="date" value={f.expires_at} onChange={set('expires_at')} />
          </Field>
        </div>
        {locked && <p className="text-xs text-ink-muted">{t('billing.couponLocked')}</p>}
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={f.active} onChange={(e) => setF((x) => ({ ...x, active: e.target.checked }))} className="accent-[#E8552D]" />
          {t('billing.couponActive')}
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button onClick={submit} loading={save.isPending}>{t('save')}</Button>
      </div>
    </Modal>
  );
}
