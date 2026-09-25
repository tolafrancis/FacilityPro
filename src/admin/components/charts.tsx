import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

// Admin charts: one series per chart (one axis, no legend needed — the card
// title names it), brand colour validated for the light and dark panels,
// recessive grid, hover crosshair + tooltip, keyboard stepping, and a table
// view for every chart (see the dataviz method).

const MARK = '#E8552D';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** A round axis top so gridlines land on readable values. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= v) ?? v);
}

export interface Point {
  t: string;
  v: number;
}

export function TimeSeriesChart({
  points,
  kind = 'area',
  label,
  formatValue,
  formatTime,
  height = 220,
  showTable = false,
  valueHeader,
  timeHeader,
}: {
  points: Point[];
  kind?: 'area' | 'bar';
  label: string;
  formatValue: (v: number) => string;
  formatTime: (t: string, short?: boolean) => string;
  height?: number;
  showTable?: boolean;
  valueHeader: string;
  timeHeader: string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  if (showTable) {
    return (
      <div className="max-h-[260px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel text-left text-xs text-ink-muted">
            <tr><th className="py-1.5 font-medium">{timeHeader}</th><th className="py-1.5 text-right font-medium">{valueHeader}</th></tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.t} className="border-t border-line">
                <td className="py-1.5 text-ink">{formatTime(p.t)}</td>
                <td className="py-1.5 text-right tabular-nums text-ink">{formatValue(p.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const padL = 48;
  const padR = 8;
  const padT = 8;
  const padB = 24;
  const w = Math.max(0, width - padL - padR);
  const h = height - padT - padB;
  const top = niceMax(Math.max(0, ...points.map((p) => p.v)));
  const ticks = [0, top / 2, top];
  const n = points.length;
  const x = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const bw = n ? Math.max(2, Math.min(28, (w / n) * 0.6)) : 0;
  const bx = (i: number) => (n ? (i + 0.5) * (w / n) : 0);
  const y = (v: number) => h - (v / top) * h;
  const cx = (i: number) => (kind === 'bar' ? bx(i) : x(i));

  const onMove = (clientX: number, rect: DOMRect) => {
    if (!n) return;
    const rel = clientX - rect.left - padL;
    const i = kind === 'bar' ? Math.floor(rel / (w / n)) : Math.round((rel / Math.max(1, w)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (!n) return;
    if (e.key === 'ArrowRight') setHover((h0) => Math.min(n - 1, (h0 ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h0) => Math.max(0, (h0 ?? n) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };

  // Label roughly every 70px on the time axis.
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(w / 70))));
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.v)}`).join(' ');
  const area = n ? `${line} L${x(n - 1)},${h} L${x(0)},${h} Z` : '';
  const hp = hover != null ? points[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
          onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
          onTouchStart={(e) => onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchMove={(e) => onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          className="outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded"
        >
          <g transform={`translate(${padL},${padT})`}>
            {ticks.map((tv) => (
              <g key={tv}>
                <line x1={0} x2={w} y1={y(tv)} y2={y(tv)} className="stroke-line" strokeDasharray={tv ? '3 3' : undefined} />
                <text x={-8} y={y(tv)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px] tabular-nums">{formatValue(tv)}</text>
              </g>
            ))}
            {kind === 'area' ? (
              <>
                <path d={area} fill={MARK} fillOpacity={0.12} />
                <path d={line} fill="none" stroke={MARK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </>
            ) : (
              points.map((p, i) => {
                const bh = Math.max(p.v > 0 ? 2 : 0, h - y(p.v));
                const r = Math.min(4, bw / 2, bh);
                const x0 = bx(i) - bw / 2;
                const y0 = h - bh;
                return (
                  <path
                    key={p.t}
                    d={bh ? `M${x0},${h} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${h} Z` : ''}
                    fill={MARK}
                    fillOpacity={hover == null || hover === i ? 1 : 0.45}
                  />
                );
              })
            )}
            {points.map((p, i) =>
              i % every === 0 ? (
                <text key={p.t} x={cx(i)} y={h + 16} textAnchor="middle" className="fill-ink-muted text-[11px]">{formatTime(p.t, true)}</text>
              ) : null,
            )}
            {hp && (
              <g pointerEvents="none">
                <line x1={cx(hover!)} x2={cx(hover!)} y1={0} y2={h} className="stroke-ink-muted" strokeWidth={1} strokeDasharray="2 3" />
                {kind === 'area' && <circle cx={cx(hover!)} cy={y(hp.v)} r={4.5} fill={MARK} className="stroke-panel" strokeWidth={2} />}
              </g>
            )}
          </g>
        </svg>
      )}
      {hp && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(padL + cx(hover!), 60), width - 60) }}
          role="status"
        >
          <p className="text-ink-muted">{formatTime(hp.t)}</p>
          <p className="font-semibold tabular-nums text-ink">{formatValue(hp.v)}</p>
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars (magnitude by category), with values labelled. */
export function BarList({ rows, formatValue, showTable = false, nameHeader, valueHeader }: {
  rows: { key: string; label: string; value: number; hint?: string; href?: string }[];
  formatValue: (v: number) => string;
  showTable?: boolean;
  nameHeader: string;
  valueHeader: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (showTable) {
    return (
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-muted">
          <tr><th className="py-1.5 font-medium">{nameHeader}</th><th className="py-1.5 text-right font-medium">{valueHeader}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="py-1.5 text-ink">{r.label}</td>
              <td className="py-1.5 text-right tabular-nums text-ink">{formatValue(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} title={r.hint ? `${r.label}: ${r.hint}` : undefined} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink">{r.label}</span>
            <span className="shrink-0 tabular-nums text-ink-muted">{formatValue(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-ink/5">
            <div className="h-2 rounded-full transition-[width] group-hover:opacity-80" style={{ width: `${(r.value / max) * 100}%`, background: MARK, minWidth: r.value ? 4 : 0 }} />
          </div>
          {r.hint && <p className="mt-0.5 text-xs text-ink-muted">{r.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
