interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  summary: (page: number, totalPages: number, total: number) => string;
  prevLabel: string;
  nextLabel: string;
}

/** Prev/next pager for a server-paginated list. Renders nothing for a single page. */
export default function Pagination({ page, pageSize, total, onPageChange, summary, prevLabel, nextLabel }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
      <span>{summary(page, totalPages, total)}</span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md border border-line px-3 py-1 text-xs font-medium hover:bg-surface disabled:opacity-40"
        >
          {prevLabel}
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md border border-line px-3 py-1 text-xs font-medium hover:bg-surface disabled:opacity-40"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
