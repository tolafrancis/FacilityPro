import { useMemo, useState, type PointerEvent } from 'react';
import type { HistoryPoint } from '../../lib/iot';
import { formatValue } from '../../lib/iot';

const W = 640;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 48 };

/** Line of bucket averages with a min–max band; hover shows the bucket. */
export default function HistoryChart({
  points,
  unit,
  lng,
  emptyLabel,
}: {
  points: HistoryPoint[];
  unit: string | null;
  lng: string;
  emptyLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const pts = points.filter((p) => p.avg_value !== null);
    if (pts.length === 0) return null;
    const xs = pts.map((p) => new Date(p.bucket).getTime());
    const lo = Math.min(...pts.map((p) => Number(p.min_value ?? p.avg_value)));
    const hi = Math.max(...pts.map((p) => Number(p.max_value ?? p.avg_value)));
    const span = hi - lo || Math.abs(hi) || 1;
    const yMin = lo - span * 0.08;
    const yMax = hi + span * 0.08;
    const x0 = xs[0];
    const x1 = xs[xs.length - 1] === x0 ? x0 + 1 : xs[xs.length - 1];
    const sx = (t: number) => PAD.left + ((t - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
    const sy = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(Number(p.avg_value)).toFixed(1)}`).join('');
    const band =
      pts.map((p, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(Number(p.max_value ?? p.avg_value)).toFixed(1)}`).join('') +
      [...pts].reverse().map((p, i) => `L${sx(xs[pts.length - 1 - i]).toFixed(1)},${sy(Number(p.min_value ?? p.avg_value)).toFixed(1)}`).join('') +
      'Z';
    return { pts, xs, sx, sy, line, band, yMin, yMax };
  }, [points]);

  if (!geo) return <p className="py-10 text-center text-sm text-ink-muted">{emptyLabel}</p>;

  const fmtTime = (t: number) => {
    const spanMs = geo.xs[geo.xs.length - 1] - geo.xs[0];
    return new Intl.DateTimeFormat(lng, spanMs > 2 * 86400000 ? { month: 'short', day: 'numeric' } : { hour: '2-digit', minute: '2-digit' }).format(t);
  };
  const ticks = [geo.yMax, (geo.yMax + geo.yMin) / 2, geo.yMin];
  const h = hover !== null ? geo.pts[hover] : null;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < geo.xs.length; i++) {
      if (Math.abs(geo.sx(geo.xs[i]) - x) < Math.abs(geo.sx(geo.xs[best]) - x)) best = i;
    }
    setHover(best);
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={geo.sy(v)} y2={geo.sy(v)} className="stroke-line" strokeDasharray="3 3" />
            <text x={PAD.left - 6} y={geo.sy(v) + 3} textAnchor="end" className="fill-ink-muted text-[10px]">
              {formatValue(v)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className="fill-ink-muted text-[10px]">{fmtTime(geo.xs[0])}</text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-ink-muted text-[10px]">{fmtTime(geo.xs[geo.xs.length - 1])}</text>
        <path d={geo.band} className="fill-brand/10" />
        <path d={geo.line} fill="none" className="stroke-brand" strokeWidth={2} strokeLinejoin="round" />
        {h && hover !== null && (
          <g>
            <line x1={geo.sx(geo.xs[hover])} x2={geo.sx(geo.xs[hover])} y1={PAD.top} y2={H - PAD.bottom} className="stroke-ink-muted" strokeWidth={1} />
            <circle cx={geo.sx(geo.xs[hover])} cy={geo.sy(Number(h.avg_value))} r={4} className="fill-brand stroke-white" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-line bg-white px-2 py-1 text-xs shadow-sm">
          <p className="font-medium text-ink">{formatValue(Number(h.avg_value), unit)}</p>
          <p className="text-ink-muted">
            {formatValue(Number(h.min_value), null)} – {formatValue(Number(h.max_value), null)} ·{' '}
            {new Intl.DateTimeFormat(lng, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(h.bucket))}
          </p>
        </div>
      )}
    </div>
  );
}
