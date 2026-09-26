import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui';
import BillingOverviewTab from './billing/OverviewTab';
import InvoicesTab from './billing/InvoicesTab';
import SubscriptionsTab from './billing/SubscriptionsTab';
import PlansTab from './billing/PlansTab';
import CouponsTab from './billing/CouponsTab';
import ProvidersTab from './billing/ProvidersTab';

const TABS = ['overview', 'invoices', 'subscriptions', 'plans', 'coupons', 'providers'] as const;
type Tab = (typeof TABS)[number];

/** Plans & billing (/admin/billing): revenue, invoices, subscriptions, plans, coupons, Stripe/PayPal. */
export default function Billing() {
  const { t } = useTranslation('admin');
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'overview';
  const go = (x: Tab) => setParams(x === 'overview' ? {} : { tab: x }, { replace: true });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={t('nav.items.billing')} description={t('billing.subtitle')} />
      <div role="tablist" aria-label={t('billing.tabsLabel')} className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((x) => (
          <button
            key={x}
            role="tab"
            aria-selected={tab === x}
            onClick={() => go(x)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === x ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {t(`billing.tabs.${x}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'overview' && <BillingOverviewTab onOpenInvoices={(status) => setParams({ tab: 'invoices', ...(status ? { status } : {}) }, { replace: true })} />}
        {tab === 'invoices' && <InvoicesTab />}
        {tab === 'subscriptions' && <SubscriptionsTab />}
        {tab === 'plans' && <PlansTab />}
        {tab === 'coupons' && <CouponsTab />}
        {tab === 'providers' && <ProvidersTab />}
      </div>
    </div>
  );
}
