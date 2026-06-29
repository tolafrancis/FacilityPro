import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAssets, useOrgMembers, usePlans, useSubscription } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDateOnly } from '../lib/ui';
import type { Plan } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import BilingualName from '../components/ui/BilingualName';

function periodEnd(interval: 'month' | 'year'): string {
  const d = new Date();
  if (interval === 'year') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export default function Billing() {
  const { t, i18n } = useTranslation('billing');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg, role } = useOrg();
  const orgId = currentOrg?.id;
  const isAdmin = role === 'org_admin';
  const queryClient = useQueryClient();

  const plansQuery = usePlans();
  const subQuery = useSubscription();
  const assets = useAssets();
  const members = useOrgMembers();
  const [editing, setEditing] = useState<Plan | null>(null);

  const plans = plansQuery.data ?? [];
  const sub = subQuery.data;
  const currentPlan =
    plans.find((p) => p.code === sub?.plan_code) ?? plans.find((p) => p.code === 'free') ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['subscription', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['plans'] });
  };

  const setPlan = useMutation({
    mutationFn: async (v: { code: string; status: 'pending' | 'active' | 'canceled'; interval?: 'month' | 'year' }) => {
      const payload: Record<string, unknown> = {
        org_id: orgId,
        plan_code: v.code,
        status: v.status,
        provider: 'paypal',
      };
      if (v.status === 'active') {
        payload.current_period_start = new Date().toISOString();
        payload.current_period_end = periodEnd(v.interval ?? 'month');
      }
      const { error } = await supabase
        .from('fp_subscriptions')
        .upsert(payload, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('fp_subscriptions')
        .update({ status: 'canceled' })
        .eq('org_id', orgId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const subscribe = (plan: Plan) => {
    if (plan.payment_url) window.open(plan.payment_url, '_blank', 'noopener');
    setPlan.mutate({ code: plan.code, status: 'pending' });
  };

  const limit = (n?: number) => (n == null ? t('limitsUnlimited') : String(n));
  const usageRow = (label: string, used: number, max?: number) => {
    const over = max != null && used > max;
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className={over ? 'font-medium text-status-crit' : 'text-ink'}>
          {used} / {limit(max)}
        </span>
      </div>
    );
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>

      {/* Current subscription */}
      <section className="mt-6 rounded-xl border border-line bg-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-ink-muted">{t('currentPlan')}</p>
            <p className="mt-0.5 text-lg font-semibold text-ink">
              {currentPlan ? resolveI18n(currentPlan.name_i18n, lng) : '—'}
            </p>
          </div>
          <Pill
            className={
              sub?.status === 'active'
                ? 'bg-status-ok/10 text-status-ok'
                : sub?.status === 'pending'
                  ? 'bg-status-warn/15 text-status-warn'
                  : 'bg-surface text-ink-muted'
            }
          >
            {t(`statusLabels.${sub?.status ?? 'active'}`)}
          </Pill>
        </div>
        {sub?.current_period_end && sub.status === 'active' && (
          <p className="mt-2 text-xs text-ink-muted">
            {t('renews')}: {formatDateOnly(sub.current_period_end, lng)}
          </p>
        )}

        <div className="mt-4 space-y-1 border-t border-line pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('usage')}</p>
          {usageRow(t('assets'), assets.data?.length ?? 0, currentPlan?.limits.assets)}
          {usageRow(t('members'), members.data?.length ?? 0, currentPlan?.limits.members)}
        </div>

        {isAdmin && sub?.status === 'pending' && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-brand-50 p-3">
            <p className="flex-1 text-xs text-brand-600">{t('pendingNote')}</p>
            <Button
              onClick={() => {
                const p = plans.find((x) => x.code === sub.plan_code);
                setPlan.mutate({
                  code: sub.plan_code as string,
                  status: 'active',
                  interval: p?.interval ?? 'month',
                });
              }}
            >
              {t('markActive')}
            </Button>
          </div>
        )}
        {isAdmin && sub && sub.status !== 'canceled' && (
          <button
            type="button"
            onClick={() => cancel.mutate()}
            className="mt-3 text-xs font-medium text-ink-muted hover:text-status-crit"
          >
            {t('cancel')}
          </button>
        )}
      </section>

      {/* Plan cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = currentPlan?.code === plan.code && sub?.status === 'active';
          return (
            <div key={plan.code} className="flex flex-col rounded-xl border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink">{resolveI18n(plan.name_i18n, lng)}</p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setEditing(plan)}
                    className="text-ink-muted hover:text-ink"
                    aria-label={t('editPlan')}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {plan.price > 0 ? `${plan.currency} ${plan.price}` : tc('free') }
                {plan.price > 0 && (
                  <span className="text-sm font-normal text-ink-muted">
                    {plan.interval === 'year' ? t('perYear') : t('perMonth')}
                  </span>
                )}
              </p>
              <ul className="mt-3 flex-1 space-y-1 text-sm text-ink-muted">
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-status-ok" /> {t('assets')}: {limit(plan.limits.assets)}
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-status-ok" /> {t('members')}: {limit(plan.limits.members)}
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-status-ok" /> {t('sites')}: {limit(plan.limits.sites)}
                </li>
              </ul>
              <div className="mt-4">
                {isCurrent ? (
                  <Button variant="secondary" disabled className="w-full justify-center">
                    {t('current')}
                  </Button>
                ) : isAdmin ? (
                  <Button
                    onClick={() => subscribe(plan)}
                    disabled={!plan.payment_url}
                    className="w-full justify-center"
                  >
                    {plan.payment_url ? (
                      <>
                        {t('choose')} <ExternalLink size={14} />
                      </>
                    ) : (
                      t('linkMissing')
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <PlanDialog
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
          t={t}
          tc={tc}
        />
      )}
    </div>
  );
}

function PlanDialog({
  plan,
  onClose,
  onSaved,
  t,
  tc,
}: {
  plan: Plan;
  onClose: () => void;
  onSaved: () => void;
  t: (k: string) => string;
  tc: (k: string) => string;
}) {
  const [en, setEn] = useState(plan.name_i18n.en ?? '');
  const [vi, setVi] = useState(plan.name_i18n.vi ?? '');
  const [price, setPrice] = useState(String(plan.price));
  const [currency, setCurrency] = useState(plan.currency);
  const [interval, setInterval] = useState<'month' | 'year'>(plan.interval);
  const [assets, setAssets] = useState(plan.limits.assets != null ? String(plan.limits.assets) : '');
  const [members, setMembers] = useState(plan.limits.members != null ? String(plan.limits.members) : '');
  const [sites, setSites] = useState(plan.limits.sites != null ? String(plan.limits.sites) : '');
  const [paymentUrl, setPaymentUrl] = useState(plan.payment_url ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const limits: Record<string, number> = {};
      if (assets !== '') limits.assets = parseInt(assets, 10);
      if (members !== '') limits.members = parseInt(members, 10);
      if (sites !== '') limits.sites = parseInt(sites, 10);
      const { error } = await supabase
        .from('fp_plans')
        .update({
          name_i18n: { en, vi: vi || en },
          price: parseFloat(price) || 0,
          currency,
          interval,
          limits,
          payment_url: paymentUrl || null,
        })
        .eq('code', plan.code);
      if (error) throw error;
    },
    onSuccess: onSaved,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{t('dialog.title')}</h2>
        <div className="mt-4 space-y-3">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('dialog.price')}</label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                {t('dialog.currency')}
              </label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                {t('dialog.interval')}
              </label>
              <Select value={interval} onChange={(e) => setInterval(e.target.value as 'month' | 'year')}>
                <option value="month">{t('dialog.month')}</option>
                <option value="year">{t('dialog.year')}</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                {t('dialog.limitAssets')}
              </label>
              <Input type="number" value={assets} onChange={(e) => setAssets(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                {t('dialog.limitMembers')}
              </label>
              <Input type="number" value={members} onChange={(e) => setMembers(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                {t('dialog.limitSites')}
              </label>
              <Input type="number" value={sites} onChange={(e) => setSites(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-ink-muted">{t('dialog.limitHint')}</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              {t('dialog.paymentUrl')}
            </label>
            <Input
              value={paymentUrl}
              onChange={(e) => setPaymentUrl(e.target.value)}
              placeholder="https://www.paypal.com/..."
            />
            <p className="mt-1 text-xs text-ink-muted">{t('dialog.paymentHint')}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" loading={save.isPending}>
            {tc('actions.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
