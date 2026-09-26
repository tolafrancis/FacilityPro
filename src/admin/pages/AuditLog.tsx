import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Search } from 'lucide-react';
import DataTable, { type Column } from '../components/DataTable';
import DateRangePicker, { useDateRange } from '../components/DateRangePicker';
import { Badge, PageHeader } from '../components/ui';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { notify } from '../../components/Toaster';
import { downloadCsv, toCsv } from '../lib/csv';
import { diffRecords, fetchAudit, useAudit, useAuditFacets, type AuditQuery, type AuditRow } from '../lib/audit';
import { control } from './billing/shared';

const PAGE_SIZE = 50;

export function auditLabel(action: string, t: (k: string, o?: Record<string, unknown>) => string) {
  return t(`auditActions.${action.replace(/\./g, '_')}`, { defaultValue: action });
}

/** The admin audit trail: every change staff made, who, when, from where. */
export default function AuditLog() {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useDateRange('30d');
  const q = params.get('q') ?? '';
  const action = params.get('action') ?? '';
  const admin = params.get('admin') ?? '';
  const org = params.get('org') ?? '';
  const targetType = params.get('type') ?? '';
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

  const query: AuditQuery = { search: q, action, admin, org, targetType, from: range.from.toISOString(), to: range.to.toISOString(), limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  const list = useAudit(query);
  const facets = useAuditFacets();
  const [open, setOpen] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const groups = [...new Set((facets.data?.actions ?? []).map((a) => a.split('.')[0]))];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchAudit({ ...query, limit: 5000, offset: 0 });
      downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(all.rows, [
        { header: t('audit.cols.at'), value: (r) => r.at },
        { header: t('audit.cols.staff'), value: (r) => r.admin_email ?? t('audit.system') },
        { header: t('audit.cols.action'), value: (r) => r.action },
        { header: t('audit.cols.target'), value: (r) => `${r.target_type}${r.target_id ? ` ${r.target_id}` : ''}` },
        { header: t('audit.cols.tenant'), value: (r) => r.org_name ?? '' },
        { header: 'IP', value: (r) => r.ip ?? '' },
        { header: t('audit.before'), value: (r) => (r.before == null ? '' : JSON.stringify(r.before)) },
        { header: t('audit.after'), value: (r) => (r.after == null ? '' : JSON.stringify(r.after)) },
      ]));
      notify(t('audit.exported', { count: all.rows.length }), 'success');
    } catch {
      notify(t('errors.load'), 'error');
    }
    setExporting(false);
  };

  const columns: Column<AuditRow>[] = [
    { key: 'at', header: t('audit.cols.at'), fixed: true, cell: (r) => <button type="button" onClick={() => setOpen(r)} className="whitespace-nowrap text-left hover:underline">{new Date(r.at).toLocaleString(lng)}</button> },
    { key: 'staff', header: t('audit.cols.staff'), cell: (r) => (r.admin_email ? <Link to={`/admin/users/${r.admin_id}`} className="hover:underline">{r.admin_email}</Link> : <span className="text-ink-muted">{t('audit.system')}</span>) },
    { key: 'action', header: t('audit.cols.action'), cell: (r) => <button type="button" onClick={() => setOpen(r)} className="text-left font-medium text-ink hover:underline">{auditLabel(r.action, t)}</button> },
    { key: 'target', header: t('audit.cols.target'), cell: (r) => <span className="text-xs text-ink-muted"><code>{r.target_type}</code>{r.target_id && <> · <code className="break-all">{r.target_id.slice(0, 40)}</code></>}</span> },
    { key: 'tenant', header: t('audit.cols.tenant'), cell: (r) => (r.org_id ? <Link to={`/admin/tenants/${r.org_id}`} className="hover:underline">{r.org_name ?? r.org_id.slice(0, 8)}</Link> : <span className="text-ink-muted">—</span>) },
    { key: 'ip', header: 'IP', cell: (r) => <code className="text-xs text-ink-muted">{r.ip ?? '—'}</code> },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={t('nav.items.audit')} description={t('audit.subtitle')}
        actions={<><DateRangePicker range={range} onChange={setRange} /><Button variant="secondary" onClick={() => void exportCsv()} loading={exporting}><Download size={16} aria-hidden /> {t('users.exportAll')}</Button></>} />
      <DataTable
        id="audit"
        columns={columns}
        rows={list.data?.rows ?? []}
        rowKey={(r) => String(r.id)}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={(p) => update({ page: p > 1 ? String(p) : null }, false)}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyTitle={t('audit.empty')}
        toolbar={
          <>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('audit.search')} aria-label={t('audit.search')} className={`${control} w-full pl-8`} />
            </div>
            <select aria-label={t('audit.cols.action')} value={action} onChange={(e) => update({ action: e.target.value || null })} className={control}>
              <option value="">{t('audit.allActions')}</option>
              {groups.map((g) => (
                <optgroup key={g} label={t(`audit.groups.${g}`, { defaultValue: g })}>
                  <option value={g}>{t('audit.allIn', { group: t(`audit.groups.${g}`, { defaultValue: g }) })}</option>
                  {(facets.data?.actions ?? []).filter((a) => a.split('.')[0] === g && a !== g).map((a) => <option key={a} value={a}>{auditLabel(a, t)}</option>)}
                </optgroup>
              ))}
            </select>
            <select aria-label={t('audit.cols.staff')} value={admin} onChange={(e) => update({ admin: e.target.value || null })} className={control}>
              <option value="">{t('audit.allStaff')}</option>
              {(facets.data?.admins ?? []).map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
            </select>
            {org && <button type="button" onClick={() => update({ org: null })} className="text-xs text-ink-muted underline">{t('tickets.clearTenant')}</button>}
            {targetType && <button type="button" onClick={() => update({ type: null })} className="text-xs text-ink-muted underline">{t('audit.clearType', { type: targetType })}</button>}
          </>
        }
      />
      <p className="mt-2 text-xs text-ink-muted">{t('audit.immutable')}</p>
      {open && <EntryDialog row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function show(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function EntryDialog({ row, onClose }: { row: AuditRow; onClose: () => void }) {
  const { t, i18n } = useTranslation('admin');
  const lng = i18n.resolvedLanguage ?? 'en';
  const changes = diffRecords(row.before, row.after);
  const [all, setAll] = useState(false);
  const shown = all ? changes : changes.filter((c) => c.kind !== 'same');
  return (
    <Modal title={auditLabel(row.action, t)} onClose={onClose} closeLabel={t('close')} wide>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-ink-muted">{t('audit.cols.at')}</dt><dd className="text-ink">{new Date(row.at).toLocaleString(lng)}</dd>
        <dt className="text-ink-muted">{t('audit.cols.staff')}</dt><dd className="text-ink">{row.admin_email ?? t('audit.system')}</dd>
        <dt className="text-ink-muted">{t('audit.cols.target')}</dt><dd className="break-all text-ink"><code>{row.target_type}</code> {row.target_id}</dd>
        {row.org_name && <><dt className="text-ink-muted">{t('audit.cols.tenant')}</dt><dd className="text-ink">{row.org_name}</dd></>}
        <dt className="text-ink-muted">IP</dt><dd className="text-ink">{row.ip ?? '—'}</dd>
        <dt className="text-ink-muted">{t('audit.cols.action')}</dt><dd><code className="text-xs">{row.action}</code></dd>
      </dl>
      {changes.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('audit.changes')}</p>
            {changes.some((c) => c.kind === 'same') && (
              <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                <input type="checkbox" className="accent-[#E8552D]" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t('audit.showUnchanged')}
              </label>
            )}
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-line text-left text-ink-muted">
                  <th className="px-3 py-1.5 font-medium">{t('audit.field')}</th>
                  <th className="px-3 py-1.5 font-medium">{t('audit.before')}</th>
                  <th className="px-3 py-1.5 font-medium">{t('audit.after')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.field} className="border-b border-line align-top last:border-0">
                    <td className="px-3 py-1.5 font-mono text-ink">
                      {c.field} {c.kind !== 'same' && <Badge tone={c.kind === 'added' ? 'ok' : c.kind === 'removed' ? 'crit' : 'warn'}>{t(`audit.kind.${c.kind}`)}</Badge>}
                    </td>
                    <td className="max-w-[16rem] break-words px-3 py-1.5 font-mono text-ink-muted">{show(c.before)}</td>
                    <td className="max-w-[16rem] break-words px-3 py-1.5 font-mono text-ink">{show(c.after)}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={3} className="px-3 py-3 text-center text-ink-muted">{t('audit.noFieldChanges')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
