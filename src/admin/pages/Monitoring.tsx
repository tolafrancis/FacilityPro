import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui';
import { useMonitoringStatus } from '../lib/monitoring';
import StatusTab from './monitoring/StatusTab';
import JobsTab from './monitoring/JobsTab';
import EmailTab from './monitoring/EmailTab';
import ErrorsTab from './monitoring/ErrorsTab';
import WebhooksTab from './monitoring/WebhooksTab';

export const MONITORING_TABS = ['status', 'jobs', 'email', 'errors', 'webhooks'] as const;
export type MonitoringTab = (typeof MONITORING_TABS)[number];

/** Monitoring (/admin/monitoring): health, background jobs, email queue, app errors, webhooks. */
export default function Monitoring() {
  const { t } = useTranslation('admin');
  const [params, setParams] = useSearchParams();
  const tab: MonitoringTab = (MONITORING_TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as MonitoringTab) : 'status';
  const go = (x: MonitoringTab) => setParams(x === 'status' ? {} : { tab: x }, { replace: true });
  const s = useMonitoringStatus().data;

  // A dot on the tabs that need a look.
  const problem: Record<MonitoringTab, boolean> = {
    status: false,
    jobs: !!s && s.jobs.healthy < s.jobs.total,
    email: !!s && s.checks.some((c) => !c.ok && c.name.startsWith('outbox')),
    errors: !!s && (s.errors.new_24h > 0 || s.checks.some((c) => !c.ok && c.name === 'workflow_failures')),
    webhooks: !!s && s.webhooks.failed_24h > 0,
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={t('nav.items.monitoring')} description={t('monitoring.subtitle')} />
      <div role="tablist" aria-label={t('monitoring.tabsLabel')} className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {MONITORING_TABS.map((x) => (
          <button
            key={x}
            role="tab"
            aria-selected={tab === x}
            onClick={() => go(x)}
            className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === x ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {t(`monitoring.tabs.${x}`)}
            {problem[x] && <span className="h-1.5 w-1.5 rounded-full bg-status-warn" aria-label={t('health.attention')} />}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'status' && <StatusTab onOpen={go} />}
        {tab === 'jobs' && <JobsTab />}
        {tab === 'email' && <EmailTab />}
        {tab === 'errors' && <ErrorsTab />}
        {tab === 'webhooks' && <WebhooksTab />}
      </div>
    </div>
  );
}
