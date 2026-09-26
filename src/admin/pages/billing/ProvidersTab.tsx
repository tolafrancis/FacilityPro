import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle, Copy } from 'lucide-react';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { notify } from '../../../components/Toaster';
import { timeAgo } from '../../lib/format';
import { useAdminPlans, useBillingEvents, useProviderStatus } from '../../lib/billing';

/** Stripe / PayPal setup status (never the keys) and the webhook log. */
export default function ProvidersTab() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const status = useProviderStatus();
  const events = useBillingEvents();
  const s = status.data;
  const paid = (useAdminPlans().data ?? []).filter((p) => p.price > 0 && p.active);
  const stripePrices = paid.length > 0 && paid.every((p) => p.stripe_price_month || p.stripe_price_year);
  const paypalPlans = paid.length > 0 && paid.every((p) => p.paypal_plan_month || p.paypal_plan_year);

  const Step = ({ ok, label }: { ok: boolean; label: string }) => (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-status-ok" aria-hidden /> : <Circle size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />}
      <span className={ok ? 'text-ink' : 'text-ink-muted'}>{label}</span>
      <span className="sr-only">{ok ? t('billing.setup.done') : t('billing.setup.todo')}</span>
    </li>
  );

  return (
    <div className="space-y-4">
      {status.isError ? (
        <ErrorState message={t('billing.setup.statusError')} onRetry={() => void status.refetch()} retryLabel={t('retry')} />
      ) : !s ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>
      ) : (
        <>
          <Card title={t('billing.setup.webhookTitle')} description={t('billing.setup.webhookHint')}>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
              <code className="min-w-0 flex-1 truncate text-xs text-ink">{s.webhook_url}</code>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(s.webhook_url).then(() => notify(t('billing.setup.copied'), 'success'))}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-brand px-3 text-xs font-semibold text-white">
                <Copy size={13} aria-hidden /> {t('copy')}
              </button>
            </div>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card
              title="Stripe"
              actions={s.stripe.configured ? <Badge tone={s.stripe.mode === 'live' ? 'ok' : 'warn'}>{t(`billing.setup.mode.${s.stripe.mode ?? 'test'}`)}</Badge> : <Badge>{t('billing.setup.off')}</Badge>}
            >
              <ol className="space-y-2">
                <Step ok={s.stripe.configured} label={t('billing.setup.stripeKey')} />
                <Step ok={s.stripe.webhook} label={t('billing.setup.stripeWebhook')} />
                <Step ok={stripePrices} label={t('billing.setup.stripePrices')} />
              </ol>
              <p className="mt-3 text-xs text-ink-muted">{t('billing.setup.stripePortal')}</p>
              <p className="mt-3 text-xs text-ink-muted">{t('billing.setup.stripeEvents')}</p>
            </Card>
            <Card
              title="PayPal"
              actions={s.paypal.configured ? <Badge tone={s.paypal.mode === 'live' ? 'ok' : 'warn'}>{t(`billing.setup.mode.${s.paypal.mode === 'live' ? 'live' : 'sandbox'}`)}</Badge> : <Badge>{t('billing.setup.off')}</Badge>}
            >
              <ol className="space-y-2">
                <Step ok={s.paypal.configured} label={t('billing.setup.paypalKey')} />
                <Step ok={s.paypal.webhook} label={t('billing.setup.paypalWebhook')} />
                <Step ok={paypalPlans} label={t('billing.setup.paypalPlans')} />
                <Step ok={s.paypal.mode === 'live'} label={t('billing.setup.paypalLive')} />
              </ol>
              <p className="mt-3 text-xs text-ink-muted">{t('billing.setup.paypalEvents')}</p>
            </Card>
          </div>
          <p className="text-xs text-ink-muted">{t('billing.setup.secretsNote')}</p>
        </>
      )}

      <Card title={t('billing.setup.eventsTitle')} description={t('billing.setup.eventsHint')}>
        {events.isLoading ? (
          <Skeleton className="h-32" />
        ) : events.isError ? (
          <ErrorState message={t('errors.load')} onRetry={() => void events.refetch()} retryLabel={t('retry')} />
        ) : (events.data ?? []).length === 0 ? (
          <EmptyState title={t('billing.setup.noEvents')} />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-5 py-2 font-medium">{t('billing.setup.event')}</th>
                  <th className="px-3 py-2 font-medium">{t('billing.cols.tenant')}</th>
                  <th className="px-3 py-2 font-medium">{t('billing.cols.status')}</th>
                  <th className="px-5 py-2 font-medium">{t('billing.setup.received')}</th>
                </tr>
              </thead>
              <tbody>
                {(events.data ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-2">
                      <span className="text-ink">{e.type}</span>
                      <span className="block text-xs text-ink-muted">{t(`providers.${e.provider}`)} · <code>{e.object_id ?? e.event_id}</code></span>
                    </td>
                    <td className="px-3 py-2 text-ink">{e.fp_organizations?.name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge tone={e.status === 'processed' ? 'ok' : e.status === 'failed' ? 'crit' : 'neutral'}>{t(`billing.setup.eventStatus.${e.status}`, { defaultValue: e.status })}</Badge>
                      {e.error && <span className="mt-0.5 block max-w-xs break-words text-xs text-ink-muted">{e.error}</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2 text-ink-muted">{timeAgo(e.received_at, lng)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
