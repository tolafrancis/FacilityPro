import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Megaphone, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, type Tone } from '../components/ui';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { resolveI18n } from '../../i18n/resolver';
import { fetchTenants, rpc, useAdminAction, usePlans } from '../lib/tenants';
import { useAdminAnnouncements, type AdminAnnouncement } from '../lib/appmanagement';
import { ConfirmDialog } from './TenantDetail';
import { Field } from './billing/shared';

const STATE_TONE: Record<AdminAnnouncement['state'], Tone> = { live: 'ok', scheduled: 'info', draft: 'neutral', ended: 'neutral' };
const LEVEL_TONE: Record<AdminAnnouncement['level'], Tone> = { info: 'info', warning: 'warn', critical: 'crit' };

/** datetime-local value ↔ ISO */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export default function Announcements() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const list = useAdminAnnouncements();
  const [editing, setEditing] = useState<AdminAnnouncement | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminAnnouncement | null>(null);
  const save = useAdminAction((p: Record<string, unknown>) => rpc('fp_admin_save_announcement', { p }), t('announcements.toast.saved'));
  const del = useAdminAction(async (id: string) => {
    const { error } = await supabase.from('fp_announcements').delete().eq('id', id);
    if (error) throw error;
  }, t('announcements.toast.deleted'));
  const keep = (a: AdminAnnouncement) => ({ id: a.id, title: a.title, body: a.body, level: a.level, audience: a.audience, plan_codes: a.plan_codes, org_ids: a.org_ids, published_at: a.published_at, expires_at: a.expires_at });
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lng, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('nav.items.announcements')} description={t('announcements.subtitle')}
        actions={<Button onClick={() => setEditing('new')}><Plus size={16} aria-hidden /> {t('announcements.new')}</Button>} />
      {list.isError ? <ErrorState message={t('errors.load')} onRetry={() => void list.refetch()} retryLabel={t('retry')} />
        : list.isLoading ? <Skeleton className="h-64" />
        : (list.data ?? []).length === 0 ? <Card><EmptyState title={t('announcements.empty')} body={t('announcements.emptyBody')} /></Card>
        : (
          <div className="space-y-3">
            {(list.data ?? []).map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATE_TONE[a.state]}>{t(`announcements.state.${a.state}`)}</Badge>
                      <Badge tone={LEVEL_TONE[a.level]}>{t(`announcements.level.${a.level}`)}</Badge>
                      <span className="text-xs text-ink-muted">
                        {a.audience === 'all' ? t('announcements.toAll') : a.audience === 'plans' ? t('announcements.toPlans', { plans: a.plan_codes.join(', ') }) : t('announcements.toTenants', { count: a.org_ids.length })}
                      </span>
                    </div>
                    <p className="mt-2 font-medium text-ink">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-ink-muted">{a.body}</p>
                    <p className="mt-2 text-xs text-ink-muted">
                      {a.published_at ? t('announcements.from', { when: when(a.published_at) }) : t('announcements.notPublished')}
                      {a.expires_at && ` · ${t('announcements.until', { when: when(a.expires_at) })}`}
                      {' · '}{t('announcements.reach', { count: a.tenants })}
                      {a.dismissed > 0 && ` · ${t('announcements.dismissed', { count: a.dismissed })}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {(a.state === 'draft' || a.state === 'ended') && (
                      <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate({ ...keep(a), published_at: new Date().toISOString(), expires_at: a.state === 'ended' ? null : a.expires_at })}>{t('announcements.publishNow')}</Button>
                    )}
                    {(a.state === 'live' || a.state === 'scheduled') && (
                      <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate({ ...keep(a), published_at: a.state === 'scheduled' ? null : a.published_at, expires_at: a.state === 'live' ? new Date().toISOString() : a.expires_at })}>
                        {a.state === 'live' ? t('announcements.endNow') : t('announcements.unschedule')}
                      </Button>
                    )}
                    <button type="button" onClick={() => setEditing(a)} aria-label={t('announcements.edit', { title: a.title })} className="grid h-10 w-10 place-items-center rounded-lg text-ink-muted hover:bg-ink/5 hover:text-ink"><Pencil size={16} aria-hidden /></button>
                    <button type="button" onClick={() => setDeleting(a)} aria-label={t('announcements.delete', { title: a.title })} className="grid h-10 w-10 place-items-center rounded-lg text-ink-muted hover:bg-ink/5 hover:text-status-crit"><Trash2 size={16} aria-hidden /></button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      {editing && <AnnouncementDialog a={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog title={t('announcements.deleteTitle')} body={t('announcements.deleteBody', { title: deleting.title })} confirmLabel={t('announcements.deleteConfirm')} danger
          busy={del.isPending} onClose={() => setDeleting(null)} onConfirm={() => del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })} />
      )}
    </div>
  );
}

function AnnouncementDialog({ a, onClose }: { a: AdminAnnouncement | null; onClose: () => void }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const plans = usePlans();
  const [title, setTitle] = useState(a?.title ?? '');
  const [body, setBody] = useState(a?.body ?? '');
  const [level, setLevel] = useState<AdminAnnouncement['level']>(a?.level ?? 'info');
  const [audience, setAudience] = useState<AdminAnnouncement['audience']>(a?.audience ?? 'all');
  const [planCodes, setPlanCodes] = useState<string[]>(a?.plan_codes ?? []);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>((a?.org_ids ?? []).map((id) => ({ id, name: '…' })));
  const [start, setStart] = useState<'now' | 'later' | 'draft'>(a ? (a.published_at ? (new Date(a.published_at) > new Date() ? 'later' : 'now') : 'draft') : 'now');
  const [startAt, setStartAt] = useState(toLocal(a?.published_at ?? null));
  const [endAt, setEndAt] = useState(toLocal(a?.expires_at ?? null));
  const [tenantQuery, setTenantQuery] = useState('');
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);

  // Names for tenants already chosen.
  useEffect(() => {
    if (!a?.org_ids.length) return;
    fetchTenants({ ids: a.org_ids, sort: 'name', desc: false, limit: 200, offset: 0 })
      .then((r) => setOrgs(r.rows.map((x) => ({ id: x.id, name: x.name })))).catch(() => undefined);
  }, [a]);
  useEffect(() => {
    if (tenantQuery.trim().length < 2) { setFound([]); return; }
    const id = setTimeout(() => {
      fetchTenants({ search: tenantQuery.trim(), sort: 'name', desc: false, limit: 8, offset: 0 })
        .then((r) => setFound(r.rows.map((x) => ({ id: x.id, name: x.name })))).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(id);
  }, [tenantQuery]);

  const save = useAdminAction(() => rpc('fp_admin_save_announcement', {
    p: {
      id: a?.id ?? null, title, body, level, audience, plan_codes: planCodes, org_ids: orgs.map((o) => o.id),
      published_at: start === 'draft' ? null : start === 'now' ? (a?.published_at && new Date(a.published_at) <= new Date() ? a.published_at : new Date().toISOString()) : fromLocal(startAt),
      expires_at: fromLocal(endAt),
    },
  }), t('announcements.toast.saved'));
  const valid = title.trim() && body.trim() && (audience !== 'plans' || planCodes.length) && (audience !== 'tenants' || orgs.length) && (start !== 'later' || startAt);

  return (
    <Modal title={a ? t('announcements.editTitle') : t('announcements.new')} onClose={onClose} closeLabel={t('close')} wide>
      <div className="space-y-3">
        <Field id="an-title" label={t('announcements.title')}><Input id="an-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field id="an-body" label={t('announcements.body')}>
          <textarea id="an-body" rows={4} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="an-level" label={t('announcements.levelLabel')} hint={level === 'critical' ? t('announcements.criticalHint') : undefined}>
            <Select id="an-level" value={level} onChange={(e) => setLevel(e.target.value as AdminAnnouncement['level'])}>
              {(['info', 'warning', 'critical'] as const).map((x) => <option key={x} value={x}>{t(`announcements.level.${x}`)}</option>)}
            </Select>
          </Field>
          <Field id="an-aud" label={t('announcements.audience')}>
            <Select id="an-aud" value={audience} onChange={(e) => setAudience(e.target.value as AdminAnnouncement['audience'])}>
              {(['all', 'plans', 'tenants'] as const).map((x) => <option key={x} value={x}>{t(`announcements.audiences.${x}`)}</option>)}
            </Select>
          </Field>
        </div>
        {audience === 'plans' && (
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 text-sm font-medium text-ink">{t('announcements.choosePlans')}</legend>
            {(plans.data ?? []).map((p) => (
              <label key={p.code} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="accent-[#E8552D]" checked={planCodes.includes(p.code)}
                  onChange={(e) => setPlanCodes((x) => (e.target.checked ? [...x, p.code] : x.filter((c) => c !== p.code)))} />
                {resolveI18n(p.name_i18n, lng)}
              </label>
            ))}
          </fieldset>
        )}
        {audience === 'tenants' && (
          <div>
            <p className="mb-1 text-sm font-medium text-ink">{t('announcements.chooseTenants')}</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {orgs.map((o) => (
                <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-ink/5 py-0.5 pl-2.5 pr-1 text-xs text-ink">
                  {o.name}
                  <button type="button" onClick={() => setOrgs((x) => x.filter((y) => y.id !== o.id))} aria-label={t('announcements.removeTenant', { name: o.name })} className="grid h-5 w-5 place-items-center rounded-full hover:bg-ink/10"><X size={12} aria-hidden /></button>
                </span>
              ))}
            </div>
            <div className="relative">
              <Input aria-label={t('billing.findTenant')} value={tenantQuery} onChange={(e) => setTenantQuery(e.target.value)} placeholder={t('billing.findTenant')} autoComplete="off" />
              {found.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-panel p-1 shadow-lg">
                  {found.filter((f) => !orgs.some((o) => o.id === f.id)).map((f) => (
                    <li key={f.id}><button type="button" onClick={() => { setOrgs((x) => [...x, f]); setTenantQuery(''); setFound([]); }} className="w-full rounded-md px-3 py-1.5 text-left text-sm text-ink hover:bg-ink/5">{f.name}</button></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="an-start" label={t('announcements.show')}>
            <Select id="an-start" value={start} onChange={(e) => setStart(e.target.value as typeof start)}>
              <option value="now">{t('announcements.startNow')}</option>
              <option value="later">{t('announcements.startLater')}</option>
              <option value="draft">{t('announcements.startDraft')}</option>
            </Select>
            {start === 'later' && <Input className="mt-2" type="datetime-local" aria-label={t('announcements.startAt')} value={startAt} onChange={(e) => setStartAt(e.target.value)} />}
          </Field>
          <Field id="an-end" label={t('announcements.endAt')} hint={t('announcements.endHint')}>
            <Input id="an-end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </Field>
        </div>
        {title.trim() && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{t('announcements.preview')}</p>
            <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${level === 'critical' ? 'border-status-crit/40 bg-status-crit/10' : level === 'warning' ? 'border-status-warn/40 bg-status-warn/10' : 'border-status-info/30 bg-status-info/10'}`}>
              {level === 'info' ? <Megaphone size={18} className="mt-0.5 text-status-info" aria-hidden /> : <AlertTriangle size={18} className={`mt-0.5 ${level === 'critical' ? 'text-status-crit' : 'text-status-warn'}`} aria-hidden />}
              <div className="min-w-0"><p className="text-sm font-semibold text-ink">{title}</p><p className="line-clamp-2 whitespace-pre-line text-sm text-ink">{body}</p></div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>
          {start === 'draft' ? t('announcements.saveDraft') : start === 'later' ? t('announcements.schedule') : t('announcements.publish')}
        </Button>
      </div>
    </Modal>
  );
}
