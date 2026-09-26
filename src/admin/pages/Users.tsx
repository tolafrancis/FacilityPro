import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Search, ShieldCheck, X } from 'lucide-react';
import DataTable, { type Column, type Sort } from '../components/DataTable';
import { Badge, PageHeader, type Tone } from '../components/ui';
import Button from '../../components/ui/Button';
import { notify } from '../../components/Toaster';
import { timeAgo } from '../lib/format';
import { downloadCsv, toCsv } from '../lib/csv';
import { useTenant } from '../lib/tenants';
import { MEMBER_ROLES, USER_FILTERS, fetchUsers, useUsers, type UserFilter, type UserQuery, type UserRow, type UserStatus } from '../lib/users';

const PAGE_SIZE = 25;
const SORTS = ['name', 'email', 'created_at', 'last_sign_in_at', 'orgs', 'status'];

export function userStatusTone(s: UserStatus): Tone {
  return s === 'banned' ? 'crit' : s === 'unconfirmed' ? 'warn' : 'ok';
}

export default function Users() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const status = (USER_FILTERS as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as UserFilter) : '';
  const role = (MEMBER_ROLES as readonly string[]).includes(params.get('role') ?? '') ? params.get('role')! : '';
  const org = params.get('org') ?? '';
  const sort: Sort = { key: SORTS.includes(params.get('sort') ?? '') ? params.get('sort')! : 'created_at', desc: params.get('dir') !== 'asc' };
  const page = Math.max(1, Number(params.get('page')) || 1);
  const orgInfo = useTenant(org || undefined);

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

  const query: UserQuery = { search: q, status, role, org, sort: sort.key, desc: sort.desc, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  const list = useUsers(query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const csvColumns = [
    { header: t('users.cols.name'), value: (r: UserRow) => r.full_name ?? '' },
    { header: t('users.cols.email'), value: (r: UserRow) => r.email },
    { header: 'ID', value: (r: UserRow) => r.user_id },
    { header: t('users.cols.phone'), value: (r: UserRow) => r.phone ?? '' },
    { header: t('users.cols.status'), value: (r: UserRow) => t(`userStatus.${r.status}`) },
    { header: t('users.cols.tenants'), value: (r: UserRow) => r.memberships.map((m) => `${m.name} (${t(`memberRoles.${m.role}`, { defaultValue: m.role })})`).join('; ') },
    { header: t('users.cols.staff'), value: (r: UserRow) => (r.staff_role ? t(`roles.${r.staff_role}`, { defaultValue: r.staff_role }) : '') },
    { header: t('users.cols.mfa'), value: (r: UserRow) => (r.mfa ? t('users.yes') : t('users.no')) },
    { header: t('users.cols.created'), value: (r: UserRow) => r.created_at },
    { header: t('users.cols.lastSignIn'), value: (r: UserRow) => r.last_sign_in_at ?? '' },
  ];

  const exportCsv = async (ids?: string[]) => {
    setExporting(true);
    try {
      const all = await fetchUsers({ ...query, limit: 5000, offset: 0, ids });
      downloadCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(all.rows, csvColumns));
      notify(t('users.toast.exported', { count: all.rows.length }), 'success');
    } catch {
      notify(t('errors.load'), 'error');
    }
    setExporting(false);
  };

  const columns: Column<UserRow>[] = [
    {
      key: 'name', header: t('users.cols.user'), sortKey: 'name', fixed: true,
      cell: (r) => (
        <Link to={`/admin/users/${r.user_id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand-600 dark:text-brand">
            {(r.full_name ?? r.email).slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{r.full_name ?? r.email}</span>
            {r.full_name && <span className="block truncate text-xs text-ink-muted">{r.email}</span>}
          </span>
        </Link>
      ),
    },
    {
      key: 'status', header: t('users.cols.status'), sortKey: 'status',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge tone={userStatusTone(r.status)}>{t(`userStatus.${r.status}`)}</Badge>
          {r.staff_role && <Badge tone="brand">{t(`roles.${r.staff_role}`, { defaultValue: r.staff_role })}</Badge>}
        </span>
      ),
    },
    {
      key: 'tenants', header: t('users.cols.tenants'), sortKey: 'orgs',
      cell: (r) =>
        r.orgs === 0 ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <span className="block max-w-[260px] truncate">
            {r.memberships.map((m, i) => (
              <span key={m.org_id}>
                {i > 0 && ', '}
                <Link to={`/admin/tenants/${m.org_id}`} className="hover:underline">{m.name}</Link>
                <span className="text-xs text-ink-muted"> · {t(`memberRoles.${m.role}`, { defaultValue: m.role })}</span>
              </span>
            ))}
            {r.orgs > r.memberships.length && <span className="text-xs text-ink-muted"> {t('users.more', { count: r.orgs - r.memberships.length })}</span>}
          </span>
        ),
    },
    {
      key: 'mfa', header: t('users.cols.mfa'),
      cell: (r) => (r.mfa ? <span className="inline-flex items-center gap-1 text-status-ok"><ShieldCheck size={14} aria-hidden />{t('users.on')}</span> : <span className="text-ink-muted">{t('users.off')}</span>),
    },
    { key: 'phone', header: t('users.cols.phone'), hiddenByDefault: true, cell: (r) => r.phone ?? <span className="text-ink-muted">—</span> },
    { key: 'created', header: t('users.cols.created'), sortKey: 'created_at', cell: (r) => <span className="whitespace-nowrap">{new Date(r.created_at).toLocaleDateString(lng, { day: 'numeric', month: 'short', year: 'numeric' })}</span> },
    { key: 'signin', header: t('users.cols.lastSignIn'), sortKey: 'last_sign_in_at', cell: (r) => <span className="whitespace-nowrap text-ink-muted">{r.last_sign_in_at ? timeAgo(r.last_sign_in_at, lng) : t('tenants.never')}</span> },
  ];

  const control = 'h-9 rounded-md border border-line bg-panel px-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';
  const filtered = !!(q || status || role || org);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t('nav.items.users')}
        description={t('users.subtitle')}
        actions={
          <Button variant="secondary" onClick={() => void exportCsv()} loading={exporting}>
            <Download size={16} aria-hidden /> {t('users.exportAll')}
          </Button>
        }
      />

      <DataTable
        id="users"
        columns={columns}
        rows={list.data?.rows ?? []}
        rowKey={(r) => r.user_id}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={(p) => update({ page: p > 1 ? String(p) : null }, false)}
        sort={sort}
        onSort={(s) => update({ sort: s.key, dir: s.desc ? null : 'asc' })}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyTitle={filtered ? t('users.noMatches') : t('users.empty')}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={
          <Button variant="secondary" onClick={() => void exportCsv([...selected])} loading={exporting}>
            <Download size={15} aria-hidden /> {t('users.exportSelected')}
          </Button>
        }
        toolbar={
          <>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('users.searchPlaceholder')}
                aria-label={t('users.searchPlaceholder')}
                className={`${control} w-full pl-8`}
              />
            </div>
            <select aria-label={t('users.cols.status')} value={status} onChange={(e) => update({ status: e.target.value || null })} className={control}>
              <option value="">{t('users.allStatuses')}</option>
              {USER_FILTERS.map((s) => <option key={s} value={s}>{t(`users.filters.${s}`)}</option>)}
            </select>
            <select aria-label={t('users.role')} value={role} onChange={(e) => update({ role: e.target.value || null })} className={control}>
              <option value="">{t('users.allRoles')}</option>
              {MEMBER_ROLES.map((r) => <option key={r} value={r}>{t(`memberRoles.${r}`)}</option>)}
            </select>
            {org && (
              <span className="inline-flex h-9 items-center gap-1 rounded-md bg-brand/10 pl-3 pr-1 text-sm text-ink">
                {t('users.inTenant', { name: orgInfo.data?.org.name ?? '…' })}
                <button type="button" onClick={() => update({ org: null })} aria-label={t('users.clearTenant')} className="grid h-7 w-7 place-items-center rounded text-ink-muted hover:text-ink">
                  <X size={14} aria-hidden />
                </button>
              </span>
            )}
          </>
        }
      />
    </div>
  );
}
