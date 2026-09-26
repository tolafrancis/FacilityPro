import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge, Card, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { rpc, useAdminAction } from '../lib/tenants';
import { useSecurityOverview } from '../lib/audit';
import { timeAgo } from '../lib/format';
import MfaSetup from '../components/MfaSetup';
import { auditLabel } from './AuditLog';
import { control } from './billing/shared';

const SESSION_OPTIONS = [15, 30, 60, 120, 240, 480, 1440];

/** Security settings for platform staff (super admins). */
export default function Security() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const qc = useQueryClient();
  const q = useSecurityOverview();
  const save = useAdminAction((p: Record<string, unknown>) => rpc('fp_admin_save_security', { p }), t('security.toast.saved'));
  if (q.isError) return <div className="mx-auto max-w-5xl"><ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} /></div>;
  const d = q.data;
  const withoutMfa = (d?.staff ?? []).filter((s) => !s.disabled && !s.mfa);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={t('nav.items.security')} description={t('security.subtitle')} />
      {!d ? <Skeleton className="h-96" /> : (
        <>
          <Card title={t('security.yourMfa')} description={t('security.yourMfaHint')}>
            <MfaSetup onDone={() => { void qc.invalidateQueries({ queryKey: ['admin_security'] }); void qc.invalidateQueries({ queryKey: ['admin_permissions'] }); }} />
          </Card>

          <Card title={t('security.policies')}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-xl">
                  <p className="font-medium text-ink">{t('security.require2fa')}</p>
                  <p className="text-sm text-ink-muted">{t('security.require2faHint')}</p>
                  {!d.settings.admin_require_2fa && d.my_aal !== 'aal2' && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{t('security.require2faFirst')}</p>}
                  {!d.settings.admin_require_2fa && withoutMfa.length > 0 && (
                    <p className="mt-1 text-xs text-ink-muted">{t('security.withoutMfa', { count: withoutMfa.length })}</p>
                  )}
                </div>
                <button type="button" role="switch" aria-checked={d.settings.admin_require_2fa} aria-label={t('security.require2fa')}
                  disabled={!d.settings.admin_require_2fa && d.my_aal !== 'aal2'}
                  onClick={() => save.mutate({ admin_require_2fa: !d.settings.admin_require_2fa })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${d.settings.admin_require_2fa ? 'bg-brand' : 'bg-ink/20'}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${d.settings.admin_require_2fa ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <div className="max-w-xl">
                  <p className="font-medium text-ink">{t('security.sessionTimeout')}</p>
                  <p className="text-sm text-ink-muted">{t('security.sessionTimeoutHint')}</p>
                </div>
                <select aria-label={t('security.sessionTimeout')} value={d.settings.admin_session_minutes} className={control}
                  onChange={(e) => save.mutate({ admin_session_minutes: Number(e.target.value) })}>
                  {[...new Set([...SESSION_OPTIONS, d.settings.admin_session_minutes])].sort((a, b) => a - b).map((m) => (
                    <option key={m} value={m}>{m < 60 ? t('security.minutes', { count: m }) : t('security.hours', { count: m / 60 })}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card title={t('security.staff')} description={t('security.staffHint')}>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-muted">
                    <th className="px-5 py-2 font-medium">{t('security.cols.staff')}</th>
                    <th className="px-3 py-2 font-medium">{t('security.cols.role')}</th>
                    <th className="px-3 py-2 font-medium">{t('security.cols.mfa')}</th>
                    <th className="px-3 py-2 font-medium">{t('security.cols.lastSignIn')}</th>
                    <th className="px-5 py-2 text-right font-medium">{t('security.cols.sessions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.staff.map((s) => (
                    <tr key={s.user_id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2"><Link to={`/admin/users/${s.user_id}`} className="text-ink hover:underline">{s.email}</Link>{s.disabled && <span className="ml-2"><Badge>{t('security.disabled')}</Badge></span>}</td>
                      <td className="px-3 py-2 text-ink">{t(`roles.${s.role}`, { defaultValue: s.role })}</td>
                      <td className="px-3 py-2">
                        {s.mfa
                          ? <span className="inline-flex items-center gap-1 text-status-ok"><ShieldCheck size={14} aria-hidden />{t('security.mfaOn')}</span>
                          : <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><ShieldAlert size={14} aria-hidden />{t('security.mfaOff')}</span>}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">{s.last_sign_in_at ? timeAgo(s.last_sign_in_at, lng) : t('tenants.never')}</td>
                      <td className="px-5 py-2 text-right tabular-nums text-ink">{s.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={t('security.sensitive')} description={t('security.sensitiveHint')}
            actions={<Link to="/admin/audit" className="text-sm text-brand-600 hover:underline dark:text-brand">{t('security.openAudit')}</Link>}>
            {Object.keys(d.sensitive_30d).length === 0 ? <p className="text-sm text-ink-muted">{t('security.noSensitive')}</p> : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {Object.entries(d.sensitive_30d).sort((a, b) => b[1] - a[1]).map(([action, n]) => (
                  <li key={action}>
                    <Link to={action === 'settings.change' ? '/admin/audit?type=fp_platform_settings' : action === 'staff.change' ? '/admin/audit?type=fp_platform_admins' : `/admin/audit?action=${encodeURIComponent(action)}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:bg-ink/[0.03]">
                      <span className="text-ink">{auditLabel(action, t)}</span>
                      <span className="tabular-nums text-ink-muted">{n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="text-xs text-ink-muted">{t('security.passwordNote')}</p>
        </>
      )}
    </div>
  );
}
