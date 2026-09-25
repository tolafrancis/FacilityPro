import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';

export const PRESETS = ['7d', '30d', '90d', '12m', 'ytd'] as const;
export type Preset = (typeof PRESETS)[number];

export interface DateRange {
  from: Date;
  to: Date;
  preset: Preset | 'custom';
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function presetRange(p: Preset, now = new Date()): { from: Date; to: Date } {
  const to = now;
  const from = startOfDay(now);
  if (p === '7d') from.setDate(from.getDate() - 6);
  else if (p === '30d') from.setDate(from.getDate() - 29);
  else if (p === '90d') from.setDate(from.getDate() - 89);
  else if (p === '12m') from.setMonth(from.getMonth() - 12);
  else from.setMonth(0, 1);
  return { from, to };
}

const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The date range for every widget on a page, kept in the URL (?range=30d or
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD) so a view can be shared or bookmarked.
 */
export function useDateRange(defaultPreset: Preset = '30d'): [DateRange, (r: { preset: Preset } | { from: string; to: string }) => void] {
  const [params, setParams] = useSearchParams();
  const range = useMemo<DateRange>(() => {
    const from = params.get('from');
    const to = params.get('to');
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      const f = new Date(`${from}T00:00:00`);
      const t = new Date(`${to}T23:59:59`);
      if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f <= t) return { from: f, to: t, preset: 'custom' };
    }
    const p = (PRESETS as readonly string[]).includes(params.get('range') ?? '') ? (params.get('range') as Preset) : defaultPreset;
    // Round "now" to the minute so the query key stays stable between renders.
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(now.getMinutes() + 1);
    return { ...presetRange(p, now), preset: p };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString(), defaultPreset]);

  const set = (r: { preset: Preset } | { from: string; to: string }) => {
    const next = new URLSearchParams(params);
    next.delete('range');
    next.delete('from');
    next.delete('to');
    if ('preset' in r) next.set('range', r.preset);
    else {
      next.set('from', r.from);
      next.set('to', r.to);
    }
    setParams(next, { replace: true });
  };
  return [range, set];
}

export default function DateRangePicker({ range, onChange }: { range: DateRange; onChange: ReturnType<typeof useDateRange>[1] }) {
  const { t } = useTranslation('admin');
  const [custom, setCustom] = useState(range.preset === 'custom');
  const [from, setFrom] = useState(toInput(range.from));
  const [to, setTo] = useState(toInput(range.to));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label={t('range.label')} className="inline-flex rounded-lg border border-line bg-panel p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={range.preset === p}
            onClick={() => {
              setCustom(false);
              onChange({ preset: p });
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${range.preset === p ? 'bg-ink text-panel' : 'text-ink-muted hover:text-ink'}`}
          >
            {t(`range.${p}`)}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={range.preset === 'custom'}
          onClick={() => setCustom((c) => !c)}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${range.preset === 'custom' ? 'bg-ink text-panel' : 'text-ink-muted hover:text-ink'}`}
        >
          <CalendarDays size={13} aria-hidden /> {t('range.custom')}
        </button>
      </div>
      {custom && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from <= to) onChange({ from, to });
          }}
        >
          <input type="date" aria-label={t('range.from')} value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-md border border-line bg-panel px-2 text-xs text-ink" />
          <span className="text-xs text-ink-muted">–</span>
          <input type="date" aria-label={t('range.to')} value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-md border border-line bg-panel px-2 text-xs text-ink" />
          <button type="submit" className="h-8 rounded-md bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-600">{t('range.apply')}</button>
        </form>
      )}
    </div>
  );
}
