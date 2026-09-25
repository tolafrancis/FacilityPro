import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';

/**
 * A list search kept in the URL (?q=), so links (the dashboard's search box,
 * a shared address) open the filtered list. Typing updates the URL after a
 * short pause; onChange runs when the applied search changes (e.g. to go back
 * to page 1).
 */
export function useUrlSearch(onChange?: () => void) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [query, setQuery] = useState(q);
  useEffect(() => setQuery(q), [q]);
  useEffect(() => {
    if (query.trim() === q.trim()) return;
    const id = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (query.trim()) next.set('q', query.trim());
      else next.delete('q');
      setParams(next, { replace: true });
      onChange?.();
    }, 300);
    return () => clearTimeout(id);
  }, [query, q, params, setParams, onChange]);
  return { q, query, setQuery };
}

export default function SearchInput({
  id,
  label,
  placeholder,
  clearLabel,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  clearLabel: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="w-full sm:w-72">
      <label htmlFor={id} className="mb-1 block text-xs text-ink-muted">
        {label}
      </label>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={100}
          className="min-h-[44px] w-full rounded-lg border border-line bg-panel py-2 pl-9 pr-9 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 lg:min-h-0 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-muted hover:bg-surface hover:text-ink"
            aria-label={clearLabel}
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
