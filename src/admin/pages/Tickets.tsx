import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquareText, Plus, Search, UserCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAdmin } from '../AdminContext';
import DataTable, { type Column, type Sort } from '../components/DataTable';
import { Badge, PageHeader, Skeleton } from '../components/ui';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { timeAgo } from '../lib/format';
import { fetchTenants, rpc, useAdminAction } from '../lib/tenants';
import {
  TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, priorityTone, slaTone, ticketStatusTone, useAgents, useTickets,
  useTicketStats, type TicketQuery, type TicketRow,
} from '../lib/tickets';
import { Field, control } from './billing/shared';
import MacrosDialog from './tickets/MacrosDialog';

const PAGE_SIZE = 25;
const SORTS = ['sla', 'number', 'updated', 'created', 'priority', 'status', 'subject'];
const VIEWS = ['active', 'mine', 'unassigned', 'breached', 'all'] as const;
type View = (typeof VIEWS)[number];

export default function Tickets() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { can } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view: View = (VIEWS as readonly string[]).includes(params.get('view') ?? '') ? (params.get('view') as View) : 'active';
  const q = params.get('q') ?? '';
  const status = (TICKET_STATUSES as readonly string[]).includes(params.get('status') ?? '') ? params.get('status')! : '';
  const priority = (TICKET_PRIORITIES as readonly string[]).includes(params.get('priority') ?? '') ? params.get('priority')! : '';
  const org = params.get('org') ?? '';
  const sort: Sort = { key: SORTS.includes(params.get('sort') ?? '') ? params.get('sort')! : 'sla', desc: params.get('dir') === 'desc' };
  const page = Math.max(1, Number(params.get('page')) || 1);
  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search.trim() === q) return;
    const id = setTimeout(() => update({ q: search.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query: TicketQuery = {
    search: q,
    status: status || (view === 'all' ? '' : 'active'),
    priority,
    assignee: view === 'mine' ? 'me' : view === 'unassigned' ? 'none' : '',
    sla: view === 'breached' ? 'breached' : '',
    org,
    sort: sort.key, desc: sort.desc, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  };
  const list = useTickets(query);
  const stats = useTicketStats();
  const agents = useAgents();
  const s = stats.data;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [macros, setMacros] = useState(false);
  const manage = can('tickets.manage');
  const bulk = useAdminAction((p: Record<string, unknown>) => rpc('fp_admin_tickets_bulk', { p_ids: [...selected], p }), t('tickets.toast.updated'));

  const tiles: { key: string; value?: number | string | null; view?: View; tone?: 'crit' | 'warn' }[] = [
    { key: 'open', value: s?.open, view: 'active' },
    { key: 'unassigned', value: s?.unassigned, view: 'unassigned', tone: s && s.unassigned > 0 ? 'warn' : undefined },
    { key: 'mine', value: s?.mine, view: 'mine' },
    { key: 'breached', value: s?.breached, view: 'breached', tone: s && s.breached > 0 ? 'crit' : undefined },
    { key: 'firstResponse', value: s ? (s.first_response_hours_30d == null ? '—' : t('tickets.hours', { value: s.first_response_hours_30d })) : undefined },
    { key: 'slaMet', value: s ? (s.first_response_met_pct_30d == null ? '—' : `${s.first_response_met_pct_30d}%`) : undefined },
    { key: 'satisfaction', value: s ? (s.satisfaction_pct_30d == null ? '—' : `${s.satisfaction_pct_30d}%`) : undefined },
    { key: 'solved', value: s?.solved_7d },
  ];

  const columns: Column<TicketRow>[] = [
    {
      key: 'subject', header: t('tickets.cols.subject'), sortKey: 'subject', fixed: true,
      cell: (r) => (
        <Link to={`/admin/tickets/${r.id}`} className="block min-w-0 max-w-[340px] hover:underline">
          <span className="block truncate font-medium">
            {r.last_message_by === 'requester' && r.status === 'open' && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand align-middle" aria-label={t('tickets.awaitingReply')} />}
            {r.subject}
          </span>
          <span className="block truncate text-xs text-ink-muted">#{r.number} · {r.org_name ?? r.requester_email ?? '—'}</span>
        </Link>
      ),
    },
    { key: 'status', header: t('tickets.cols.status'), sortKey: 'status', cell: (r) => <Badge tone={ticketStatusTone(r.status)}>{t(`tickets.status.${r.status}`)}</Badge> },
    { key: 'priority', header: t('tickets.cols.priority'), sortKey: 'priority', cell: (r) => <Badge tone={priorityTone(r.priority)}>{t(`tickets.priority.${r.priority}`)}</Badge> },
    {
      key: 'sla', header: t('tickets.cols.sla'), sortKey: 'sla',
      cell: (r) => (r.sla_state === 'done' || !r.sla_due_at
        ? <span className="text-ink-muted">—</span>
        : <span className="whitespace-nowrap"><Badge tone={slaTone(r.sla_state)}>{r.sla_state === 'paused' ? t('tickets.sla.paused') : timeAgo(r.sla_due_at, lng)}</Badge></span>),
    },
    { key: 'assignee', header: t('tickets.cols.assignee'), cell: (r) => (r.assignee_email ? <span className="whitespace-nowrap">{r.assignee_email.split('@')[0]}</span> : <span className="text-ink-muted">{t('tickets.unassigned')}</span>) },
    { key: 'updated', header: t('tickets.cols.updated'), sortKey: 'updated', cell: (r) => <span className="whitespace-nowrap text-ink-muted">{timeAgo(r.last_message_at ?? r.updated_at, lng)}</span> },
    { key: 'category', header: t('tickets.cols.category'), hiddenByDefault: true, cell: (r) => t(`tickets.category.${r.category}`) },
    { key: 'requester', header: t('tickets.cols.requester'), hiddenByDefault: true, cell: (r) => r.requester_email ?? '—' },
    { key: 'created', header: t('tickets.cols.created'), sortKey: 'created', hiddenByDefault: true, cell: (r) => <span className="whitespace-nowrap">{new Date(r.created_at).toLocaleDateString(lng)}</span> },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t('nav.items.tickets')}
        description={t('tickets.subtitle')}
        actions={manage && (
          <>
            <Button variant="secondary" onClick={() => setMacros(true)}><MessageSquareText size={16} aria-hidden /> {t('tickets.macros')}</Button>
            <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> {t('tickets.new')}</Button>
          </>
        )}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((c) => {
          const body = (
            <>
              <p className="text-xs font-medium text-ink-muted">{t(`tickets.kpi.${c.key}`)}</p>
              {c.value === undefined ? <Skeleton className="mt-2 h-7 w-16" /> : (
                <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${c.tone === 'crit' ? 'text-status-crit' : c.tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`}>{c.value}</p>
              )}
            </>
          );
          const cls = 'rounded-xl border bg-panel p-4 text-left transition';
          return c.view ? (
            <button key={c.key} type="button" onClick={() => update({ view: c.view === 'active' ? null : c.view!, status: null })}
              className={`${cls} hover:border-ink/20 ${view === c.view ? 'border-brand ring-1 ring-brand/30' : 'border-line'}`}>{body}</button>
          ) : <div key={c.key} className={`${cls} border-line`}>{body}</div>;
        })}
      </div>

      <DataTable
        id="tickets"
        columns={columns}
        rows={list.data?.rows ?? []}
        rowKey={(r) => r.id}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={(p) => update({ page: p > 1 ? String(p) : null }, false)}
        sort={sort}
        onSort={(x) => update({ sort: x.key, dir: x.desc ? 'desc' : null })}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyTitle={view === 'breached' ? t('tickets.noBreached') : t('tickets.empty')}
        selectable={manage}
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={
          <>
            {user && agents.data?.some((a) => a.user_id === user.id) && (
              <Button variant="secondary" loading={bulk.isPending} onClick={() => bulk.mutate({ assignee_id: user.id }, { onSuccess: () => setSelected(new Set()) })}>
                <UserCheck size={15} aria-hidden /> {t('tickets.assignToMe')}
              </Button>
            )}
            <select aria-label={t('tickets.assignTo')} value="" className={control}
              onChange={(e) => e.target.value && bulk.mutate({ assignee_id: e.target.value === 'none' ? null : e.target.value }, { onSuccess: () => setSelected(new Set()) })}>
              <option value="">{t('tickets.assignTo')}</option>
              <option value="none">{t('tickets.unassigned')}</option>
              {(agents.data ?? []).map((a) => <option key={a.user_id} value={a.user_id}>{a.name}</option>)}
            </select>
            <select aria-label={t('tickets.setStatus')} value="" className={control}
              onChange={(e) => e.target.value && bulk.mutate({ status: e.target.value }, { onSuccess: () => setSelected(new Set()) })}>
              <option value="">{t('tickets.setStatus')}</option>
              {TICKET_STATUSES.map((x) => <option key={x} value={x}>{t(`tickets.status.${x}`)}</option>)}
            </select>
          </>
        }
        toolbar={
          <>
            <div className="flex overflow-x-auto rounded-md border border-line text-sm" role="tablist" aria-label={t('tickets.views')}>
              {VIEWS.map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => update({ view: v === 'active' ? null : v, status: null })}
                  className={`whitespace-nowrap px-3 py-1.5 ${view === v ? 'bg-ink/10 font-medium text-ink' : 'text-ink-muted hover:text-ink'}`}>
                  {t(`tickets.view.${v}`)}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-56">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('tickets.search')} aria-label={t('tickets.search')} className={`${control} w-full pl-8`} />
            </div>
            {view === 'all' && (
              <select aria-label={t('tickets.cols.status')} value={status} onChange={(e) => update({ status: e.target.value || null })} className={control}>
                <option value="">{t('tenants.allStatuses')}</option>
                {TICKET_STATUSES.map((x) => <option key={x} value={x}>{t(`tickets.status.${x}`)}</option>)}
              </select>
            )}
            <select aria-label={t('tickets.cols.priority')} value={priority} onChange={(e) => update({ priority: e.target.value || null })} className={control}>
              <option value="">{t('tickets.allPriorities')}</option>
              {TICKET_PRIORITIES.map((x) => <option key={x} value={x}>{t(`tickets.priority.${x}`)}</option>)}
            </select>
            {org && <button type="button" onClick={() => update({ org: null })} className="text-xs text-ink-muted underline">{t('tickets.clearTenant')}</button>}
          </>
        }
      />
      {creating && <NewTicketDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(`/admin/tickets/${id}`)} />}
      {macros && <MacrosDialog onClose={() => setMacros(false)} />}
    </div>
  );
}

function NewTicketDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation('admin');
  const [tenantQuery, setTenantQuery] = useState('');
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [category, setCategory] = useState('question');
  useEffect(() => {
    if (org || tenantQuery.trim().length < 2) { setTenants([]); return; }
    const id = setTimeout(() => {
      fetchTenants({ search: tenantQuery.trim(), sort: 'name', desc: false, limit: 8, offset: 0 })
        .then((r) => setTenants(r.rows.map((x) => ({ id: x.id, name: x.name })))).catch(() => setTenants([]));
    }, 250);
    return () => clearTimeout(id);
  }, [tenantQuery, org]);
  const create = useAdminAction(
    () => rpc<string>('fp_admin_create_ticket', { p: { org_id: org?.id ?? null, requester_email: email, subject, body, priority, category } }),
    t('tickets.toast.created'),
  );
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && subject.trim().length >= 3 && body.trim().length > 0;
  return (
    <Modal title={t('tickets.new')} onClose={onClose} closeLabel={t('close')} wide>
      <p className="mb-3 text-sm text-ink-muted">{t('tickets.newHint')}</p>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="nt-org" label={t('tickets.tenantOptional')}>
            {org ? (
              <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span className="text-ink">{org.name}</span>
                <button type="button" onClick={() => { setOrg(null); setTenantQuery(''); }} className="text-xs text-ink-muted underline">{t('billing.change')}</button>
              </div>
            ) : (
              <div className="relative">
                <Input id="nt-org" value={tenantQuery} onChange={(e) => setTenantQuery(e.target.value)} placeholder={t('billing.findTenant')} autoComplete="off" />
                {tenants.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-panel p-1 shadow-lg">
                    {tenants.map((x) => (
                      <li key={x.id}><button type="button" onClick={() => { setOrg(x); setTenants([]); }} className="w-full rounded-md px-3 py-1.5 text-left text-sm text-ink hover:bg-ink/5">{x.name}</button></li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Field>
          <Field id="nt-email" label={t('tickets.requesterEmail')}><Input id="nt-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        <Field id="nt-subject" label={t('tickets.cols.subject')}><Input id="nt-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field id="nt-body" label={t('tickets.description')}>
          <textarea id="nt-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="nt-priority" label={t('tickets.cols.priority')}>
            <Select id="nt-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {TICKET_PRIORITIES.map((x) => <option key={x} value={x}>{t(`tickets.priority.${x}`)}</option>)}
            </Select>
          </Field>
          <Field id="nt-category" label={t('tickets.cols.category')}>
            <Select id="nt-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {TICKET_CATEGORIES.map((x) => <option key={x} value={x}>{t(`tickets.category.${x}`)}</option>)}
            </Select>
          </Field>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button disabled={!valid} loading={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: (id) => onCreated(id as string) })}>{t('tickets.create')}</Button>
      </div>
    </Modal>
  );
}
