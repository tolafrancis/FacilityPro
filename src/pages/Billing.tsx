import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, ExternalLink, FileText, Settings2, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COMPANY } from '../lib/company';
import { useOrg } from '../contexts/OrgContext';
import { usePlanUsage, useIsPlatformAdmin, useJobHealth, useSystemChecks, usePlans, useSubscription } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, formatDateOnly } from '../lib/ui';
import type { Plan } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Pill from '../components/ui/Pill';
import { notify } from '../components/Toaster';

type Interval = 'month' | 'year';
type Provider = 'stripe' | 'paypal';

/** Calls billing-checkout; returns its JSON or throws with its error code. */
async function checkout<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('billing-checkout', { body });
  let payload = data as { error?: string; detail?: string } | null;
  const ctx = (error as { context?: Response } | null)?.context;
  if (error && ctx && typeof ctx.json === 'function') payload = await ctx.json().catch(() => null);
  if (error || payload?.error) {
    // A known code ("invalid_coupon") is an expected refusal, not a crash to report.
    const code = payload?.error ?? 'failed';
    throw Object.assign(new Error(code), { code: code === 'failed' ? undefined : code, status: ctx?.status, detail: payload?.detail ?? null });
  }
  return data as T;
}

function money(v: number, currency: string, lng: string) {
  try {
    return new Intl.NumberFormat(lng, { style: 'currency', currency, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);
  } catch {
    return `${currency} ${v}`;
  }
}

export default function Billing() {
  const { t, i18n } = useTranslation('billing');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg, role } = useOrg();
  const orgId = currentOrg?.id;
  const isAdmin = role === 'org_admin';
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const plans = (usePlans().data ?? []) as Plan[];
  const subQuery = useSubscription();
  const sub = subQuery.data;
  const usage = usePlanUsage().data;
  const isPlatformAdmin = useIsPlatformAdmin().data === true;
  const config = useQuery({
    queryKey: ['billing_config'],
    enabled: isAdmin,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => checkout<{ stripe: boolean; paypal: boolean }>({ action: 'config' }),
  });
  const providers = config.data ?? { stripe: false, paypal: false };

  const invoices = useQuery({
    queryKey: ['org_invoices', orgId],
    enabled: !!orgId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_platform_invoices')
        .select('id, number, amount, currency, status, issued_at, paid_at, hosted_url, pdf_url, refunded_amount, description')
        .eq('org_id', orgId!)
        .order('issued_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return data as { id: string; number: string; amount: number; currency: string; status: string; issued_at: string; paid_at: string | null;
        hosted_url: string | null; pdf_url: string | null; refunded_amount: number; description: string | null }[];
    },
  });

  const [interval, setInterval] = useState<Interval>(sub?.billing_interval === 'year' ? 'year' : 'month');
  const [coupon, setCoupon] = useState('');
  const [showCoupon, setShowCoupon] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [banner, setBanner] = useState<null | { kind: 'ok' | 'info' | 'warn'; text: string }>(null);

  const refresh = () => {
    for (const k of ['subscription', 'plan_usage', 'org_invoices']) void qc.invalidateQueries({ queryKey: [k] });
  };
  const errorText = (e: unknown) => {
    const err = e as { message?: string; detail?: string | null };
    return err.detail || t(`errors.${err.message}`, { defaultValue: t('errors.failed') });
  };

  // Back from Stripe / PayPal: apply the result straight away (the webhook
  // does it too), then tidy the URL.
  const handled = useRef(false);
  useEffect(() => {
    const result = params.get('checkout');
    if (!result || !orgId || handled.current) return;
    handled.current = true;
    const next = new URLSearchParams(params);
    ['checkout', 'provider', 'session_id', 'subscription_id', 'ba_token', 'token'].forEach((k) => next.delete(k));
    if (result === 'cancelled') {
      setBanner({ kind: 'info', text: t('checkout.cancelled') });
      setParams(next, { replace: true });
      return;
    }
    const provider = params.get('provider');
    setBanner({ kind: 'info', text: t('checkout.confirming') });
    checkout<{ status?: string }>({ action: 'confirm', org_id: orgId, provider, session_id: params.get('session_id'), subscription_id: params.get('subscription_id') })
      .then((r) => setBanner(r.status === 'processed' ? { kind: 'ok', text: t('checkout.success') } : { kind: 'info', text: t('checkout.pending') }))
      .catch(() => setBanner({ kind: 'info', text: t('checkout.pending') }))
      .finally(() => {
        refresh();
        setParams(next, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, params]);

  useEffect(() => {
    if (params.get('portal') === 'done') {
      refresh();
      const next = new URLSearchParams(params);
      next.delete('portal');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const start = useMutation({
    meta: { errorHandled: true },
    mutationFn: (v: { plan: string; provider: Provider }) =>
      checkout<{ url: string }>({ action: 'start', org_id: orgId, plan: v.plan, interval, provider: v.provider, coupon: v.provider === 'stripe' ? coupon.trim() || null : null }),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => notify(errorText(e), 'error'),
  });
  const portal = useMutation({
    meta: { errorHandled: true },
    mutationFn: () => checkout<{ url: string }>({ action: 'portal', org_id: orgId }),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => notify(errorText(e), 'error'),
  });
  const cancelPaypal = useMutation({
    meta: { errorHandled: true },
    mutationFn: () => checkout({ action: 'cancel', org_id: orgId }),
    onSuccess: () => {
      setConfirmCancel(false);
      notify(t('cancelled'), 'success');
      refresh();
    },
    onError: (e) => notify(errorText(e), 'error'),
  });
  // Manual (no provider set up): record the request for the platform team.
  const requestPlan = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (code: string) => {
      const { error } = await supabase.rpc('fp_request_plan', { p_org: orgId!, p_plan: code });
      if (error) throw error;
    },
    onSuccess: () => {
      notify(t('requestSent'), 'success');
      refresh();
    },
    onError: (e) => notify((e as Error).message, 'error'),
  });
  const requestCancel = useMutation({
    meta: { errorHandled: true },
    mutationFn: async () => {
      const { error } = await supabase.rpc('fp_request_cancellation', { p_org: orgId! });
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirmCancel(false);
      refresh();
    },
    onError: (e) => notify((e as Error).message, 'error'),
  });

  // Paying online = a live Stripe/PayPal subscription (same rule as fp_billing_checkout_context).
  const provider = (sub?.provider === 'stripe' || sub?.provider === 'paypal') && sub.provider_subscription_id ? sub.provider : null;
  const payingOnline = !!provider && ['active', 'trialing', 'past_due'].includes(sub?.status ?? '');
  const currentPlan = plans.find((p) => p.code === sub?.plan_code) ?? plans.find((p) => p.code === 'free') ?? null;
  const requestedPlan = plans.find((p) => p.code === sub?.requested_plan_code) ?? null;
  const hasYearly = plans.some((p) => p.price > 0 && p.price_year);
  const maxSaving = Math.max(0, ...plans.filter((p) => p.price > 0 && p.price_year).map((p) => Math.round((1 - p.price_year! / (p.price * 12)) * 100)));
  const limit = (n?: number | null) => (n == null ? t('limitsUnlimited') : String(n));
  const periodEnd = sub?.status === 'trialing' ? sub.trial_ends_at ?? sub.current_period_end : sub?.current_period_end;

  const usageRow = (label: string, used: number, max?: number | null) => {
    const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
    const over = max != null && used > max;
    return (
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">{label}</span>
          <span className={over ? 'font-medium text-status-crit' : 'tabular-nums text-ink'}>{used} / {limit(max)}</span>
        </div>
        {max != null && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
            <div className={`h-full rounded-full ${pct >= 90 ? 'bg-status-crit' : pct >= 75 ? 'bg-status-warn' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>

      {banner && (
        <div role="status" className={`mt-4 rounded-lg border px-4 py-3 text-sm ${banner.kind === 'ok' ? 'border-status-ok/30 bg-status-ok/10 text-ink' : 'border-line bg-surface text-ink'}`}>
          {banner.text}
        </div>
      )}

      {/* Current subscription */}
      <section className="mt-6 grid gap-4 rounded-xl border border-line bg-panel p-5 md:grid-cols-[1fr_16rem]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-ink-muted">{t('currentPlan')}</p>
            <Pill
              className={
                sub?.status === 'active' ? 'bg-status-ok/10 text-status-ok'
                : sub?.status === 'past_due' ? 'bg-status-crit/10 text-status-crit'
                : sub?.status === 'trialing' || sub?.status === 'pending' ? 'bg-status-warn/15 text-status-warn'
                : 'bg-surface text-ink-muted'
              }
            >
              {t(`statusLabels.${sub?.status ?? 'active'}`)}
            </Pill>
          </div>
          <p className="mt-1 text-xl font-semibold text-ink">
            {currentPlan ? resolveI18n(currentPlan.name_i18n, lng) : '—'}
            {sub?.billing_interval === 'year' && currentPlan && currentPlan.price > 0 && <span className="text-sm font-normal text-ink-muted"> · {t('yearly')}</span>}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {provider ? t(`paidWith.${provider}`) : sub?.provider === 'manual' && currentPlan && currentPlan.price > 0 ? t('paidWith.manual') : null}
          </p>
          {periodEnd && sub?.status !== 'canceled' && (
            <p className={`mt-2 text-sm ${sub?.status === 'trialing' && new Date(periodEnd) < new Date() ? 'text-status-crit' : 'text-ink'}`}>
              {sub?.status === 'trialing'
                ? new Date(periodEnd) < new Date() ? t('trialEnded') : `${t('trialEnds')}: ${formatDateOnly(periodEnd, lng)}`
                : sub?.cancel_at_period_end ? t('endsOn', { date: formatDateOnly(periodEnd, lng) })
                : `${t('renews')}: ${formatDateOnly(periodEnd, lng)}`}
            </p>
          )}
          {sub?.status === 'past_due' && <p className="mt-2 rounded-lg bg-status-crit/10 p-3 text-sm text-ink">{t('pastDueNote')}</p>}
          {requestedPlan && !payingOnline && (
            <p className="mt-3 rounded-lg bg-brand/10 p-3 text-xs text-ink">{t('requestedNote', { plan: resolveI18n(requestedPlan.name_i18n, lng) })}</p>
          )}
          {sub?.cancel_requested_at && !provider && <p className="mt-3 rounded-lg bg-surface p-3 text-xs text-ink-muted">{t('cancelRequestedNote')}</p>}

          {isAdmin && (
            <div className="mt-4 flex flex-wrap gap-2">
              {provider === 'stripe' && sub?.provider_customer_id && (
                <Button variant="secondary" onClick={() => portal.mutate()} loading={portal.isPending}>
                  <Settings2 size={15} aria-hidden /> {t('manageBilling')}
                </Button>
              )}
              {provider === 'paypal' && payingOnline && (
                <Button variant="secondary" onClick={() => setConfirmCancel(true)}>{t('cancel')}</Button>
              )}
              {!provider && sub && sub.status !== 'canceled' && !sub.cancel_requested_at && currentPlan && currentPlan.price > 0 && (
                <Button variant="secondary" onClick={() => setConfirmCancel(true)}>{t('cancel')}</Button>
              )}
            </div>
          )}
        </div>
        <div className="space-y-3 border-t border-line pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('usage')}</p>
          {usageRow(t('assets'), usage?.assets.used ?? 0, usage?.assets.limit)}
          {usageRow(t('members'), usage?.members.used ?? 0, usage?.members.limit)}
          {usageRow(t('sites'), usage?.sites.used ?? 0, usage?.sites.limit)}
        </div>
      </section>

      {/* Plans */}
      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{t('plansTitle')}</h2>
        {hasYearly && (
          <div role="radiogroup" aria-label={t('billingPeriod')} className="inline-flex rounded-lg border border-line bg-panel p-0.5 text-sm">
            {(['month', 'year'] as const).map((x) => (
              <button key={x} type="button" role="radio" aria-checked={interval === x} onClick={() => setInterval(x)}
                className={`rounded-md px-3 py-1.5 font-medium ${interval === x ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'}`}>
                {t(x === 'month' ? 'monthly' : 'yearly')}
                {x === 'year' && maxSaving > 0 && <span className={`ml-1.5 text-xs ${interval === x ? 'text-white/90' : 'text-status-ok'}`}>{t('upTo', { pct: maxSaving })}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {payingOnline && isAdmin && (
        <p className="mt-2 text-sm text-ink-muted">{provider === 'stripe' ? t('switchViaPortal') : t('switchPaypal')}</p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const yearly = interval === 'year' && !!plan.price_year;
          const price = yearly ? plan.price_year! : plan.price;
          const isCurrent = currentPlan?.code === plan.code && ['active', 'trialing', 'past_due'].includes(sub?.status ?? 'active')
            && (plan.price === 0 || (sub?.billing_interval ?? 'month') === (yearly ? 'year' : 'month') || !plan.price_year);
          const stripeId = yearly ? plan.stripe_price_year : plan.stripe_price_month;
          const paypalId = yearly ? plan.paypal_plan_year : plan.paypal_plan_month;
          const canCard = providers.stripe && !!stripeId;
          const canPaypal = providers.paypal && !!paypalId;
          const saving = plan.price_year && plan.price > 0 ? Math.round((1 - plan.price_year / (plan.price * 12)) * 100) : 0;
          return (
            <div key={plan.code} className={`flex flex-col rounded-xl border bg-panel p-5 ${isCurrent ? 'border-brand ring-1 ring-brand/30' : 'border-line'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{resolveI18n(plan.name_i18n, lng)}</p>
                {yearly && saving > 0 && <Pill className="bg-status-ok/10 text-status-ok">{t('save', { pct: saving })}</Pill>}
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                {plan.contact_sales ? t('custom') : plan.price > 0 ? money(yearly ? Math.round(price / 12) : price, plan.currency, lng) : t('free')}
                {plan.price > 0 && <span className="text-sm font-normal text-ink-muted">{t('perMonth')}</span>}
              </p>
              {yearly && plan.price > 0 && <p className="text-xs text-ink-muted">{t('billedYearly', { amount: money(price, plan.currency, lng) })}</p>}
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-ink">
                <li className="flex items-center gap-2"><Check size={14} className="shrink-0 text-status-ok" aria-hidden /> {t('assets')}: {limit(plan.limits.assets)}</li>
                <li className="flex items-center gap-2"><Check size={14} className="shrink-0 text-status-ok" aria-hidden /> {t('members')}: {limit(plan.limits.members)}</li>
                <li className="flex items-center gap-2"><Check size={14} className="shrink-0 text-status-ok" aria-hidden /> {t('sites')}: {limit(plan.limits.sites)}</li>
                {(plan.features ?? []).map((f) => <li key={f} className="flex items-center gap-2"><Check size={14} className="shrink-0 text-status-ok" aria-hidden /> {f}</li>)}
              </ul>
              <div className="mt-5 space-y-2">
                {isCurrent ? (
                  <Button variant="secondary" disabled className="w-full justify-center">{t('current')}</Button>
                ) : !isAdmin || (plan.price === 0 && !plan.contact_sales) ? null : payingOnline && !plan.contact_sales ? (
                  <Button variant="secondary" disabled className="w-full justify-center">{t('changeFirst')}</Button>
                ) : (canCard || canPaypal) && !plan.contact_sales ? (
                  <>
                    {canCard && (
                      <Button onClick={() => start.mutate({ plan: plan.code, provider: 'stripe' })} loading={start.isPending && start.variables?.plan === plan.code && start.variables.provider === 'stripe'} className="w-full justify-center">
                        <CreditCard size={15} aria-hidden /> {t('payByCard')}
                      </Button>
                    )}
                    {canPaypal && (
                      <Button variant="secondary" onClick={() => start.mutate({ plan: plan.code, provider: 'paypal' })} loading={start.isPending && start.variables?.plan === plan.code && start.variables.provider === 'paypal'} className="w-full justify-center">
                        {t('payWithPaypal')}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => requestPlan.mutate(plan.code)} loading={requestPlan.isPending && requestPlan.variables === plan.code}
                    disabled={sub?.requested_plan_code === plan.code} className="w-full justify-center">
                    {sub?.requested_plan_code === plan.code ? t('requested') : t('request')}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && providers.stripe && !payingOnline && (
        <div className="mt-4">
          {showCoupon ? (
            <div className="flex max-w-sm items-center gap-2">
              <Input aria-label={t('coupon')} value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder={t('couponPlaceholder')} />
              <span className="text-xs text-ink-muted">{t('couponHint')}</span>
            </div>
          ) : (
            <button type="button" onClick={() => setShowCoupon(true)} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
              <Tag size={14} aria-hidden /> {t('haveCoupon')}
            </button>
          )}
        </div>
      )}
      {isAdmin && (providers.stripe || providers.paypal) && <p className="mt-3 text-xs text-ink-muted">{t('secureNote')}</p>}
      {isAdmin && <p className="mt-1 text-xs text-ink-muted">{t('payee', { company: COMPANY.legalName, taxId: COMPANY.taxId })}</p>}

      {/* Invoices */}
      {isAdmin && (
        <section className="mt-8 rounded-xl border border-line bg-panel p-5">
          <h2 className="font-semibold text-ink">{t('invoices.title')}</h2>
          {(invoices.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">{t('invoices.empty')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {(invoices.data ?? []).map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{inv.number}</span>
                    <span className="block text-xs text-ink-muted">{formatDateOnly(inv.issued_at, lng)}{inv.description && ` · ${inv.description}`}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-ink">{money(inv.amount, inv.currency, lng)}</span>
                    <Pill className={inv.status === 'paid' ? 'bg-status-ok/10 text-status-ok' : inv.status === 'failed' ? 'bg-status-crit/10 text-status-crit' : 'bg-surface text-ink-muted'}>
                      {t(`invoices.status.${inv.status}`, { defaultValue: inv.status })}
                    </Pill>
                    {(inv.hosted_url || inv.pdf_url) && (
                      <a href={(inv.hosted_url ?? inv.pdf_url)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand">
                        <FileText size={13} aria-hidden /> {t('invoices.view')} <ExternalLink size={11} aria-hidden />
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isPlatformAdmin && (
        <p className="mt-8 rounded-lg border border-line bg-surface p-3 text-sm text-ink-muted">
          {t('platform.moved')} <Link to="/admin/billing" className="font-medium text-brand-600 hover:underline dark:text-brand">{t('platform.open')}</Link>
        </p>
      )}
      {isPlatformAdmin && <JobHealthPanel />}

      {confirmCancel && (
        <Modal title={t('cancelTitle')} onClose={() => setConfirmCancel(false)} closeLabel={t('close')}>
          <p className="text-sm text-ink">{provider === 'paypal' ? t('cancelPaypalBody') : t('cancelManualBody')}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>{t('keep')}</Button>
            <Button variant="danger" loading={cancelPaypal.isPending || requestCancel.isPending}
              onClick={() => (provider === 'paypal' ? cancelPaypal.mutate() : requestCancel.mutate())}>
              {t('cancel')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
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
    <section className="mt-8 rounded-xl border border-line bg-panel p-4">
      <h2 className="font-semibold text-ink">{t('jobs.title')}</h2>
      <p className="mt-1 text-xs text-ink-muted">{t('jobs.hint')}</p>
      {health.error && <p className="mt-2 text-xs text-status-crit">{(health.error as Error).message}</p>}
      <ul className="mt-3 divide-y divide-line">
        {jobs.map((j) => {
          const state = j.healthy ? 'ok' : j.last_ok === false ? 'failing' : j.last_run_at ? 'late' : 'never';
          return (
            <li key={j.job} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-ink">{j.description}</p>
                <p className="text-xs text-ink-muted">{t('jobs.lastOk')}: {j.last_ok_at ? formatDate(j.last_ok_at, lng) : '—'}</p>
                {!j.healthy && j.last_error && <p className="mt-0.5 break-words text-xs text-status-crit">{j.last_error}</p>}
              </div>
              <Pill className={state === 'ok' ? 'bg-status-ok/10 text-status-ok' : state === 'failing' ? 'bg-status-crit/10 text-status-crit' : 'bg-status-warn/15 text-status-warn'}>
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
            <Pill className={c.ok ? 'bg-status-ok/10 text-status-ok' : 'bg-status-crit/10 text-status-crit'}>{t(c.ok ? 'jobs.state.ok' : 'jobs.state.attention')}</Pill>
          </li>
        ))}
      </ul>
    </section>
  );
}
