import { useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';

export interface SearchOption {
  id: string;
  label: string;
}

interface SearchSelectProps {
  value: string;
  onChange: (id: string) => void;
  options: SearchOption[];
  placeholder?: string;
  emptyLabel?: string;
  createLabel?: string;
  onCreate?: (query: string) => void;
  disabled?: boolean;
}

/**
 * Searchable dropdown with an optional "+ Create new" row. The create action is
 * delegated to the parent (which opens its own modal) so each field can collect
 * the right details and then select the new id.
 */
export default function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  emptyLabel,
  createLabel,
  onCreate,
  disabled,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = options.find((o) => o.id === value)?.label ?? '';
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const inputClass =
    'w-full rounded-lg border border-line bg-white px-3 py-2 pr-8 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60';

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : selectedLabel}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className={inputClass}
      />
      <ChevronDown size={15} className="pointer-events-none absolute right-2 top-2.5 text-ink-muted" aria-hidden />

      {open && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {emptyLabel && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange('');
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-ink-muted hover:bg-surface"
            >
              {emptyLabel}
            </button>
          )}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.id);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-surface ${o.id === value ? 'font-medium text-brand' : 'text-ink'}`}
            >
              {o.label}
            </button>
          ))}
          {filtered.length === 0 && !onCreate && (
            <p className="px-3 py-2 text-sm text-ink-muted">No matches.</p>
          )}
          {onCreate && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onCreate(query);
                setOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-1 border-t border-line px-3 py-2 text-left text-sm font-medium text-brand hover:bg-surface"
            >
              <Plus size={14} /> {createLabel ?? 'Create new'}{query ? `: "${query}"` : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
