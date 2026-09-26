import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Lock, MessageSquareText, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAdmin } from '../AdminContext';
import { Badge, Card, ErrorState, Skeleton } from '../components/ui';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { timeAgo } from '../lib/format';
import { rpc, useAdminAction } from '../lib/tenants';
import { tenantStatusTone } from '../lib/tenantStatus';
import {
  TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, fillMacro, priorityTone, slaTone, ticketStatusTone, useAgents,
  useMacros, useTicket, type TicketDetail as Detail,
} from '../lib/tickets';
import { control } from './billing/shared';

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { can } = useAdmin();
  const q = useTicket(id);
  const d = q.data;

  if (q.isError) {
    return (
      <div className="mx-auto max-w-7xl">
        <BackLink />
        <ErrorState message={(q.error as { code?: string })?.code === 'P0002' ? t('tickets.notFound') : t('errors.load')} onRetry={() => void q.refetch()} retryLabel={t('retry')} />
      </div>
    );
  }
  if (!d) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <BackLink />
        <Skeleton className="h-12 w-96" />
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-96 lg:col-span-2" /><Skeleton className="h-96" /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <BackLink />
      <div className="mb-5">
        <p className="text-sm text-ink-muted">#{d.number} · {t(`tickets.category.${d.category}`)} · {t(`tickets.channel.${d.channel}`, { defaultValue: d.channel })} · {t('tickets.opened', { when: timeAgo(d.created_at, lng) })}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{d.subject}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone={ticketStatusTone(d.status)}>{t(`tickets.status.${d.status}`)}</Badge>
          <Badge tone={priorityTone(d.priority)}>{t(`tickets.priority.${d.priority}`)}</Badge>
          {d.sla_state !== 'done' && <Badge tone={slaTone(d.sla_state)}>{t(`tickets.sla.${d.sla_state}`)}</Badge>}
          {d.tags.map((x) => <Badge key={x}>#{x}</Badge>)}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Thread d={d} lng={lng} />
          {can('tickets.manage') && <Composer d={d} />}
        </div>
        <div className="space-y-4">
          <Properties d={d} />
          <SlaCard d={d} lng={lng} />
          <Card title={t('tickets.customer')}>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">{t('tickets.cols.requester')}</dt>
                <dd className="text-ink">
                  {d.requester ? (
                    <Link to={`/admin/users/${d.requester.id}`} className="hover:underline">{d.requester.name ?? d.requester.email}</Link>
                  ) : (d.requester_email ?? '—')}
                  {d.requester?.name && <span className="block text-xs text-ink-muted">{d.requester.email}</span>}
                  {d.requester?.role && <span className="block text-xs text-ink-muted">{t(`memberRoles.${d.requester.role}`, { defaultValue: d.requester.role })}</span>}
                </dd>
              </div>
              {d.org && (
                <div>
                  <dt className="text-xs text-ink-muted">{t('billing.cols.tenant')}</dt>
                  <dd className="flex flex-wrap items-center gap-2 text-ink">
                    <Link to={`/admin/tenants/${d.org.id}`} className="hover:underline">{d.org.name}</Link>
                    <Badge tone={tenantStatusTone(d.org.status as never)}>{t(`tenantStatus.${d.org.status}`, { defaultValue: d.org.status })}</Badge>
                    {d.org.plan && <span className="text-xs text-ink-muted">{t(`plans.${d.org.plan}`, { defaultValue: d.org.plan })}</span>}
                  </dd>
                  {d.other_tickets > 0 && (
                    <Link to={`/admin/tickets?view=all&org=${d.org.id}`} className="mt-1 inline-block text-xs text-brand-600 hover:underline dark:text-brand">
                      {t('tickets.otherTickets', { count: d.other_tickets })}
                    </Link>
                  )}
                </div>
              )}
            </dl>
          </Card>
          {d.rating && (
            <Card title={t('tickets.rating')}>
              <p className={`flex items-center gap-2 text-sm ${d.rating === 'good' ? 'text-status-ok' : 'text-status-crit'}`}>
                {d.rating === 'good' ? <ThumbsUp size={16} aria-hidden /> : <ThumbsDown size={16} aria-hidden />}
                {t(`tickets.ratings.${d.rating}`)}
              </p>
              {d.rating_comment && <p className="mt-1 text-sm text-ink">“{d.rating_comment}”</p>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation('admin');
  return (
    <Link to="/admin/tickets" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
      <ArrowLeft size={15} aria-hidden /> {t('nav.items.tickets')}
    </Link>
  );
}

function Thread({ d, lng }: { d: Detail; lng: string }) {
  const { t } = useTranslation('admin');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [d.messages.length]);
  return (
    <Card>
      <ol className="space-y-4">
        {d.messages.map((m) => {
          const staff = m.author_kind === 'staff';
          if (m.author_kind === 'system') {
            return <li key={m.id} className="text-center text-xs text-ink-muted">{m.body} · {timeAgo(m.created_at, lng)}</li>;
          }
          return (
            <li key={m.id} className={`flex ${staff ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl border px-4 py-3 ${
                m.internal ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
                : staff ? 'border-brand/20 bg-brand/5' : 'border-line bg-surface'}`}>
                <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                  <span className="font-medium text-ink">{m.author_name ?? (staff ? t('tickets.staff') : d.requester_email)}</span>
                  {m.internal && <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><Lock size={11} aria-hidden /> {t('tickets.internalNote')}</span>}
                  <time dateTime={m.created_at} title={new Date(m.created_at).toLocaleString(lng)}>{timeAgo(m.created_at, lng)}</time>
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-ink">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={end} />
    </Card>
  );
}

function Composer({ d }: { d: Detail }) {
  const { t } = useTranslation('admin');
  const { user } = useAuth();
  const macros = useMacros();
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [body, setBody] = useState('');
  const [after, setAfter] = useState<string>('pending');
  const send = useAdminAction(
    () => rpc('fp_admin_ticket_reply', {
      p_id: d.id, p_body: body.trim(), p_internal: mode === 'note',
      p_status: mode === 'note' ? (after === 'keep' ? null : after) : after,
    }),
    mode === 'note' ? t('tickets.toast.noted') : t('tickets.toast.replied'),
  );
  const closed = d.status === 'closed';
  const agentName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '';

  return (
    <Card>
      <div role="tablist" aria-label={t('tickets.composer')} className="mb-3 inline-flex rounded-md border border-line text-sm">
        {(['reply', 'note'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m}
            onClick={() => { setMode(m); setAfter(m === 'reply' ? 'pending' : 'keep'); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${mode === m ? 'bg-ink/10 font-medium text-ink' : 'text-ink-muted hover:text-ink'}`}>
            {m === 'note' && <Lock size={13} aria-hidden />}{t(`tickets.mode.${m}`)}
          </button>
        ))}
      </div>
      {closed && mode === 'reply' && <p className="mb-2 text-xs text-ink-muted">{t('tickets.closedHint')}</p>}
      <textarea
        aria-label={mode === 'reply' ? t('tickets.mode.reply') : t('tickets.mode.note')}
        rows={6}
        value={body}
        maxLength={20000}
        onChange={(e) => setBody(e.target.value)}
        placeholder={mode === 'reply' ? t('tickets.replyPlaceholder') : t('tickets.notePlaceholder')}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ${
          mode === 'note' ? 'border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5' : 'border-line bg-panel'}`}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <select aria-label={t('tickets.insertMacro')} value="" className={control}
          onChange={(e) => {
            const m = macros.data?.find((x) => x.id === e.target.value);
            if (m) setBody((b) => (b ? `${b}\n\n` : '') + fillMacro(m.body, { name: d.requester?.name, ticket: d.number, agent: agentName }));
          }}>
          <option value="">{(macros.data ?? []).length ? t('tickets.insertMacro') : t('tickets.noMacros')}</option>
          {(macros.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            {t('tickets.thenSet')}
            <select value={after} onChange={(e) => setAfter(e.target.value)} className={control}>
              {mode === 'note' && <option value="keep">{t('tickets.keepStatus')}</option>}
              {TICKET_STATUSES.map((x) => <option key={x} value={x}>{t(`tickets.status.${x}`)}</option>)}
            </select>
          </label>
          <Button disabled={!body.trim()} loading={send.isPending} onClick={() => send.mutate(undefined, { onSuccess: () => setBody('') })}>
            {mode === 'note' ? <Lock size={15} aria-hidden /> : <Send size={15} aria-hidden />}
            {mode === 'note' ? t('tickets.addNote') : t('tickets.send')}
          </Button>
        </div>
      </div>
      {mode === 'reply' && <p className="mt-2 text-xs text-ink-muted"><MessageSquareText size={12} className="mr-1 inline" aria-hidden />{t('tickets.replyNotifies')}</p>}
    </Card>
  );
}

function Properties({ d }: { d: Detail }) {
  const { t } = useTranslation('admin');
  const { can } = useAdmin();
  const agents = useAgents();
  const [tags, setTags] = useState(d.tags.join(', '));
  useEffect(() => setTags(d.tags.join(', ')), [d.tags]);
  const update = useAdminAction((p: Record<string, unknown>) => rpc('fp_admin_ticket_update', { p_id: d.id, p }), t('tickets.toast.updated'));
  const disabled = !can('tickets.manage');
  const row = (label: string, el: React.ReactNode) => (
    <label className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-sm">
      <span className="text-ink-muted">{label}</span>{el}
    </label>
  );
  return (
    <Card title={t('tickets.properties')}>
      <div className="space-y-2.5">
        {row(t('tickets.cols.status'), (
          <select value={d.status} disabled={disabled} onChange={(e) => update.mutate({ status: e.target.value })} className={`${control} w-full`}>
            {TICKET_STATUSES.map((x) => <option key={x} value={x}>{t(`tickets.status.${x}`)}</option>)}
          </select>
        ))}
        {row(t('tickets.cols.priority'), (
          <select value={d.priority} disabled={disabled} onChange={(e) => update.mutate({ priority: e.target.value })} className={`${control} w-full`}>
            {TICKET_PRIORITIES.map((x) => <option key={x} value={x}>{t(`tickets.priority.${x}`)}</option>)}
          </select>
        ))}
        {row(t('tickets.cols.category'), (
          <select value={d.category} disabled={disabled} onChange={(e) => update.mutate({ category: e.target.value })} className={`${control} w-full`}>
            {TICKET_CATEGORIES.map((x) => <option key={x} value={x}>{t(`tickets.category.${x}`)}</option>)}
          </select>
        ))}
        {row(t('tickets.cols.assignee'), (
          <select value={d.assignee_id ?? ''} disabled={disabled} onChange={(e) => update.mutate({ assignee_id: e.target.value || null })} className={`${control} w-full`}>
            <option value="">{t('tickets.unassigned')}</option>
            {(agents.data ?? []).map((a) => <option key={a.user_id} value={a.user_id}>{a.name}</option>)}
          </select>
        ))}
        {row(t('tickets.tags'), (
          <Input value={tags} disabled={disabled} onChange={(e) => setTags(e.target.value)} placeholder="qr, mobile"
            onBlur={() => {
              const next = tags.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
              if (next.join(',') !== d.tags.join(',')) update.mutate({ tags: next });
            }} />
        ))}
      </div>
    </Card>
  );
}

function SlaCard({ d, lng }: { d: Detail; lng: string }) {
  const { t } = useTranslation('admin');
  const line = (label: string, due: string | null, state: string, doneAt?: string | null) => (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div>
        <p className="text-ink">{label}</p>
        <p className="text-xs text-ink-muted">{due ? t('tickets.dueAt', { when: new Date(due).toLocaleString(lng) }) : '—'}</p>
      </div>
      <Badge tone={state === 'met' ? 'ok' : state === 'missed' ? 'crit' : slaTone(state)}>
        {state === 'met' || state === 'missed' ? t(`tickets.sla.${state}`) : doneAt ? t('tickets.sla.done') : t(`tickets.sla.${state}`)}
      </Badge>
    </div>
  );
  const resolutionState = d.solved_at ? (d.resolution_due_at && d.solved_at <= d.resolution_due_at ? 'met' : 'missed') : d.sla_state;
  return (
    <Card title={t('tickets.slaTitle')} description={t('tickets.slaHint')}>
      <div className="space-y-3">
        {line(t('tickets.firstResponse'), d.first_response_due_at, d.first_response_state)}
        {line(t('tickets.resolution'), d.resolution_due_at, resolutionState)}
      </div>
    </Card>
  );
}
