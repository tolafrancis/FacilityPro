import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Ban, Copy, KeyRound, LogIn, LogOut, MailCheck, ShieldCheck, ShieldOff, UserCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import { notify } from '../../components/Toaster';
import { useAdmin } from '../AdminContext';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { timeAgo } from '../lib/format';
import { adminErrorMessage, rpc, useAdminAction } from '../lib/tenants';
import { tenantStatusTone } from '../lib/tenantStatus';
import { describeUserAgent, useUser, type UserDetail as Detail } from '../lib/users';
import { ConfirmDialog, IconButton, ImpersonateDialog, MoreMenu } from './TenantDetail';
import { userStatusTone } from './Users';

type Dialog = null | 'ban' | 'signOut' | 'mfa' | 'confirm';
const BAN_DAYS = ['1', '7', '30', '90', 'forever'] as const;

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { can } = useAdmin();
  const { user: me } = useAuth();
  const q = useUser(id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  const unban = useAdminAction(() => rpc('fp_admin_unban_user', { p_user: id }), t('user.toast.unbanned'));
  const signOut = useAdminAction(() => rpc<number>('fp_admin_sign_out_user', { p_user: id }), t('user.toast.signedOut'));
  const resetMfa = useAdminAction(() => rpc<number>('fp_admin_reset_mfa', { p_user: id }), t('user.toast.mfaReset'));
  const confirmEmail = useAdminAction(() => rpc('fp_admin_confirm_email', { p_user: id }), t('user.toast.confirmed'));

  if (q.isError) {
    return (
      <div className="mx-auto max-w-7xl">
        <BackLink />
        <ErrorState message={(q.error as { code?: string })?.code === 'P0002' ? t('user.notFound') : t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} />
      </div>
    );
  }
  const d = q.data;
  if (!d) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <BackLink />
        <Skeleton className="h-16 w-80" />
        <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div>
      </div>
    );
  }

  const u = d.user;
  const isStaff = !!d.staff_role;
  const isMe = me?.id === u.id;
  // Staff accounts are managed under Admin team; nobody manages their own here.
  const manage = can('users.manage') && !isStaff && !isMe;
  const date = (iso: string) => new Date(iso).toLocaleDateString(lng, { day: 'numeric', month: 'short', year: 'numeric' });
  const lastBan = d.admin_actions.find((a) => a.action === 'user.ban');
  const banReason = typeof lastBan?.after?.reason === 'string' ? lastBan.after.reason : null;
  const bannedForever = u.banned_until ? new Date(u.banned_until).getFullYear() - new Date().getFullYear() > 50 : false;
  const verifiedFactors = d.mfa.filter((f) => f.status === 'verified');

  const resetPassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) {
      notify(adminErrorMessage(error), 'error');
      return;
    }
    await supabase.rpc('fp_admin_record', { p_action: 'user.password_reset', p_org: null, p_target: u.id, p_detail: { email: u.email } });
    notify(t('tenant.users.resetSent', { email: u.email }), 'success');
    void q.refetch();
  };

  return (
    <div className="mx-auto max-w-7xl">
      <BackLink />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand/10 text-xl font-semibold text-brand-600 dark:text-brand">
            {(u.full_name ?? u.email).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{u.full_name ?? u.email}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              {u.full_name && <span>{u.email}</span>}
              <Badge tone={userStatusTone(u.status)}>{t(`userStatus.${u.status}`)}</Badge>
              {isStaff && <Badge tone="brand">{t(`roles.${d.staff_role}`, { defaultValue: d.staff_role ?? '' })}</Badge>}
              <Badge tone={verifiedFactors.length ? 'ok' : 'neutral'}>{verifiedFactors.length ? t('user.mfaOn') : t('user.mfaOff')}</Badge>
              <span aria-hidden>·</span>
              <span>{t('user.joined', { when: date(u.created_at) })}</span>
            </div>
          </div>
        </div>
        {manage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => void resetPassword()}>
              <KeyRound size={15} aria-hidden /> {t('tenant.users.resetPassword')}
            </Button>
            {u.status === 'banned' ? (
              <Button onClick={() => unban.mutate(undefined)} loading={unban.isPending}>
                <UserCheck size={15} aria-hidden /> {t('user.actions.unban')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setDialog('ban')}>
                <Ban size={15} aria-hidden /> {t('user.actions.ban')}
              </Button>
            )}
            <MoreMenu
              items={[
                { key: 'signout', icon: LogOut, label: t('user.actions.signOut'), onClick: () => setDialog('signOut') },
                ...(d.mfa.length ? [{ key: 'mfa', icon: ShieldOff, label: t('user.actions.resetMfa'), onClick: () => setDialog('mfa') }] : []),
                ...(!u.email_confirmed_at ? [{ key: 'confirm', icon: MailCheck, label: t('user.actions.confirmEmail'), onClick: () => setDialog('confirm') }] : []),
              ]}
            />
          </div>
        )}
      </div>

      {u.status === 'banned' && u.banned_until && (
        <div role="status" className="mb-4 rounded-lg border border-status-crit/30 bg-status-crit/5 px-4 py-3 text-sm text-ink">
          <strong>{bannedForever ? t('user.bannedForever') : t('user.bannedUntil', { when: new Date(u.banned_until).toLocaleString(lng) })}</strong>
          {banReason && <span className="text-ink-muted"> — {banReason}</span>}
        </div>
      )}
      {isStaff && (
        <div role="status" className="mb-4 rounded-lg border border-line bg-ink/5 px-4 py-3 text-sm text-ink">{t('user.staffNote')}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t('user.tenantsTitle', { count: d.memberships.length })}>
            {d.memberships.length === 0 ? (
              <EmptyState title={t('user.noTenants')} />
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-muted">
                      <th className="px-5 py-2 font-medium">{t('user.tenant')}</th>
                      <th className="px-3 py-2 font-medium">{t('tenant.users.role')}</th>
                      <th className="px-3 py-2 font-medium">{t('user.joinedCol')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('tenant.users.activeDays')}</th>
                      <th className="px-5 py-2"><span className="sr-only">{t('tenant.users.actions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.memberships.map((m) => {
                      const open = m.org_status !== 'suspended' && m.org_status !== 'deleted';
                      return (
                        <tr key={m.org_id} className="border-b border-line last:border-0">
                          <td className="px-5 py-2.5">
                            <Link to={`/admin/tenants/${m.org_id}`} className="font-medium text-ink hover:underline">{m.name}</Link>
                            <span className="ml-2"><Badge tone={tenantStatusTone(m.org_status as never)}>{t(`tenantStatus.${m.org_status}`, { defaultValue: m.org_status })}</Badge></span>
                          </td>
                          <td className="px-3 py-2.5">{t(`memberRoles.${m.role}`, { defaultValue: m.role })}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{date(m.joined_at)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{m.active_days_30}</td>
                          <td className="px-5 py-2.5">
                            <div className="flex justify-end">
                              {can('tenants.impersonate') && open && !isStaff && !isMe && u.status !== 'banned' && (
                                <IconButton label={t('tenant.users.impersonate')} onClick={() => setImpersonating(m.org_id)}><LogIn size={15} aria-hidden /></IconButton>
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
          </Card>

          <Card title={t('user.sessionsTitle')} description={t('user.sessionsHint')}>
            {d.sessions.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('user.noSessions')}</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {d.sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-ink">{describeUserAgent(s.user_agent) ?? t('user.unknownDevice')}</p>
                      <p className="text-xs text-ink-muted">
                        {s.ip && <>IP {s.ip} · </>}
                        {s.created_at && t('user.started', { when: timeAgo(s.created_at, lng) })}
                        {s.aal === 'aal2' && <> · {t('user.with2fa')}</>}
                      </p>
                    </div>
                    {s.last_used && <span className="text-xs text-ink-muted">{t('user.lastUsed', { when: timeAgo(s.last_used, lng) })}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('user.loginsTitle')} description={t('user.loginsHint')}>
            {d.logins.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('user.noLogins')}</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {d.logins.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-ink">{t(`user.loginActions.${l.action}`, { defaultValue: l.action })}</span>
                    <span className="text-xs text-ink-muted">
                      {new Date(l.at).toLocaleString(lng)}
                      {l.ip && ` · IP ${l.ip}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t('user.profileTitle')}>
            <dl className="space-y-2.5 text-sm">
              <Row label={t('users.cols.email')}>{u.email}</Row>
              <Row label={t('users.cols.phone')}>{u.phone ?? '—'}</Row>
              <Row label="ID">
                <button type="button" onClick={() => void navigator.clipboard?.writeText(u.id).then(() => notify(t('user.idCopied'), 'success'))} className="inline-flex max-w-full items-center gap-1 text-left hover:text-brand">
                  <code className="truncate text-xs">{u.id}</code> <Copy size={12} aria-hidden className="shrink-0" />
                </button>
              </Row>
              <Row label={t('user.signInWith')}>{u.providers.length ? u.providers.map((p) => t(`user.providers.${p}`, { defaultValue: p })).join(', ') : '—'}</Row>
              <Row label={t('user.emailConfirmed')}>{u.email_confirmed_at ? date(u.email_confirmed_at) : <Badge tone="warn">{t('tenant.users.unconfirmed')}</Badge>}</Row>
              <Row label={t('users.cols.lastSignIn')}>{u.last_sign_in_at ? timeAgo(u.last_sign_in_at, lng) : t('tenants.never')}</Row>
              <Row label={t('user.activeDays')}>{d.active_days_30}</Row>
            </dl>
          </Card>

          <Card title={t('user.mfaTitle')}>
            {d.mfa.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('user.noMfa')}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.mfa.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-ink">
                      <ShieldCheck size={15} aria-hidden className={f.status === 'verified' ? 'text-status-ok' : 'text-ink-muted'} />
                      {f.name || t(`user.factorTypes.${f.type}`, { defaultValue: f.type })}
                    </span>
                    <Badge tone={f.status === 'verified' ? 'ok' : 'neutral'}>{t(`user.factorStatus.${f.status}`, { defaultValue: f.status })}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <StaffActions d={d} lng={lng} />
        </div>
      </div>

      {dialog === 'ban' && <BanDialog userId={u.id} email={u.email} onClose={() => setDialog(null)} />}
      {dialog === 'signOut' && (
        <ConfirmDialog
          title={t('user.signOut.title')}
          body={t('user.signOut.body', { email: u.email, count: d.sessions.length })}
          confirmLabel={t('user.actions.signOut')}
          busy={signOut.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => signOut.mutate(undefined, { onSuccess: () => setDialog(null) })}
        />
      )}
      {dialog === 'mfa' && (
        <ConfirmDialog
          title={t('user.resetMfa.title')}
          body={t('user.resetMfa.body', { email: u.email })}
          confirmLabel={t('user.actions.resetMfa')}
          danger
          busy={resetMfa.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => resetMfa.mutate(undefined, { onSuccess: () => setDialog(null) })}
        />
      )}
      {dialog === 'confirm' && (
        <ConfirmDialog
          title={t('user.confirmEmail.title')}
          body={t('user.confirmEmail.body', { email: u.email })}
          confirmLabel={t('user.actions.confirmEmail')}
          busy={confirmEmail.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => confirmEmail.mutate(undefined, { onSuccess: () => setDialog(null) })}
        />
      )}
      {impersonating && <ImpersonateDialog orgId={impersonating} user={{ id: u.id, email: u.email }} onClose={() => setImpersonating(null)} />}
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation('admin');
  return (
    <Link to="/admin/users" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
      <ArrowLeft size={15} aria-hidden /> {t('nav.items.users')}
    </Link>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function StaffActions({ d, lng }: { d: Detail; lng: string }) {
  const { t } = useTranslation('admin');
  return (
    <Card title={t('user.historyTitle')}>
      {d.admin_actions.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('user.noHistory')}</p>
      ) : (
        <ol className="relative space-y-3 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-line">
          {d.admin_actions.map((a, i) => {
            const reason = typeof a.after?.reason === 'string' ? a.after.reason : null;
            return (
              <li key={i} className="relative pl-6">
                <span className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full bg-ink-muted ring-2 ring-panel" aria-hidden />
                <p className="text-sm text-ink">
                  {t(`auditActions.${a.action.replace(/\./g, '_')}`, { defaultValue: a.action })}
                  {a.actor_email && <span className="text-ink-muted"> · {a.actor_email}</span>}
                </p>
                <p className="text-xs text-ink-muted">
                  {new Date(a.at).toLocaleString(lng)}
                  {a.ip && ` · IP ${a.ip}`}
                  {reason && ` · ${reason}`}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function BanDialog({ userId, email, onClose }: { userId: string; email: string; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<(typeof BAN_DAYS)[number]>('7');
  const ban = useAdminAction(
    () => rpc('fp_admin_ban_user', { p_user: userId, p_reason: reason.trim(), p_days: days === 'forever' ? null : Number(days) }),
    t('user.toast.banned'),
  );
  return (
    <Modal title={t('user.ban.title', { email })} onClose={onClose} closeLabel={t('close')}>
      <p className="text-sm text-ink-muted">{t('user.ban.body')}</p>
      <label htmlFor="ban-days" className="mb-1 mt-4 block text-sm font-medium text-ink">{t('user.ban.length')}</label>
      <Select id="ban-days" value={days} onChange={(e) => setDays(e.target.value as (typeof BAN_DAYS)[number])}>
        {BAN_DAYS.map((x) => <option key={x} value={x}>{x === 'forever' ? t('user.ban.forever') : t('user.ban.days', { count: Number(x) })}</option>)}
      </Select>
      <label htmlFor="ban-reason" className="mb-1 mt-4 block text-sm font-medium text-ink">{t('user.ban.reason')}</label>
      <textarea
        id="ban-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      <p className="mt-1 text-xs text-ink-muted">{t('user.ban.audited')}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button variant="danger" disabled={reason.trim().length < 3} loading={ban.isPending} onClick={() => ban.mutate(undefined, { onSuccess: onClose })}>
          <Ban size={15} aria-hidden /> {t('user.actions.ban')}
        </Button>
      </div>
    </Modal>
  );
}
