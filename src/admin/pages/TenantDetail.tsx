import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ArrowLeft, Building, CalendarPlus, ChevronDown, Copy, CreditCard, KeyRound, LogIn, MoreHorizontal,
  Pause, Pencil, Play, RotateCcw, Send, Trash2, UserMinus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { orgLogoUrl } from '../../lib/orgLogo';
import { resolveI18n } from '../../i18n/resolver';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { notify } from '../../components/Toaster';
import { useAdmin } from '../AdminContext';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import TenantFormDialog from '../components/TenantFormDialog';
import { SuspendDialog } from './Tenants';
import { formatMoney, formatNumber, timeAgo } from '../lib/format';
import { healthTone, tenantStatusTone } from '../lib/tenantStatus';
import {
  adminErrorMessage, rpc, useAdminAction, usePlans, useTenant, useTenantActivity, useTenantFacilities, useTenantFlags,
  useTenantInvites, useTenantNotes, useTenantUsers, type TenantDetail as Detail,
} from '../lib/tenants';

const TABS = ['overview', 'users', 'facilities', 'billing', 'features', 'activity', 'notes'] as const;
type Tab = (typeof TABS)[number];
const MEMBER_ROLES = ['org_admin', 'manager', 'technician', 'occupant', 'vendor'] as const;

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { can } = useAdmin();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'overview';
  const q = useTenant(id);
  const d = q.data;
  const plans = usePlans();
  const [dialog, setDialog] = useState<null | 'edit' | 'plan' | 'trial' | 'suspend' | 'delete'>(null);

  const reactivate = useAdminAction(() => rpc('fp_admin_set_suspended', { p_org: id, p_suspend: false }), t('tenant.toast.reactivated'));
  const restore = useAdminAction(() => rpc('fp_admin_restore_tenant', { p_org: id }), t('tenant.toast.restored'));

  if (q.isError) {
    return (
      <div className="mx-auto max-w-7xl">
        <BackLink />
        <ErrorState message={(q.error as { code?: string })?.code === 'P0002' ? t('tenant.notFound') : t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} />
      </div>
    );
  }
  if (!d) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <BackLink />
        <Skeleton className="h-16 w-80" />
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      </div>
    );
  }

  const o = d.org;
  const logo = orgLogoUrl(o.logo_path);
  const planName = (code: string | null | undefined) => {
    const p = plans.data?.find((x) => x.code === code);
    return p ? resolveI18n(p.name_i18n, lng) : code ?? t('plans.none');
  };
  const h = healthTone(d.health.score);
  const manage = can('tenants.manage');
  const deleted = d.status === 'deleted';

  return (
    <div className="mx-auto max-w-7xl">
      <BackLink />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {logo ? (
            <img src={logo} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-line bg-white object-contain p-1" />
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl text-xl font-bold text-white" style={{ background: o.brand_color || '#E8552D' }}>
              {o.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{o.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <Badge tone={tenantStatusTone(d.status)}>{t(`tenantStatus.${d.status}`)}</Badge>
              <span>{planName(d.subscription?.plan_code)}</span>
              <span aria-hidden>·</span>
              <Badge tone={h.tone}>{t(`tenant.health.${h.key}`)} · {d.health.score}</Badge>
              <span aria-hidden>·</span>
              <span>{t('tenant.created', { when: new Date(o.created_at).toLocaleDateString(lng, { day: 'numeric', month: 'short', year: 'numeric' }) })}</span>
            </div>
          </div>
        </div>
        {manage && (
          <div className="flex flex-wrap items-center gap-2">
            {deleted ? (
              <Button onClick={() => restore.mutate(undefined)} loading={restore.isPending}>
                <RotateCcw size={15} aria-hidden /> {t('tenant.actions.restore')}
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setDialog('edit')}>
                  <Pencil size={15} aria-hidden /> {t('tenant.actions.edit')}
                </Button>
                {d.status === 'suspended' ? (
                  <Button onClick={() => reactivate.mutate(undefined)} loading={reactivate.isPending}>
                    <Play size={15} aria-hidden /> {t('tenants.actions.reactivate')}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setDialog('suspend')}>
                    <Pause size={15} aria-hidden /> {t('tenants.actions.suspend')}
                  </Button>
                )}
                <MoreMenu
                  items={[
                    { key: 'plan', icon: CreditCard, label: t('tenant.actions.changePlan'), onClick: () => setDialog('plan') },
                    { key: 'trial', icon: CalendarPlus, label: t('tenant.actions.extendTrial'), onClick: () => setDialog('trial') },
                    { key: 'delete', icon: Trash2, label: t('tenant.actions.delete'), onClick: () => setDialog('delete'), danger: true },
                  ]}
                />
              </>
            )}
          </div>
        )}
      </div>

      {d.status === 'suspended' && (
        <div role="status" className="mb-4 rounded-lg border border-status-crit/30 bg-status-crit/5 px-4 py-3 text-sm text-ink">
          <strong>{t('tenant.suspendedBanner')}</strong> {o.suspended_reason && <span className="text-ink-muted">— {o.suspended_reason}</span>}
        </div>
      )}
      {deleted && (
        <div role="status" className="mb-4 rounded-lg border border-line bg-ink/5 px-4 py-3 text-sm text-ink">{t('tenant.deletedBanner', { when: timeAgo(o.deleted_at!, lng) })}</div>
      )}

      <div role="tablist" aria-label={t('tenant.tabsLabel')} className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.filter((x) => (x !== 'users' || can('users.view'))).map((x) => (
          <button
            key={x}
            role="tab"
            aria-selected={tab === x}
            onClick={() => {
              const next = new URLSearchParams(params);
              if (x === 'overview') next.delete('tab');
              else next.set('tab', x);
              setParams(next, { replace: true });
            }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === x ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {t(`tenant.tabs.${x}`)}
            {x === 'notes' && d.notes_count > 0 && <span className="ml-1.5 rounded-full bg-ink/10 px-1.5 text-[11px]">{d.notes_count}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'overview' && <OverviewTab d={d} lng={lng} />}
        {tab === 'users' && can('users.view') && <UsersTab orgId={o.id} closed={d.status === 'suspended' || deleted} lng={lng} />}
        {tab === 'facilities' && <FacilitiesTab orgId={o.id} lng={lng} />}
        {tab === 'billing' && <BillingTab d={d} lng={lng} planName={planName} onChangePlan={manage && !deleted ? () => setDialog('plan') : undefined} onExtendTrial={manage && !deleted ? () => setDialog('trial') : undefined} />}
        {tab === 'features' && <FeaturesTab orgId={o.id} />}
        {tab === 'activity' && <ActivityTab orgId={o.id} lng={lng} />}
        {tab === 'notes' && <NotesTab orgId={o.id} lng={lng} />}
      </div>

      {dialog === 'edit' && <TenantFormDialog tenant={d} onClose={() => setDialog(null)} />}
      {dialog === 'suspend' && <SuspendDialog ids={[o.id]} count={1} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />}
      {dialog === 'plan' && <ChangePlanDialog d={d} onClose={() => setDialog(null)} />}
      {dialog === 'trial' && <ExtendTrialDialog orgId={o.id} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog orgId={o.id} name={o.name} onClose={() => setDialog(null)} />}
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation('admin');
  return (
    <Link to="/admin/tenants" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
      <ArrowLeft size={15} aria-hidden /> {t('nav.items.tenants')}
    </Link>
  );
}

export function MoreMenu({ items }: { items: { key: string; icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }[] }) {
  const { t } = useTranslation('admin');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <MoreHorizontal size={16} aria-hidden /> {t('tenant.actions.more')} <ChevronDown size={14} aria-hidden />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-line bg-panel p-1 shadow-xl">
          {items.map(({ key, icon: Icon, label, onClick, danger }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onClick();
              }}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-ink/5 ${danger ? 'text-status-crit' : 'text-ink'}`}
            >
              <Icon size={15} aria-hidden /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function OverviewTab({ d, lng }: { d: Detail; lng: string }) {
  const { t } = useTranslation('admin');
  const u = d.usage;
  const o = d.org;
  const stats = [
    { key: 'members', value: u.members },
    { key: 'activeUsers', value: u.active_users_30d },
    { key: 'assets', value: u.assets },
    { key: 'sites', value: u.sites },
    { key: 'locations', value: u.locations },
    { key: 'devices', value: u.devices },
    { key: 'requests30', value: u.requests_30d },
    { key: 'workOrders30', value: u.work_orders_30d },
    { key: 'openWorkOrders', value: u.open_work_orders },
    { key: 'overdue', value: u.overdue_work_orders },
  ];
  const parts = [
    { key: 'activity', value: d.health.activity, max: 40 },
    { key: 'adoption', value: d.health.adoption, max: 30 },
    { key: 'billing', value: d.health.billing, max: 20 },
    { key: 'usage', value: d.health.usage, max: 10 },
  ];
  const h = healthTone(d.health.score);
  const details: [string, ReactNode][] = [
    ['contact', [o.contact_name, o.contact_email, o.contact_phone].filter(Boolean).join(' · ') || '—'],
    ['address', o.address || '—'],
    ['timezone', o.timezone || 'Asia/Ho_Chi_Minh'],
    ['currency', o.currency],
    ['language', o.default_lng === 'vi' ? 'Tiếng Việt' : 'English'],
    ['industry', o.industry ? t(`industries.${o.industry}`, { defaultValue: o.industry }) : '—'],
    ['subdomain', o.subdomain ? `${o.subdomain}.facilitypro.tech` : '—'],
    ['lastActive', o.last_active_at ? timeAgo(o.last_active_at, lng) : t('tenants.never')],
    ['storage', formatBytes(u.storage_bytes, lng)],
    ['id', <code key="id" className="text-xs">{o.id}</code>],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title={t('tenant.healthTitle')} description={t('tenant.healthHint')}>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tabular-nums text-ink">{d.health.score}</span>
          <span className="text-sm text-ink-muted">/ 100</span>
          <Badge tone={h.tone}>{t(`tenant.health.${h.key}`)}</Badge>
        </div>
        <ul className="mt-4 space-y-2.5">
          {parts.map((p) => (
            <li key={p.key}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-ink">{t(`tenant.healthParts.${p.key}`)}</span>
                <span className="tabular-nums text-ink-muted">{p.value} / {p.max}</span>
              </div>
              <div className="h-1.5 rounded-full bg-ink/5">
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `${(p.value / p.max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t('tenant.usageTitle')} className="lg:col-span-2">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
          {stats.map((s) => (
            <div key={s.key}>
              <dt className="text-xs text-ink-muted">{t(`tenant.stats.${s.key}`)}</dt>
              <dd className={`text-xl font-semibold tabular-nums ${s.key === 'overdue' && s.value > 0 ? 'text-status-crit' : 'text-ink'}`}>{formatNumber(s.value, lng)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
          {(['members', 'assets', 'sites'] as const).map((k) => (
            <Limit key={k} label={t(`tenant.stats.${k}`)} used={k === 'members' ? u.members : k === 'assets' ? u.assets : u.sites} limit={d.limits[k]} lng={lng} />
          ))}
        </div>
      </Card>
      <Card title={t('tenant.profileTitle')} className="lg:col-span-3">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {details.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-ink-muted">{t(`tenant.profile.${k}`)}</dt>
              <dd className="truncate text-sm text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function Limit({ label, used, limit, lng }: { label: string; used: number; limit: number | null; lng: string }) {
  const { t } = useTranslation('admin');
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-ink">{label}</span>
        <span className="tabular-nums text-ink-muted">{formatNumber(used, lng)} / {limit === null ? t('tenant.unlimited') : formatNumber(limit, lng)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink/5">
        <div className={`h-1.5 rounded-full ${pct >= 90 ? 'bg-status-crit' : 'bg-brand'}`} style={{ width: limit ? `${pct}%` : '0%' }} />
      </div>
    </div>
  );
}

function formatBytes(n: number, lng: string) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(lng, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 }).format(v)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
function UsersTab({ orgId, closed, lng }: { orgId: string; closed: boolean; lng: string }) {
  const { t } = useTranslation('admin');
  const { can } = useAdmin();
  const users = useTenantUsers(orgId);
  const invites = useTenantInvites(orgId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof MEMBER_ROLES)[number]>('technician');
  const [removing, setRemoving] = useState<{ id: string; email: string } | null>(null);
  const [impersonating, setImpersonating] = useState<{ id: string; email: string } | null>(null);
  const manage = can('users.manage');

  const invite = useAdminAction((v: { email: string; role: string }) => rpc('fp_admin_invite_member', { p_org: orgId, p_email: v.email, p_role: v.role }), t('tenant.users.invited'));
  const setMemberRole = useAdminAction((v: { user: string; role: string }) => rpc('fp_admin_set_member_role', { p_org: orgId, p_user: v.user, p_role: v.role }), t('tenant.users.roleChanged'));
  const remove = useAdminAction((user: string) => rpc('fp_admin_remove_member', { p_org: orgId, p_user: user }), t('tenant.users.removed'));

  const resetPassword = async (userEmail: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) {
      notify(adminErrorMessage(error), 'error');
      return;
    }
    await supabase.rpc('fp_admin_record', { p_action: 'user.password_reset', p_org: orgId, p_target: userEmail, p_detail: null });
    notify(t('tenant.users.resetSent', { email: userEmail }), 'success');
  };

  return (
    <div className="space-y-4">
      {manage && !closed && (
        <Card title={t('tenant.users.inviteTitle')}>
          <form
            className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = z.string().trim().email().safeParse(email);
              if (!parsed.success) {
                notify(t('tenants.form.errors.email'), 'error');
                return;
              }
              invite.mutate({ email: parsed.data, role }, { onSuccess: () => setEmail('') });
            }}
          >
            <Input type="email" aria-label={t('tenant.users.email')} placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select aria-label={t('tenant.users.role')} value={role} onChange={(e) => setRole(e.target.value as (typeof MEMBER_ROLES)[number])}>
              {MEMBER_ROLES.map((r) => <option key={r} value={r}>{t(`memberRoles.${r}`)}</option>)}
            </Select>
            <Button type="submit" loading={invite.isPending}><Send size={15} aria-hidden /> {t('tenant.users.invite')}</Button>
          </form>
        </Card>
      )}

      <Card
        title={t('tenant.users.title', { count: users.data?.length ?? 0 })}
        actions={<Link to={`/admin/users?org=${orgId}`} className="text-sm text-brand-600 hover:underline dark:text-brand">{t('tenant.users.openInUsers')}</Link>}
      >
        {users.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : users.isError ? (
          <ErrorState message={t('errors.load')} onRetry={() => void users.refetch()} retryLabel={t('retry')} />
        ) : (users.data ?? []).length === 0 ? (
          <EmptyState title={t('tenant.users.empty')} />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-5 py-2 font-medium">{t('tenant.users.user')}</th>
                  <th className="px-3 py-2 font-medium">{t('tenant.users.role')}</th>
                  <th className="px-3 py-2 font-medium">{t('tenant.users.lastSignIn')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('tenant.users.activeDays')}</th>
                  <th className="px-5 py-2 text-right font-medium"><span className="sr-only">{t('tenant.users.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {(users.data ?? []).map((u) => (
                  <tr key={u.user_id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      <Link to={`/admin/users/${u.user_id}`} className="font-medium text-ink hover:underline">{u.full_name ?? u.email}</Link>
                      <p className="text-xs text-ink-muted">
                        {u.email}
                        {!u.confirmed && <> · <Badge tone="warn">{t('tenant.users.unconfirmed')}</Badge></>}
                        {u.banned && <> · <Badge tone="crit">{t('tenant.users.banned')}</Badge></>}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      {manage && !closed ? (
                        <select
                          aria-label={t('tenant.users.role')}
                          value={u.role}
                          onChange={(e) => setMemberRole.mutate({ user: u.user_id, role: e.target.value })}
                          className="h-8 rounded-md border border-line bg-panel px-2 text-sm text-ink"
                        >
                          {MEMBER_ROLES.map((r) => <option key={r} value={r}>{t(`memberRoles.${r}`)}</option>)}
                        </select>
                      ) : (
                        t(`memberRoles.${u.role}`, { defaultValue: u.role })
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{u.last_sign_in_at ? timeAgo(u.last_sign_in_at, lng) : t('tenants.never')}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{u.active_days_30}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex justify-end gap-1">
                        {can('tenants.impersonate') && !closed && (
                          <IconButton label={t('tenant.users.impersonate')} onClick={() => setImpersonating({ id: u.user_id, email: u.email })}><LogIn size={15} aria-hidden /></IconButton>
                        )}
                        {manage && (
                          <IconButton label={t('tenant.users.resetPassword')} onClick={() => void resetPassword(u.email)}><KeyRound size={15} aria-hidden /></IconButton>
                        )}
                        {manage && (
                          <IconButton label={t('tenant.users.remove')} danger onClick={() => setRemoving({ id: u.user_id, email: u.email })}><UserMinus size={15} aria-hidden /></IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(invites.data ?? []).length > 0 && (
        <Card title={t('tenant.users.pending')}>
          <ul className="divide-y divide-line text-sm">
            {(invites.data ?? []).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-ink">{i.email} <span className="text-ink-muted">· {t(`memberRoles.${i.role}`, { defaultValue: i.role })}</span></span>
                <span className="text-xs text-ink-muted">{t('tenant.users.expires', { when: timeAgo(i.expires_at, lng) })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {removing && (
        <ConfirmDialog
          title={t('tenant.users.removeTitle')}
          body={t('tenant.users.removeBody', { email: removing.email })}
          confirmLabel={t('tenant.users.remove')}
          danger
          busy={remove.isPending}
          onClose={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
        />
      )}
      {impersonating && <ImpersonateDialog orgId={orgId} user={impersonating} onClose={() => setImpersonating(null)} />}
    </div>
  );
}

export function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 ${danger ? 'hover:text-status-crit' : 'hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

export function ImpersonateDialog({ orgId, user, onClose }: { orgId: string; user: { id: string; email: string }; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('admin-impersonate', { body: { org_id: orgId, user_id: user.id, reason: reason.trim() } });
    setBusy(false);
    const code = (data as { error?: string } | null)?.error;
    if (error || code || !(data as { url?: string })?.url) {
      notify(t(`tenant.impersonate.errors.${code ?? 'failed'}`, { defaultValue: t('tenant.impersonate.errors.failed') }), 'error');
      return;
    }
    setLink((data as { url: string }).url);
  };

  return (
    <Modal title={t('tenant.impersonate.title', { email: user.email })} onClose={onClose} closeLabel={t('close')}>
      {!link ? (
        <>
          <p className="text-sm text-ink-muted">{t('tenant.impersonate.body')}</p>
          <label htmlFor="imp-reason" className="mb-1 mt-4 block text-sm font-medium text-ink">{t('tenant.impersonate.reason')}</label>
          <textarea id="imp-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder={t('tenant.impersonate.reasonPlaceholder')}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
          <p className="mt-1 text-xs text-ink-muted">{t('tenant.impersonate.audited')}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
            <Button onClick={() => void start()} loading={busy} disabled={reason.trim().length < 10}><LogIn size={15} aria-hidden /> {t('tenant.impersonate.create')}</Button>
          </div>
        </>
      ) : (
        <>
          <p className="rounded-lg border border-status-warn/40 bg-status-warn/10 p-3 text-sm text-ink">{t('tenant.impersonate.privateWindow')}</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
            <code className="min-w-0 flex-1 truncate text-xs text-ink">{link}</code>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(link).then(() => notify(t('tenant.impersonate.copied'), 'success'))} className="inline-flex h-8 items-center gap-1 rounded-md bg-brand px-3 text-xs font-semibold text-white">
              <Copy size={13} aria-hidden /> {t('copy')}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{t('tenant.impersonate.oneTime')}</p>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={onClose}>{t('close')}</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------
function FacilitiesTab({ orgId, lng }: { orgId: string; lng: string }) {
  const { t } = useTranslation('admin');
  const f = useTenantFacilities(orgId);
  if (f.isLoading) return <Skeleton className="h-48" />;
  if (f.isError || !f.data) return <ErrorState message={t('errors.load')} onRetry={() => void f.refetch()} retryLabel={t('retry')} />;
  const { sites, buildings, facilities, desks } = f.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t('tenant.facilities.sites', { count: sites.length })}>
        {sites.length === 0 ? <EmptyState title={t('tenant.facilities.noSites')} /> : (
          <ul className="divide-y divide-line">
            {sites.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{resolveI18n(s.name ?? {}, lng) || '—'}</span>
                  {s.address && <span className="block truncate text-xs text-ink-muted">{s.address}</span>}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">{t('tenant.facilities.counts', { locations: s.locations, assets: s.assets })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('tenant.facilities.buildings', { count: buildings.length })} description={t('tenant.facilities.extra', { facilities, desks })}>
        {buildings.length === 0 ? <EmptyState title={t('tenant.facilities.noBuildings')} icon={Building} /> : (
          <ul className="divide-y divide-line">
            {buildings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{resolveI18n(b.name ?? {}, lng) || '—'}</span>
                  <span className="block text-xs text-ink-muted">{t(`locationKinds.${b.kind}`, { defaultValue: b.kind })}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-muted">{t('tenant.facilities.childCounts', { children: b.children, assets: b.assets })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscription & billing
// ---------------------------------------------------------------------------
function BillingTab({ d, lng, planName, onChangePlan, onExtendTrial }: {
  d: Detail; lng: string; planName: (c: string | null | undefined) => string; onChangePlan?: () => void; onExtendTrial?: () => void;
}) {
  const { t } = useTranslation('admin');
  const { can } = useAdmin();
  const s = d.subscription;
  const invoices = useQuery({
    queryKey: ['admin_tenant_invoices', d.org.id],
    enabled: can('billing.view'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_platform_invoices')
        .select('id, number, amount, currency, status, provider, issued_at, paid_at')
        .eq('org_id', d.org.id)
        .order('issued_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as { id: string; number: string; amount: number; currency: string; status: string; provider: string; issued_at: string; paid_at: string | null }[];
    },
  });
  const rows: [string, ReactNode][] = s
    ? [
        ['plan', planName(s.plan_code)],
        ['status', t(`subStatus.${s.status}`, { defaultValue: s.status })],
        ['interval', s.billing_interval === 'year' ? t('tenants.form.yearly') : t('tenants.form.monthly')],
        ['provider', s.provider ? t(`providers.${s.provider}`, { defaultValue: s.provider }) : '—'],
        ['mrr', d.mrr ? formatMoney(d.mrr, 'USD', lng) : '—'],
        [s.status === 'trialing' ? 'trialEnds' : 'periodEnd',
          (s.status === 'trialing' ? s.trial_ends_at ?? s.current_period_end : s.current_period_end)
            ? new Date((s.status === 'trialing' ? s.trial_ends_at ?? s.current_period_end : s.current_period_end)!).toLocaleDateString(lng, { day: 'numeric', month: 'short', year: 'numeric' })
            : '—'],
      ]
    : [];
  const tone: Record<string, 'ok' | 'crit' | 'warn' | 'neutral' | 'info'> = { paid: 'ok', failed: 'crit', open: 'info', refunded: 'warn', void: 'neutral', draft: 'neutral' };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        title={t('tenant.billing.subscription')}
        actions={
          <div className="flex gap-2">
            {onExtendTrial && <Button variant="secondary" onClick={onExtendTrial}><CalendarPlus size={15} aria-hidden /> {t('tenant.actions.extendTrial')}</Button>}
            {onChangePlan && <Button onClick={onChangePlan}><CreditCard size={15} aria-hidden /> {t('tenant.actions.changePlan')}</Button>}
          </div>
        }
        className="lg:col-span-3"
      >
        {!s ? <EmptyState title={t('tenant.billing.none')} /> : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-ink-muted">{t(`tenant.billing.${k}`)}</dt>
                <dd className="text-sm font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {s?.requested_plan_code && (
          <p className="mt-4 rounded-lg bg-status-info/10 px-3 py-2 text-sm text-ink">{t('tenant.billing.requested', { plan: planName(s.requested_plan_code) })}</p>
        )}
        {s?.cancel_requested_at && (
          <p className="mt-2 rounded-lg bg-status-warn/10 px-3 py-2 text-sm text-ink">{t('tenant.billing.cancelRequested', { when: timeAgo(s.cancel_requested_at, lng) })}</p>
        )}
      </Card>
      <Card title={t('tenant.billing.invoices')} className="lg:col-span-3">
        {!can('billing.view') ? (
          <EmptyState title={t('tenant.billing.noAccess')} body={t('tenant.billing.noAccessBody')} />
        ) : invoices.isLoading ? <Skeleton className="h-24" /> : (invoices.data ?? []).length === 0 ? (
          <EmptyState title={t('tenant.billing.noInvoices')} />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-5 py-2 font-medium">{t('tenant.billing.number')}</th>
                  <th className="px-3 py-2 font-medium">{t('tenant.billing.issued')}</th>
                  <th className="px-3 py-2 font-medium">{t('tenant.billing.provider')}</th>
                  <th className="px-3 py-2 font-medium">{t('tenant.billing.status')}</th>
                  <th className="px-5 py-2 text-right font-medium">{t('tenant.billing.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {(invoices.data ?? []).map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2 font-mono text-xs">{i.number}</td>
                    <td className="px-3 py-2 text-ink-muted">{new Date(i.issued_at).toLocaleDateString(lng)}</td>
                    <td className="px-3 py-2">{t(`providers.${i.provider}`, { defaultValue: i.provider })}</td>
                    <td className="px-3 py-2"><Badge tone={tone[i.status] ?? 'neutral'}>{t(`invoiceStatus.${i.status}`, { defaultValue: i.status })}</Badge></td>
                    <td className="px-5 py-2 text-right tabular-nums">{formatMoney(Number(i.amount), i.currency, lng)}</td>
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

function ChangePlanDialog({ d, onClose }: { d: Detail; onClose: () => void }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const plans = usePlans();
  const s = d.subscription;
  const [plan, setPlan] = useState(s?.plan_code ?? 'pro');
  const [interval, setInterval] = useState<'month' | 'year'>(s?.billing_interval === 'year' ? 'year' : 'month');
  const [status, setStatus] = useState(s?.status && ['active', 'trialing', 'past_due', 'canceled'].includes(s.status) ? s.status : 'active');
  const change = useAdminAction(() => rpc('fp_admin_change_plan', { p_org: d.org.id, p_plan: plan, p_interval: interval, p_status: status }), t('tenant.toast.planChanged'));
  return (
    <Modal title={t('tenant.actions.changePlan')} onClose={onClose} closeLabel={t('close')}>
      <div className="space-y-3">
        <label className="block text-sm font-medium text-ink" htmlFor="cp-plan">{t('tenants.form.plan')}</label>
        <Select id="cp-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {(plans.data ?? []).map((p) => (
            <option key={p.code} value={p.code}>{resolveI18n(p.name_i18n, lng)} — {formatMoney(p.price, p.currency, lng)}/{t('tenant.perMonth')}</option>
          ))}
        </Select>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="cp-int">{t('tenants.form.interval')}</label>
            <Select id="cp-int" value={interval} onChange={(e) => setInterval(e.target.value as 'month' | 'year')}>
              <option value="month">{t('tenants.form.monthly')}</option>
              <option value="year">{t('tenants.form.yearly')}</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="cp-status">{t('tenant.billing.status')}</label>
            <Select id="cp-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {['active', 'trialing', 'past_due', 'canceled'].map((x) => <option key={x} value={x}>{t(`subStatus.${x}`)}</option>)}
            </Select>
          </div>
        </div>
        <p className="text-xs text-ink-muted">{t('tenant.planNote')}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button loading={change.isPending} onClick={() => change.mutate(undefined, { onSuccess: onClose })}>{t('save')}</Button>
      </div>
    </Modal>
  );
}

function ExtendTrialDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [days, setDays] = useState(14);
  const extend = useAdminAction(() => rpc('fp_admin_extend_trial', { p_org: orgId, p_days: days }), t('tenant.toast.trialExtended', { count: days }));
  return (
    <Modal title={t('tenant.actions.extendTrial')} onClose={onClose} closeLabel={t('close')}>
      <label className="mb-1 block text-sm font-medium text-ink" htmlFor="tr-days">{t('tenant.trialDays')}</label>
      <div className="flex flex-wrap gap-2">
        {[7, 14, 30].map((n) => (
          <button key={n} type="button" onClick={() => setDays(n)} className={`rounded-md border px-3 py-1.5 text-sm ${days === n ? 'border-brand bg-brand/10 text-ink' : 'border-line text-ink-muted hover:text-ink'}`}>
            {t('tenant.days', { count: n })}
          </button>
        ))}
        <Input id="tr-days" type="number" min={1} max={90} value={String(days)} onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))} className="w-24" />
      </div>
      <p className="mt-2 text-xs text-ink-muted">{t('tenant.trialNote')}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button loading={extend.isPending} onClick={() => extend.mutate(undefined, { onSuccess: onClose })}>{t('tenant.actions.extendTrial')}</Button>
      </div>
    </Modal>
  );
}

function DeleteDialog({ orgId, name, onClose }: { orgId: string; name: string; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const del = useAdminAction(() => rpc('fp_admin_delete_tenant', { p_org: orgId, p_confirm_name: typed.trim() }), t('tenant.toast.deleted'));
  return (
    <Modal title={t('tenant.delete.title')} onClose={onClose} closeLabel={t('close')}>
      <p className="text-sm text-ink">{t('tenant.delete.body')}</p>
      <label className="mb-1 mt-4 block text-sm text-ink" htmlFor="del-name">{t('tenant.delete.typeName', { name })}</label>
      <Input id="del-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button variant="danger" disabled={typed.trim() !== name} loading={del.isPending} onClick={() => del.mutate(undefined, { onSuccess: () => navigate('/admin/tenants') })}>
          <Trash2 size={15} aria-hidden /> {t('tenant.actions.delete')}
        </Button>
      </div>
    </Modal>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger, busy, onClose, onConfirm }: {
  title: string; body: string; confirmLabel: string; danger?: boolean; busy?: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const { t } = useTranslation('admin');
  return (
    <Modal title={title} onClose={onClose} closeLabel={t('close')}>
      <p className="text-sm text-ink">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
function FeaturesTab({ orgId }: { orgId: string }) {
  const { t } = useTranslation('admin');
  const { can } = useAdmin();
  const flags = useTenantFlags(orgId);
  const set = useAdminAction((v: { key: string; enabled: boolean | null }) => rpc('fp_admin_set_tenant_flag', { p_org: orgId, p_key: v.key, p_enabled: v.enabled }), t('tenant.features.saved'));
  if (flags.isLoading) return <Skeleton className="h-48" />;
  if (flags.isError) return <ErrorState message={t('errors.load')} onRetry={() => void flags.refetch()} retryLabel={t('retry')} />;
  const groups = (['module', 'feature'] as const).map((k) => ({ k, rows: (flags.data ?? []).filter((f) => f.kind === k) })).filter((g) => g.rows.length);
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.k} title={t(`tenant.features.${g.k}s`)} description={t('tenant.features.hint')}>
          <ul className="divide-y divide-line">
            {g.rows.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{t(`modules.${f.key}`, { defaultValue: f.description ?? f.key })}</p>
                  <p className="text-xs text-ink-muted">
                    <code>{f.key}</code> · {t('tenant.features.global', { state: f.global_enabled ? t('tenant.features.on') : t('tenant.features.off'), pct: f.rollout_pct })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={f.effective ? 'ok' : 'neutral'}>{f.effective ? t('tenant.features.enabled') : t('tenant.features.disabled')}</Badge>
                  {can('tenants.manage') && (
                    <select
                      aria-label={t('tenant.features.override', { name: f.key })}
                      value={f.override === null ? 'default' : f.override ? 'on' : 'off'}
                      onChange={(e) => set.mutate({ key: f.key, enabled: e.target.value === 'default' ? null : e.target.value === 'on' })}
                      className="h-8 rounded-md border border-line bg-panel px-2 text-sm text-ink"
                    >
                      <option value="default">{t('tenant.features.default')}</option>
                      <option value="on">{t('tenant.features.forceOn')}</option>
                      <option value="off">{t('tenant.features.forceOff')}</option>
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------
function ActivityTab({ orgId, lng }: { orgId: string; lng: string }) {
  const { t } = useTranslation('admin');
  const a = useTenantActivity(orgId);
  if (a.isLoading) return <Skeleton className="h-48" />;
  if (a.isError) return <ErrorState message={t('errors.load')} onRetry={() => void a.refetch()} retryLabel={t('retry')} />;
  const rows = a.data ?? [];
  if (!rows.length) return <EmptyState title={t('tenant.activity.empty')} />;
  return (
    <Card>
      <ol className="relative space-y-4 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-line">
        {rows.map((r, i) => (
          <li key={i} className="relative pl-6">
            <span className={`absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-2 ring-panel ${r.kind === 'admin' ? 'bg-ink-muted' : 'bg-brand'}`} aria-hidden />
            <p className="text-sm text-ink">
              {r.kind === 'event'
                ? t(`events.${r.action}`, { defaultValue: r.action })
                : t(`auditActions.${r.action.split(':')[0].replace(/\./g, '_')}`, { defaultValue: r.action })}
              {r.actor_email && <span className="text-ink-muted"> · {r.actor_email}</span>}
            </p>
            <p className="text-xs text-ink-muted">
              {new Date(r.at).toLocaleString(lng)}
              {typeof r.detail?.ip === 'string' && ` · IP ${r.detail.ip}`}
              {typeof (r.detail?.after as { reason?: unknown } | null | undefined)?.reason === 'string' && ` · ${(r.detail!.after as { reason: string }).reason}`}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
function NotesTab({ orgId, lng }: { orgId: string; lng: string }) {
  const { t } = useTranslation('admin');
  const { user } = useAuth();
  const { can } = useAdmin();
  const notes = useTenantNotes(orgId);
  const [body, setBody] = useState('');
  const add = useAdminAction(async (text: string) => {
    const { error } = await supabase.from('fp_admin_notes').insert({ org_id: orgId, body: text, author_id: user?.id });
    if (error) throw error;
  }, t('tenant.notes.added'));
  const del = useAdminAction(async (id: string) => {
    const { error } = await supabase.from('fp_admin_notes').delete().eq('id', id);
    if (error) throw error;
  }, t('tenant.notes.deleted'));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title={t('tenant.notes.add')} description={t('tenant.notes.hint')}>
        <form onSubmit={(e) => { e.preventDefault(); if (body.trim()) add.mutate(body.trim(), { onSuccess: () => setBody('') }); }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} aria-label={t('tenant.notes.add')}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
          <Button type="submit" className="mt-2 w-full" loading={add.isPending} disabled={!body.trim()}>{t('tenant.notes.save')}</Button>
        </form>
      </Card>
      <Card title={t('tenant.notes.title', { count: notes.data?.length ?? 0 })} className="lg:col-span-2">
        {notes.isLoading ? <Skeleton className="h-24" /> : (notes.data ?? []).length === 0 ? <EmptyState title={t('tenant.notes.empty')} /> : (
          <ul className="space-y-3">
            {(notes.data ?? []).map((n) => (
              <li key={n.id} className="rounded-lg border border-line p-3">
                <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
                  <span>{timeAgo(n.created_at, lng)}{n.author_id === user?.id && ` · ${t('tenant.notes.you')}`}</span>
                  {(n.author_id === user?.id || can('tenants.manage')) && (
                    <button type="button" onClick={() => del.mutate(n.id)} className="inline-flex items-center gap-1 hover:text-status-crit">
                      <Trash2 size={12} aria-hidden /> {t('tenant.notes.delete')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

