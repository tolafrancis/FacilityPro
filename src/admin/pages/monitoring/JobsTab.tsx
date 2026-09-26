import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { History, Play } from 'lucide-react';
import { Badge, Card, ErrorState, Skeleton, type Tone } from '../../components/ui';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { notify } from '../../../components/Toaster';
import { formatNumber, timeAgo } from '../../lib/format';
import { adminErrorMessage } from '../../lib/tenants';
import { describeCron, formatDuration, formatMinutes, jobState, runJob, useJobRuns, useJobs, type Job } from '../../lib/monitoring';

const STATE_TONE: Record<ReturnType<typeof jobState>, Tone> = { ok: 'ok', running: 'info', late: 'warn', failing: 'crit', never: 'neutral' };

export function useCronLabel() {
  const { t } = useTranslation('admin');
  return (expr: string | null) => {
    const c = describeCron(expr);
    return t(`monitoring.cron.${c.key}`, c.values);
  };
}

export default function JobsTab() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const qc = useQueryClient();
  const q = useJobs();
  const cron = useCronLabel();
  const [history, setHistory] = useState<Job | null>(null);
  const run = useMutation({
    meta: { errorHandled: true },
    mutationFn: (job: string) => runJob(job),
    onSuccess: (r, job) => {
      if (r.started) notify(t('monitoring.jobs.started', { job }), 'success');
      else if (r.ok) notify(t('monitoring.jobs.ran', { job, count: r.processed ?? 0 }), 'success');
      else notify(t('monitoring.jobs.runFailed', { job, error: r.error ?? '' }), 'error');
      for (const k of ['admin_jobs', 'admin_job_runs', 'admin_monitoring']) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => notify((e as { message?: string }).message === 'job_ran_recently' ? t('monitoring.jobs.tooSoon') : adminErrorMessage(e), 'error'),
  });

  if (q.isError) return <ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} />;

  return (
    <Card title={t('monitoring.jobs.title')} description={t('monitoring.jobs.hint')}>
      {!q.data ? <div className="space-y-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}</div> : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-5 py-2 font-medium">{t('monitoring.jobs.cols.job')}</th>
                <th className="px-3 py-2 font-medium">{t('monitoring.jobs.cols.schedule')}</th>
                <th className="px-3 py-2 font-medium">{t('monitoring.jobs.cols.status')}</th>
                <th className="px-3 py-2 font-medium">{t('monitoring.jobs.cols.lastRun')}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">{t('monitoring.jobs.cols.runs24h')}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">{t('monitoring.jobs.cols.avg')}</th>
                <th className="px-5 py-2 text-right font-medium"><span className="sr-only">{t('monitoring.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((j) => {
                const state = jobState(j);
                return (
                  <tr key={j.job} className="border-b border-line align-top last:border-0">
                    <td className="max-w-[22rem] px-5 py-2.5">
                      <p className="font-medium text-ink">{t(`monitoring.jobNames.${j.job}`, { defaultValue: j.job })}</p>
                      <p className="text-xs text-ink-muted"><code>{j.job}</code> · {t(`monitoring.jobs.runsIn.${j.runs_in}`)}</p>
                      {state === 'failing' && j.last_error && <p className="mt-1 break-words text-xs text-status-crit dark:text-red-400">{j.last_error.slice(0, 300)}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-ink">
                      {cron(j.schedule)}
                      {j.scheduled === false && <span className="ml-1"><Badge tone="warn">{t('monitoring.jobs.paused')}</Badge></span>}
                      <p className="text-xs text-ink-muted">{t('monitoring.jobs.alertAfter', { time: formatMinutes(j.max_silence_minutes) })}</p>
                    </td>
                    <td className="px-3 py-2.5"><Badge tone={STATE_TONE[state]}>{t(`monitoring.jobs.state.${state}`)}</Badge></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink">
                      {j.last_run_at ? timeAgo(j.last_run_at, lng) : '—'}
                      {j.last_ok_at && state !== 'ok' && <p className="text-xs text-ink-muted">{t('monitoring.jobs.lastOk', { when: timeAgo(j.last_ok_at, lng) })}</p>}
                      {state === 'ok' && j.last_processed != null && <p className="text-xs text-ink-muted">{t('monitoring.jobs.processed', { count: j.last_processed })}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                      {formatNumber(j.runs_24h, lng)}
                      {j.failures_24h > 0 && <p className="text-xs text-status-crit dark:text-red-400">{t('monitoring.jobs.failures', { count: j.failures_24h })}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{formatDuration(j.avg_ms, lng)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <button type="button" onClick={() => setHistory(j)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-ink/5 hover:text-ink">
                          <History size={14} aria-hidden /> {t('monitoring.jobs.history')}
                        </button>
                        {j.runnable && (
                          <button type="button" disabled={run.isPending || j.running} onClick={() => run.mutate(j.job)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand/10 disabled:opacity-40 dark:text-brand">
                            <Play size={14} aria-hidden /> {t('monitoring.jobs.runNow')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {history && <HistoryDialog job={history} onClose={() => setHistory(null)} />}
    </Card>
  );
}

function HistoryDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [page, setPage] = useState(1);
  const size = 20;
  const q = useJobRuns(job.job, page, size);
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / size));
  return (
    <Modal title={t(`monitoring.jobNames.${job.job}`, { defaultValue: job.job })} onClose={onClose} closeLabel={t('close')} wide>
      {q.isError ? <ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} /> : !q.data ? <Skeleton className="h-60" /> : q.data.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t('monitoring.jobs.noRuns')}</p>
      ) : (
        <>
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-3 py-2 font-medium">{t('monitoring.jobs.cols.started')}</th>
                  <th className="px-3 py-2 font-medium">{t('monitoring.jobs.cols.status')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('monitoring.jobs.cols.processed')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('monitoring.jobs.cols.duration')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-ink">{new Date(r.started_at).toLocaleString(lng)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={r.ok === true ? 'ok' : r.ok === false ? 'crit' : 'info'}>{t(`monitoring.jobs.run.${r.ok === true ? 'ok' : r.ok === false ? 'failed' : 'running'}`)}</Badge>
                      {r.error && <p className="mt-1 max-w-md break-words text-xs text-ink-muted">{r.error}</p>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{r.processed ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{formatDuration(r.ms, lng)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-sm text-ink-muted">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('monitoring.prev')}</Button>
              <span>{t('monitoring.pageOf', { page, pages })}</span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('monitoring.next')}</Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
