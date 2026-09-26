import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Mail, Pencil, RotateCw, ShieldAlert, ShieldCheck, Trash2, UserCheck, UserPlus, UserX, X } from 'lucide-react';
import { Badge, Card, ErrorState, PageHeader, Skeleton, type Tone } from '../components/ui';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { timeAgo } from '../lib/format';
import { rpc, useAdminAction } from '../lib/tenants';
import { linkBase, otherActiveSuperAdmins, useTeam, type Staff } from '../lib/team';
import { ADMIN_ROLES, PERMISSIONS, roleCan, type AdminRole } from '../permissions';
import { ConfirmDialog, IconButton } from './TenantDetail';
import { Field, control } from './billing/shared';

const ROLE_TONE: Record<AdminRole, Tone> = { super_admin: 'brand', admin: 'info', support: 'ok', analyst: 'neutral' };

type Pending =
  | { kind: 'disable' | 'enable' | 'remove'; staff: Staff }
  | { kind: 'rename'; staff: Staff }
  | { kind: 'role'; staff: Staff; role: AdminRole }
  | { kind: 'revoke'; id: string; email: string };

/** Admin team (/admin/team, super admins): staff accounts, invites and roles. */
export default function Team() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const q = useTeam();
  const [inviting, setInviting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const setRole = useAdminAction((v: { user: string; role: AdminRole }) => rpc('fp_admin_set_staff_role', { p_user: v.user, p_role: v.role }), t('team.toast.role'));
  const setDisabled = useAdminAction((v: { user: string; disabled: boolean }) => rpc('fp_admin_set_staff_disabled', { p_user: v.user, p_disabled: v.disabled }),
    (v) => t(v.disabled ? 'team.toast.disabled' : 'team.toast.enabled'));
  const remove = useAdminAction((user: string) => rpc('fp_admin_remove_staff', { p_user: user }), t('team.toast.removed'));
  const resend = useAdminAction((id: string) => rpc('fp_admin_resend_staff_invite', { p_id: id, p_link_base: linkBase() }), t('team.toast.resent'));
  const revoke = useAdminAction((id: string) => rpc('fp_admin_revoke_staff_invite', { p_id: id }), t('team.toast.revoked'));
  const close = () => setPending(null);

  if (q.isError) return <div className="mx-auto max-w-6xl"><ErrorState message={t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} /></div>;
  const d = q.data;
  const lastSuper = (s: Staff) => s.role === 'super_admin' && !s.disabled_at && !!d && otherActiveSuperAdmins(d.staff, s.user_id) === 0;
  const active = d?.staff.filter((s) => !s.disabled_at).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={t('nav.items.team')} description={t('team.subtitle')}
        actions={<Button onClick={() => setInviting(true)}><UserPlus size={16} aria-hidden /> {t('team.invite')}</Button>} />

      <Card title={t('team.staff')} description={d ? t('team.staffCount', { count: active }) : undefined}>
        {!d ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-5 py-2 font-medium">{t('team.cols.person')}</th>
                  <th className="px-3 py-2 font-medium">{t('team.cols.role')}</th>
                  <th className="px-3 py-2 font-medium">{t('team.cols.mfa')}</th>
                  <th className="px-3 py-2 font-medium">{t('team.cols.lastSignIn')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('team.cols.actions30d')}</th>
                  <th className="px-5 py-2 text-right font-medium"><span className="sr-only">{t('monitoring.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {d.staff.map((s) => {
                  const me = s.user_id === d.me;
                  return (
                    <tr key={s.user_id} className={`border-b border-line align-middle last:border-0 ${s.disabled_at ? 'opacity-60' : ''}`}>
                      <td className="px-5 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link to={`/admin/users/${s.user_id}`} className="font-medium text-ink hover:underline">{s.name ?? s.email}</Link>
                          {me && <Badge tone="brand">{t('team.you')}</Badge>}
                          {s.disabled_at && <Badge>{t('team.disabled')}</Badge>}
                        </div>
                        {s.name && <p className="text-xs text-ink-muted">{s.email}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        {me || s.disabled_at ? <Badge tone={ROLE_TONE[s.role]}>{t(`roles.${s.role}`)}</Badge> : (
                          <select aria-label={t('team.roleFor', { who: s.email })} value={s.role} className={control}
                            onChange={(e) => setPending({ kind: 'role', staff: s, role: e.target.value as AdminRole })}>
                            {ADMIN_ROLES.map((r) => <option key={r} value={r} disabled={r !== 'super_admin' && lastSuper(s)}>{t(`roles.${r}`)}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {s.mfa
                          ? <span className="inline-flex items-center gap-1 text-status-ok"><ShieldCheck size={14} aria-hidden />{t('security.mfaOn')}</span>
                          : <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><ShieldAlert size={14} aria-hidden />{t('security.mfaOff')}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{s.last_sign_in_at ? timeAgo(s.last_sign_in_at, lng) : t('tenants.never')}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <Link to={`/admin/audit?admin=${s.user_id}`} className="text-ink hover:underline" title={s.last_action_at ? t('team.lastAction', { when: timeAgo(s.last_action_at, lng) }) : undefined}>
                          {s.actions_30d}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right">
                        <div className="inline-flex">
                          <IconButton label={t('team.rename')} onClick={() => setPending({ kind: 'rename', staff: s })}><Pencil size={15} /></IconButton>
                          {!me && (s.disabled_at
                            ? <IconButton label={t('team.enable')} onClick={() => setPending({ kind: 'enable', staff: s })}><UserCheck size={15} /></IconButton>
                            : !lastSuper(s) && <IconButton label={t('team.disable')} onClick={() => setPending({ kind: 'disable', staff: s })}><UserX size={15} /></IconButton>)}
                          {!me && !lastSuper(s) && <IconButton danger label={t('team.remove')} onClick={() => setPending({ kind: 'remove', staff: s })}><Trash2 size={15} /></IconButton>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-muted">{t('team.selfNote')}</p>
      </Card>

      {d && d.invites.length > 0 && (
        <Card title={t('team.invites')} description={t('team.invitesHint')}>
          <ul className="-my-2 divide-y divide-line">
            {d.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <Mail size={16} className="shrink-0 text-ink-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="break-all text-ink">{i.display_name ? `${i.display_name} · ` : ''}{i.email}</p>
                  <p className="text-xs text-ink-muted">
                    {t('team.invitedBy', { who: i.invited_by_email ?? '—', when: timeAgo(i.sent_at, lng) })} · {i.expired
                      ? <span className="text-amber-700 dark:text-amber-300">{t('team.expired')}</span>
                      : t('team.expires', { date: new Date(i.expires_at).toLocaleDateString(lng) })}
                  </p>
                </div>
                <Badge tone={ROLE_TONE[i.role]}>{t(`roles.${i.role}`)}</Badge>
                <div className="inline-flex">
                  <IconButton label={t('team.resend')} onClick={() => resend.mutate(i.id)}><RotateCw size={15} /></IconButton>
                  <IconButton danger label={t('team.revoke')} onClick={() => setPending({ kind: 'revoke', id: i.id, email: i.email })}><X size={15} /></IconButton>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RoleMatrix />

      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      {pending?.kind === 'rename' && <RenameDialog staff={pending.staff} onClose={close} />}
      {pending?.kind === 'role' && (
        <ConfirmDialog title={t('team.changeRole')} confirmLabel={t('team.changeRole')} busy={setRole.isPending} onClose={close}
          body={t('team.changeRoleBody', { who: pending.staff.name ?? pending.staff.email, from: t(`roles.${pending.staff.role}`), to: t(`roles.${pending.role}`) })}
          onConfirm={() => setRole.mutate({ user: pending.staff.user_id, role: pending.role }, { onSettled: close })} />
      )}
      {(pending?.kind === 'disable' || pending?.kind === 'enable') && (
        <ConfirmDialog danger={pending.kind === 'disable'} title={t(`team.${pending.kind}`)} confirmLabel={t(`team.${pending.kind}`)} busy={setDisabled.isPending} onClose={close}
          body={t(`team.${pending.kind}Body`, { who: pending.staff.name ?? pending.staff.email })}
          onConfirm={() => setDisabled.mutate({ user: pending.staff.user_id, disabled: pending.kind === 'disable' }, { onSettled: close })} />
      )}
      {pending?.kind === 'remove' && (
        <ConfirmDialog danger title={t('team.remove')} confirmLabel={t('team.remove')} busy={remove.isPending} onClose={close}
          body={t('team.removeBody', { who: pending.staff.name ?? pending.staff.email })}
          onConfirm={() => remove.mutate(pending.staff.user_id, { onSettled: close })} />
      )}
      {pending?.kind === 'revoke' && (
        <ConfirmDialog danger title={t('team.revoke')} confirmLabel={t('team.revoke')} busy={revoke.isPending} onClose={close}
          body={t('team.revokeBody', { email: pending.email })}
          onConfirm={() => revoke.mutate(pending.id, { onSettled: close })} />
      )}
    </div>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('support');
  const [error, setError] = useState<string | null>(null);
  const invite = useAdminAction(
    () => rpc<{ added: boolean }>('fp_admin_invite_staff', { p_email: email.trim(), p_role: role, p_name: name.trim() || null, p_link_base: linkBase() }),
    t('team.toast.invited'),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError(t('team.badEmail'));
      return;
    }
    setError(null);
    invite.mutate(undefined, { onSuccess: onClose });
  };
  return (
    <Modal title={t('team.invite')} onClose={onClose} closeLabel={t('close')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="inv-email" label={t('team.email')} error={error ?? undefined} hint={t('team.emailHint')}>
          <input id="inv-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={`${control} w-full`} autoFocus />
        </Field>
        <Field id="inv-name" label={t('team.name')} hint={t('team.optional')}>
          <input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${control} w-full`} />
        </Field>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-ink">{t('team.cols.role')}</legend>
          <div className="space-y-2">
            {ADMIN_ROLES.map((r) => (
              <label key={r} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${role === r ? 'border-brand bg-brand/5' : 'border-line hover:border-ink/20'}`}>
                <input type="radio" name="inv-role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-0.5 accent-[#E8552D]" />
                <span>
                  <span className="block text-sm font-medium text-ink">{t(`roles.${r}`)}</span>
                  <span className="block text-xs text-ink-muted">{t(`team.roleHint.${r}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" loading={invite.isPending}><UserPlus size={16} aria-hidden /> {t('team.sendInvite')}</Button>
        </div>
      </form>
    </Modal>
  );
}

function RenameDialog({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [name, setName] = useState(staff.display_name ?? '');
  const save = useAdminAction(() => rpc('fp_admin_rename_staff', { p_user: staff.user_id, p_name: name }), t('team.toast.renamed'));
  return (
    <Modal title={t('team.rename')} onClose={onClose} closeLabel={t('close')}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(undefined, { onSuccess: onClose }); }} className="space-y-4">
        <Field id="rn-name" label={t('team.name')} hint={t('team.renameHint', { email: staff.email })}>
          <input id="rn-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${control} w-full`} autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" loading={save.isPending}>{t('save')}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** What each role can do (from the same matrix the database enforces). */
function RoleMatrix() {
  const { t } = useTranslation('admin');
  return (
    <Card title={t('team.matrix')} description={t('team.matrixHint')}>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="px-5 py-2 font-medium">{t('team.permission')}</th>
              {ADMIN_ROLES.map((r) => <th key={r} className="px-3 py-2 text-center font-medium">{t(`roles.${r}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p} className="border-b border-line last:border-0">
                <td className="px-5 py-2 text-ink">{t(`team.perm.${p.replace('.', '_')}`)}</td>
                {ADMIN_ROLES.map((r) => (
                  <td key={r} className="px-3 py-2 text-center">
                    {roleCan(r, p)
                      ? <Check size={16} className="inline text-status-ok" aria-label={t('team.allowed')} />
                      : <span className="text-ink-muted/60" aria-label={t('team.notAllowed')}>–</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
