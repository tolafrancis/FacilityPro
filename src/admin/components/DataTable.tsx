import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Server sort key; omit for unsortable columns. */
  sortKey?: string;
  align?: 'left' | 'right';
  /** Can't be hidden. */
  fixed?: boolean;
  hiddenByDefault?: boolean;
  className?: string;
}

export interface Sort {
  key: string;
  desc: boolean;
}

/**
 * Admin data table for server-side data: the parent owns search, filters,
 * sort and page (usually in the URL); this renders them and reports changes.
 * Column choice is remembered per table in this browser.
 */
export default function DataTable<T>({
  id,
  columns,
  rows,
  rowKey,
  total,
  page,
  pageSize,
  onPage,
  sort,
  onSort,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyBody,
  selectable = false,
  selected,
  onSelectedChange,
  bulkActions,
  toolbar,
}: {
  id: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  sort?: Sort;
  onSort?: (s: Sort) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  emptyTitle: string;
  emptyBody?: string;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  bulkActions?: ReactNode;
  toolbar?: ReactNode;
}) {
  const { t, i18n } = useTranslation('admin');
  const storageKey = `fp.admin.columns.${id}`;
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return new Set(JSON.parse(saved) as string[]);
    } catch {
      /* default columns */
    }
    return new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.key));
  });
  const [colMenu, setColMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colMenu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setColMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [colMenu]);

  const toggleColumn = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      /* per-browser preference only */
    }
  };

  const visible = columns.filter((c) => c.fixed || !hidden.has(c.key));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const sel = selected ?? new Set<string>();
  const pageKeys = rows.map(rowKey);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => sel.has(k));
  const setSel = (next: Set<string>) => onSelectedChange?.(next);
  const nf = new Intl.NumberFormat(i18n.resolvedLanguage ?? 'en');

  return (
    <div className="rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        {sel.size > 0 && selectable ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{t('dt.selected', { count: sel.size })}</span>
            <button type="button" onClick={() => setSel(new Set())} className="text-xs text-ink-muted underline hover:text-ink">
              {t('dt.clearSelection')}
            </button>
            <div className="flex flex-wrap items-center gap-2">{bulkActions}</div>
          </div>
        ) : (
          <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        )}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setColMenu((o) => !o)}
            aria-expanded={colMenu}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-ink hover:bg-ink/5"
          >
            <Columns3 size={15} aria-hidden /> {t('dt.columns')}
          </button>
          {colMenu && (
            <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-line bg-panel p-1 shadow-xl">
              {columns.filter((c) => !c.fixed).map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-ink hover:bg-ink/5">
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleColumn(c.key)} className="accent-[#E8552D]" />
                  {c.header}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="p-6"><ErrorState message={t('errors.load')} onRetry={onRetry} retryLabel={t('retry')} /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                {selectable && (
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={t('dt.selectPage')}
                      checked={allOnPage}
                      onChange={() => {
                        const next = new Set(sel);
                        if (allOnPage) pageKeys.forEach((k) => next.delete(k));
                        else pageKeys.forEach((k) => next.add(k));
                        setSel(next);
                      }}
                      className="accent-[#E8552D]"
                    />
                  </th>
                )}
                {visible.map((c) => {
                  const active = sort && c.sortKey === sort.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort!.desc ? 'descending' : 'ascending') : undefined}
                      className={`whitespace-nowrap px-3 py-2.5 font-medium ${c.align === 'right' ? 'text-right' : ''}`}
                    >
                      {c.sortKey && onSort ? (
                        <button
                          type="button"
                          onClick={() => onSort({ key: c.sortKey!, desc: active ? !sort!.desc : c.align === 'right' })}
                          className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`}
                        >
                          {c.header}
                          {active && (sort!.desc ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />)}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: Math.min(pageSize, 8) }, (_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {selectable && <td className="px-3 py-3"><Skeleton className="h-4 w-4" /></td>}
                    {visible.map((c) => (
                      <td key={c.key} className="px-3 py-3"><Skeleton className="h-4 w-full max-w-[140px]" /></td>
                    ))}
                  </tr>
                ))}
              {!loading &&
                rows.map((r) => {
                  const k = rowKey(r);
                  return (
                    <tr key={k} className={`border-b border-line last:border-0 hover:bg-ink/[0.03] ${sel.has(k) ? 'bg-brand/5' : ''}`}>
                      {selectable && (
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={t('dt.selectRow')}
                            checked={sel.has(k)}
                            onChange={() => {
                              const next = new Set(sel);
                              if (next.has(k)) next.delete(k);
                              else next.add(k);
                              setSel(next);
                            }}
                            className="accent-[#E8552D]"
                          />
                        </td>
                      )}
                      {visible.map((c) => (
                        <td key={c.key} className={`px-3 py-2.5 text-ink ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.className ?? ''}`}>
                          {c.cell(r)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <div className="p-6"><EmptyState title={emptyTitle} body={emptyBody} /></div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5 text-xs text-ink-muted">
        <span>
          {total > 0
            ? t('dt.range', { from: nf.format((page - 1) * pageSize + 1), to: nf.format(Math.min(page * pageSize, total)), total: nf.format(total) })
            : t('dt.none')}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink hover:bg-ink/5 disabled:opacity-40" aria-label={t('dt.prev')}>
            <ChevronLeft size={15} aria-hidden />
          </button>
          <span className="px-2 tabular-nums">{t('dt.page', { page, pages })}</span>
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink hover:bg-ink/5 disabled:opacity-40" aria-label={t('dt.next')}>
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
