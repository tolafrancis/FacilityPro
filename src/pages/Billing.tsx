import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import {
  usePlanUsage,
  useIsPlatformAdmin,
  useJobHealth,
  useSystemChecks,
  usePlans,
  usePlatformSubscriptions,
  useSubscription,
} from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, formatDateOnly } from '../lib/ui';
import type { Plan, PlatformSubscription } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import BilingualName from '../components/ui/BilingualName';

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
  // The limits in force come from the database, the same ones it enforces.
  const usage = usePlanUsage().data;
  // Only the platform operator edits the shared plan catalogue and activates
  // subscriptions (after verifying payment); customers can only request.
  const isPlatformAdmin = useIsPlatformAdmin().data === true;
  const [editing, setEditing] = useState<Plan | null>(null);

  const plans = plansQuery.data ?? [];
  const sub = subQuery.data;
  const currentPlan =
    plans.find((p) => p.code === sub?.plan_code) ?? plans.find((p) => p.code === 'free') ?? null;
  const requestedPlan = plans.find((p) => p.code === sub?.requested_plan_code) ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['subscription', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['plans'] });
    void queryClient.invalidateQueries({ queryKey: ['platform_subscriptions'] });
  };

  const requestPlan = useMutation({
    meta: { errorHandled: true }, // shown inline below
    mutationFn: async (code: string) => {
      const { error } = await supabase.rpc('fp_request_plan', { p_org: orgId!, p_plan: code });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const requestCancel = useMutation({
    meta: { errorHandled: true }, // shown inline below
    mutationFn: async () => {
      const { error } = await supabase.rpc('fp_request_cancellation', { p_org: orgId! });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const subscribe = (plan: Plan) => {
    if (plan.payment_url) window.open(plan.payment_url, '_blank', 'noopener');
    requestPlan.mutate(plan.code);
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
        {sub?.status === 'trialing' && sub.current_period_end && (
          <p className={`mt-2 text-xs ${new Date(sub.current_period_end) < new Date() ? 'text-status-crit' : 'text-ink-muted'}`}>
            {new Date(sub.current_period_end) < new Date()
              ? t('trialEnded')
              : `${t('trialEnds')}: ${formatDateOnly(sub.current_period_end, lng)}`}
          </p>
        )}
        {sub?.current_period_end && sub.status === 'active' && (
          <p className="mt-2 text-xs text-ink-muted">
            {t('renews')}: {formatDateOnly(sub.current_period_end, lng)}
          </p>
        )}

        <div className="mt-4 space-y-1 border-t border-line pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('usage')}</p>
          {usageRow(t('assets'), usage?.assets.used ?? 0, usage?.assets.limit ?? undefined)}
          {usageRow(t('members'), usage?.members.used ?? 0, usage?.members.limit ?? undefined)}
          {usageRow(t('sites'), usage?.sites.used ?? 0, usage?.sites.limit ?? undefined)}
        </div>

        {requestedPlan && (
          <p className="mt-4 rounded-lg bg-brand-50 p-3 text-xs text-brand-600">
            {t('requestedNote', { plan: resolveI18n(requestedPlan.name_i18n, lng) })}
          </p>
        )}
        {sub?.cancel_requested_at && (
          <p className="mt-4 rounded-lg bg-surface p-3 text-xs text-ink-muted">{t('cancelRequestedNote')}</p>
        )}
        {(requestPlan.error || requestCancel.error) && (
          <p className="mt-3 text-xs text-status-crit">
            {((requestPlan.error ?? requestCancel.error) as Error).message}
          </p>
        )}
        {isAdmin && sub && sub.status !== 'canceled' && !sub.cancel_requested_at && (
          <button
            type="button"
            onClick={() => requestCancel.mutate()}
            disabled={requestCancel.isPending}
            className="mt-3 text-xs font-medium text-ink-muted hover:text-status-crit disabled:opacity-50"
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
                {isPlatformAdmin && (
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
                    disabled={!plan.payment_url || requestPlan.isPending}
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

      {isPlatformAdmin && <PlatformQueue plans={plans} onChanged={invalidate} />}
      {isPlatformAdmin && <JobHealthPanel />}

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

/** Platform operator's queue: activate a customer's plan once payment is verified. */
function PlatformQueue({ plans, onChanged }: { plans: Plan[]; onChanged: () => void }) {
  const { t, i18n } = useTranslation('billing');
  const lng = i18n.resolvedLanguage ?? 'en';
  const subs = usePlatformSubscriptions(true);

  const setSubscription = useMutation({
    meta: { errorHandled: true }, // shown inline below
    mutationFn: async (v: { org: string; plan: string; status: 'active' | 'canceled'; interval: 'month' | 'year' }) => {
      const { error } = await supabase.rpc('fp_platform_set_subscription', {
        p_org: v.org,
        p_plan: v.plan,
        p_status: v.status,
        p_interval: v.interval,
      });
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  const planName = (code: string | null) => {
    const p = plans.find((x) => x.code === code);
    return p ? resolveI18n(p.name_i18n, lng) : (code ?? '—');
  };

  const rows = (subs.data ?? []).filter(
    (s: PlatformSubscription) => s.requested_plan_code || s.cancel_requested_at
  );

  return (
    <section className="mt-8 rounded-xl border border-line bg-white p-4">
      <h2 className="font-semibold text-ink">{t('platform.title')}</h2>
      <p className="mt-1 text-xs text-ink-muted">{t('platform.hint')}</p>
      {setSubscription.error && (
        <p className="mt-2 text-xs text-status-crit">{(setSubscription.error as Error).message}</p>
      )}
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{t('platform.empty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {rows.map((s) => {
            const requested = plans.find((p) => p.code === s.requested_plan_code);
            return (
              <li key={s.org_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{s.org_name}</p>
                  <p className="text-xs text-ink-muted">
                    {planName(s.plan_code)} · {t(`statusLabels.${s.status}`)}
                    {s.requested_plan_code && ` → ${planName(s.requested_plan_code)}`}
                    {s.requested_at && ` · ${formatDateOnly(s.requested_at, lng)}`}
                    {s.cancel_requested_at && ` · ${t('platform.cancelRequested')}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {requested && (
                    <Button
                      onClick={() =>
                        setSubscription.mutate({
                          org: s.org_id,
                          plan: requested.code,
                          status: 'active',
                          interval: requested.interval,
                        })
                      }
                      loading={setSubscription.isPending}
                    >
                      {t('platform.activate')}
                    </Button>
                  )}
                  {s.cancel_requested_at && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setSubscription.mutate({
                          org: s.org_id,
                          plan: s.plan_code ?? 'free',
                          status: 'canceled',
                          interval: 'month',
                        })
                      }
                      loading={setSubscription.isPending}
                    >
                      {t('platform.confirmCancel')}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Platform operator: are the scheduled jobs (PM, SLA, reminders, outbox) running? */
function JobHealthPanel() {
  const { t, i18n } = useTranslation('billing');
  const lng = i18n.resolvedLanguage ?? 'en';
  const health = useJobHealth(true);
  const jobs = health.data ?? [];
  const checks = useSystemChecks(true).data ?? [];

  return (
    <section className="mt-8 rounded-xl border border-line bg-white p-4">
      <h2 className="font-semibold text-ink">{t('jobs.title')}</h2>
      <p className="mt-1 text-xs text-ink-muted">{t('jobs.hint')}</p>
      {health.error && (
        <p className="mt-2 text-xs text-status-crit">{(health.error as Error).message}</p>
      )}
      <ul className="mt-3 divide-y divide-line">
        {jobs.map((j) => {
          const state = j.healthy ? 'ok' : j.last_ok === false ? 'failing' : j.last_run_at ? 'late' : 'never';
          return (
            <li key={j.job} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-ink">{j.description}</p>
                <p className="text-xs text-ink-muted">
                  {t('jobs.lastOk')}: {j.last_ok_at ? formatDate(j.last_ok_at, lng) : '—'}
                </p>
                {!j.healthy && j.last_error && (
                  <p className="mt-0.5 break-words text-xs text-status-crit">{j.last_error}</p>
                )}
              </div>
              <Pill
                className={
                  state === 'ok'
                    ? 'bg-status-ok/10 text-status-ok'
                    : state === 'failing'
                      ? 'bg-status-crit/10 text-status-crit'
                      : 'bg-status-warn/15 text-status-warn'
                }
              >
                {t(`jobs.state.${state}`)}
              </Pill>
            </li>
          );
        })}
        {checks.map((c) => (
          <li key={c.check_name} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-ink">{t(`jobs.checks.${c.check_name}`)}</p>
              <p className={`text-xs ${c.ok ? 'text-ink-muted' : 'text-status-crit'}`}>{c.detail}</p>
            </div>
            <Pill className={c.ok ? 'bg-status-ok/10 text-status-ok' : 'bg-status-crit/10 text-status-crit'}>
              {t(c.ok ? 'jobs.state.ok' : 'jobs.state.attention')}
            </Pill>
          </li>
        ))}
      </ul>
    </section>
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
