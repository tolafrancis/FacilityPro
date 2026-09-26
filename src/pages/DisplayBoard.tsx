import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, Clock, Maximize, MapPin, Package, User, WifiOff } from 'lucide-react';
import { resolveI18n } from '../i18n/resolver';
import { orgLogoUrl } from '../lib/orgLogo';
import { boardColumns, changedRefs, useScreen, type ColumnKey, type ScreenWorkOrder } from '../lib/displayBoards';

// The TV screen for a display board (/display/<token>, migration 0092). No
// sign-in: the link is the key. Built for a wall screen seen from a distance:
// everything scales with the screen width, it refreshes itself every 20
// seconds, keeps the screen awake, and pages through long columns.

const PAGE_SECONDS = 12;

const COLUMN_COLOR: Record<ColumnKey, string> = { new: '#3B82F6', in_progress: '#E8552D', on_hold: '#F59E0B', done: '#16A34A' };
const PRIORITY_COLOR: Record<string, string> = { critical: '#DC2626', high: '#EA580C', medium: '#2563EB', low: '#6B7280' };

type Theme = 'dark' | 'light';
const THEME: Record<Theme, { page: string; card: string; ink: string; muted: string; line: string }> = {
  dark: { page: '#0B0F17', card: '#161C28', ink: '#F8FAFC', muted: '#94A3B8', line: '#243044' },
  light: { page: '#EEF1F5', card: '#FFFFFF', ink: '#0F172A', muted: '#556173', line: '#D8DEE7' },
};

export default function DisplayBoard() {
  const { token } = useParams();
  const q = useScreen(token);
  const data = q.data;
  const lng = data?.ok ? data.board.lng : data?.lng ?? undefined;
  const { t } = useTranslation('display', { lng });
  const theme: Theme = (data?.ok ? data.board.theme : data?.theme) ?? 'dark';
  const c = THEME[theme];
  useScreenSetup(c.page);

  // Flash cards that moved or arrived since the last refresh.
  const prev = useRef<ScreenWorkOrder[]>();
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!data?.ok) return;
    const changed = changedRefs(prev.current, data.work_orders);
    prev.current = data.work_orders;
    if (changed.size) {
      setFlash(changed);
      const id = setTimeout(() => setFlash(new Set()), 10_000);
      return () => clearTimeout(id);
    }
  }, [data]);

  if (!data) {
    return (
      <Shell c={c}>
        <div className="grid flex-1 place-items-center text-2xl" style={{ color: c.muted }}>
          {q.isError ? <span className="inline-flex items-center gap-3"><WifiOff aria-hidden /> {t('connecting')}</span> : t('loading')}
        </div>
      </Shell>
    );
  }
  if (!data.ok) {
    return (
      <Shell c={c}>
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <p className="text-4xl font-semibold" style={{ color: c.ink }}>{t(data.reason === 'off' ? 'off.title' : 'notFound.title')}</p>
            <p className="mt-3 text-xl" style={{ color: c.muted }}>{t(data.reason === 'off' ? 'off.body' : 'notFound.body')}</p>
          </div>
        </div>
      </Shell>
    );
  }

  const b = data.board;
  const boardLng = b.lng;
  const logo = orgLogoUrl(data.org.logo_path);
  const columns = boardColumns(b.statuses, data.work_orders);
  const open = data.work_orders.filter((o) => !['resolved', 'verified', 'closed'].includes(o.status));
  const overdue = open.filter((o) => o.overdue).length;

  return (
    <Shell c={c}>
      <header className="flex items-center gap-5 px-8 pb-4 pt-6">
        {logo && <img src={logo} alt="" className="h-14 w-14 rounded-xl object-contain" style={{ background: '#fff' }} />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-bold tracking-tight" style={{ color: c.ink }}>{b.name}</h1>
          <p className="truncate text-lg" style={{ color: c.muted }}>
            {data.org.name}{b.site ? ` · ${resolveI18n(b.site, boardLng)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <Stat label={t('stats.open')} value={open.length} color={c.ink} muted={c.muted} />
          {b.fields.includes('due') && <Stat label={t('stats.overdue')} value={overdue} color={overdue ? '#EF4444' : c.ink} muted={c.muted} />}
          <ClockView lng={boardLng} c={c} />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-4 px-8">
        {b.layout === 'list'
          ? <ListView orders={data.work_orders} fields={b.fields} lng={boardLng} t={t} c={c} flash={flash} />
          : columns.map((col) => (
              <Column key={col.key} colKey={col.key} orders={col.orders} fields={b.fields} lng={boardLng} t={t} c={c} flash={flash}
                count={columns.length} />
            ))}
      </main>

      <footer className="flex items-center justify-between px-8 py-3 text-sm" style={{ color: c.muted }}>
        <span className="inline-flex items-center gap-2">
          {q.isError
            ? <><WifiOff size={16} aria-hidden className="text-amber-500" /> {t('reconnecting')}</>
            : t('updated', { time: new Date(q.dataUpdatedAt).toLocaleTimeString(boardLng, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}
        </span>
        <span>{t('poweredBy')}</span>
      </footer>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
type Colors = (typeof THEME)[Theme];

function Shell({ c, children }: { c: Colors; children: ReactNode }) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(id);
      id = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      clearTimeout(id);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
    };
  }, []);
  const { t } = useTranslation('display');
  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden ${idle ? 'cursor-none' : ''}`} style={{ background: c.page, color: c.ink }}>
      {children}
      {!idle && document.fullscreenEnabled && !document.fullscreenElement && (
        <button type="button" onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}
          className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: c.card, color: c.ink, border: `1px solid ${c.line}` }}>
          <Maximize size={16} aria-hidden /> {t('fullscreen')}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, color, muted }: { label: string; value: number; color: string; muted: string }) {
  return (
    <div className="text-right">
      <p className="text-3xl font-bold tabular-nums leading-none" style={{ color }}>{value}</p>
      <p className="mt-1 text-sm uppercase tracking-wide" style={{ color: muted }}>{label}</p>
    </div>
  );
}

function ClockView({ lng, c }: { lng: string; c: Colors }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="border-l pl-6 text-right" style={{ borderColor: c.line }}>
      <p className="text-4xl font-bold tabular-nums leading-none" style={{ color: c.ink }}>{now.toLocaleTimeString(lng, { hour: '2-digit', minute: '2-digit' })}</p>
      <p className="mt-1 text-sm" style={{ color: c.muted }}>{now.toLocaleDateString(lng, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    </div>
  );
}

/**
 * Shows as many items as fully fit in the container, then pages through the
 * rest every PAGE_SECONDS. Measured from the real layout (card heights vary
 * with titles and details), so no card is ever cut off.
 */
function useFitPager<T>(items: T[]) {
  const ref = useRef<HTMLElement | null>(null);
  const [fit, setFit] = useState(Number.POSITIVE_INFINITY);
  const [start, setStart] = useState(0);
  const key = items.length;

  // Re-measure when the items or the screen size change.
  useEffect(() => setFit(Number.POSITIVE_INFINITY), [key]);
  useEffect(() => {
    const reset = () => setFit(Number.POSITIVE_INFINITY);
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box || fit !== Number.POSITIVE_INFINITY) return;
    const limit = box.getBoundingClientRect().bottom + 1;
    const kids = Array.from(box.querySelectorAll('[data-item]'));
    const n = kids.filter((c) => c.getBoundingClientRect().bottom <= limit).length;
    setFit(Math.max(1, n));
  });

  const size = Number.isFinite(fit) ? fit : items.length;
  const pageCount = Math.max(1, Math.ceil(items.length / Math.max(1, size)));
  useEffect(() => {
    if (start >= items.length) setStart(0);
  }, [items.length, start]);
  useEffect(() => {
    if (pageCount <= 1) {
      setStart(0);
      return;
    }
    const id = setInterval(() => setStart((s) => (s + size >= items.length ? 0 : s + size)), PAGE_SECONDS * 1000);
    return () => clearInterval(id);
  }, [pageCount, size, items.length]);

  const first = start < items.length ? start : 0;
  return {
    ref,
    visible: Number.isFinite(fit) ? items.slice(first, first + size) : items.slice(first),
    page: Math.floor(first / Math.max(1, size)),
    pageCount,
  };
}

function Column({ colKey, orders, fields, lng, t, c, flash, count }: {
  colKey: ColumnKey; orders: ScreenWorkOrder[]; fields: string[]; lng: string; t: TFunction; c: Colors; flash: Set<string>; count: number;
}) {
  const pager = useFitPager(orders);
  const color = COLUMN_COLOR[colKey];
  return (
    <section className="flex min-w-0 flex-1 flex-col" style={{ maxWidth: count === 1 ? undefined : `${100 / count}%` }}>
      <div className="mb-3 flex items-center justify-between rounded-xl px-4 py-3" style={{ background: color }}>
        <h2 className="text-2xl font-bold uppercase tracking-wide text-white">{t(`columns.${colKey}`)}</h2>
        <span className="rounded-full bg-white/25 px-3 py-0.5 text-xl font-bold tabular-nums text-white">{orders.length}</span>
      </div>
      <div ref={(el) => { pager.ref.current = el; }} className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {orders.length === 0 && <p className="px-2 pt-4 text-xl" style={{ color: c.muted }}>{t(`empty.${colKey}`)}</p>}
        {pager.visible.map((o) => <Card key={o.ref} o={o} fields={fields} lng={lng} t={t} c={c} accent={color} flash={flash.has(o.ref)} done={colKey === 'done'} />)}
      </div>
      {pager.pageCount > 1 && <PageDots count={pager.pageCount} page={pager.page} c={c} />}
    </section>
  );
}

function PageDots({ count, page, c }: { count: number; page: number; c: Colors }) {
  return (
    <div className="flex justify-center gap-2 py-2" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: i === page ? c.ink : c.line }} />
      ))}
    </div>
  );
}

function Card({ o, fields, lng, t, c, accent, flash, done }: {
  o: ScreenWorkOrder; fields: string[]; lng: string; t: TFunction; c: Colors; accent: string; flash: boolean; done: boolean;
}) {
  const place = [fields.includes('location') && o.location ? resolveI18n(o.location, lng) : null, fields.includes('asset') && o.asset ? resolveI18n(o.asset, lng) : null].filter(Boolean);
  return (
    <article
      data-item=""
      className={`shrink-0 rounded-xl border-l-8 px-4 py-3 ${flash ? 'fp-display-flash' : ''}`}
      style={{ background: c.card, borderColor: o.overdue ? '#EF4444' : accent, boxShadow: flash ? `0 0 0 3px ${accent}` : undefined }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="line-clamp-2 text-2xl font-semibold leading-tight" style={{ color: c.ink }}>{o.title || t('untitled')}</p>
        <span className="shrink-0 font-mono text-lg" style={{ color: c.muted }}>#{o.ref}</span>
      </div>
      {place.length > 0 && (
        <p className="mt-1.5 flex items-center gap-2 truncate text-lg" style={{ color: c.muted }}>
          {fields.includes('location') && o.location ? <MapPin size={18} aria-hidden className="shrink-0" /> : <Package size={18} aria-hidden className="shrink-0" />}
          <span className="truncate">{place.join(' · ')}</span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-lg">
        {fields.includes('priority') && (
          <span className="rounded-md px-2.5 py-0.5 text-base font-bold uppercase tracking-wide text-white" style={{ background: PRIORITY_COLOR[o.priority] ?? '#6B7280' }}>
            {t(`priority.${o.priority}`, { defaultValue: o.priority })}
          </span>
        )}
        {done ? (
          <span className="font-semibold" style={{ color: '#22C55E' }}>{t(`status.${o.status}`)} · {relTime(o.done_at, lng)}</span>
        ) : (
          <>
            {fields.includes('due') && o.due_at && (
              <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: o.overdue ? '#EF4444' : c.ink }}>
                {o.overdue ? <AlertTriangle size={18} aria-hidden /> : <Clock size={18} aria-hidden />}
                {o.overdue ? t('overdue', { time: relTime(o.due_at, lng) }) : t('due', { time: dueLabel(o.due_at, lng) })}
              </span>
            )}
            {o.status === 'on_hold' || o.status === 'assigned' || o.status === 'open' ? (
              <span style={{ color: c.muted }}>{t(`status.${o.status}`)}</span>
            ) : null}
          </>
        )}
        {fields.includes('assignee') && o.assignee && (
          <span className="inline-flex items-center gap-1.5" style={{ color: c.muted }}><User size={18} aria-hidden />{o.assignee}</span>
        )}
        {fields.includes('created') && <span style={{ color: c.muted }}>{t('created', { time: relTime(o.created_at, lng) })}</span>}
      </div>
    </article>
  );
}

function ListView({ orders, fields, lng, t, c, flash }: {
  orders: ScreenWorkOrder[]; fields: string[]; lng: string; t: TFunction; c: Colors; flash: Set<string>;
}) {
  const pager = useFitPager(orders);
  const col = (f: string) => fields.includes(f);
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div ref={(el) => { pager.ref.current = el; }} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl" style={{ background: c.card }}>
        <table className="w-full text-left text-xl">
          <thead>
            <tr className="text-base uppercase tracking-wide" style={{ color: c.muted, borderBottom: `1px solid ${c.line}` }}>
              <th className="px-5 py-3 font-semibold">{t('list.job')}</th>
              {(col('location') || col('asset')) && <th className="px-4 py-3 font-semibold">{t('list.where')}</th>}
              {col('priority') && <th className="px-4 py-3 font-semibold">{t('list.priority')}</th>}
              <th className="px-4 py-3 font-semibold">{t('list.status')}</th>
              {col('due') && <th className="px-4 py-3 font-semibold">{t('list.due')}</th>}
              {col('assignee') && <th className="px-4 py-3 font-semibold">{t('list.assignee')}</th>}
            </tr>
          </thead>
          <tbody>
            {pager.visible.map((o) => {
              const done = ['resolved', 'verified', 'closed'].includes(o.status);
              const colKey: ColumnKey = done ? 'done' : o.status === 'in_progress' ? 'in_progress' : o.status === 'on_hold' ? 'on_hold' : 'new';
              return (
                <tr key={o.ref} data-item="" className={flash.has(o.ref) ? 'fp-display-flash' : ''} style={{ borderBottom: `1px solid ${c.line}` }}>
                  <td className="px-5 py-3">
                    <p className="line-clamp-1 font-semibold" style={{ color: c.ink }}>{o.title || t('untitled')}</p>
                    <p className="font-mono text-base" style={{ color: c.muted }}>#{o.ref}</p>
                  </td>
                  {(col('location') || col('asset')) && (
                    <td className="px-4 py-3" style={{ color: c.muted }}>
                      {[col('location') && o.location ? resolveI18n(o.location, lng) : null, col('asset') && o.asset ? resolveI18n(o.asset, lng) : null].filter(Boolean).join(' · ') || '—'}
                    </td>
                  )}
                  {col('priority') && (
                    <td className="px-4 py-3">
                      <span className="rounded-md px-2.5 py-0.5 text-base font-bold uppercase text-white" style={{ background: PRIORITY_COLOR[o.priority] ?? '#6B7280' }}>
                        {t(`priority.${o.priority}`, { defaultValue: o.priority })}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-semibold" style={{ color: COLUMN_COLOR[colKey] }}>
                      <span className="h-3 w-3 rounded-full" style={{ background: COLUMN_COLOR[colKey] }} />{t(`status.${o.status}`)}
                    </span>
                  </td>
                  {col('due') && (
                    <td className="px-4 py-3" style={{ color: o.overdue ? '#EF4444' : c.ink }}>
                      {done ? relTime(o.done_at, lng) : o.due_at ? (o.overdue ? t('overdue', { time: relTime(o.due_at, lng) }) : dueLabel(o.due_at, lng)) : '—'}
                    </td>
                  )}
                  {col('assignee') && <td className="px-4 py-3" style={{ color: c.muted }}>{o.assignee ?? '—'}</td>}
                </tr>
              );
            })}
            {orders.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-xl" style={{ color: c.muted }}>{t('empty.all')}</td></tr>}
          </tbody>
        </table>
      </div>
      {pager.pageCount > 1 && <PageDots count={pager.pageCount} page={pager.page} c={c} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scale type with the screen, keep it awake, and match the page colour. */
function useScreenSetup(background: string) {
  useEffect(() => {
    const html = document.documentElement;
    const before = { font: html.style.fontSize, bg: document.body.style.background };
    html.style.fontSize = 'clamp(10px, 0.85vw, 34px)';
    document.body.style.background = background;
    return () => {
      html.style.fontSize = before.font;
      document.body.style.background = before.bg;
    };
  }, [background]);

  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Lock> } };
    let lock: Lock | null = null;
    const get = () => {
      if (document.visibilityState === 'visible') nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    };
    get();
    document.addEventListener('visibilitychange', get);
    return () => {
      document.removeEventListener('visibilitychange', get);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

function relTime(iso: string | null, lng: string): string {
  if (!iso) return '';
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: 'auto', style: 'short' });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const h = Math.round(diffMin / 60);
  if (Math.abs(h) < 48) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}

function dueLabel(iso: string, lng: string): string {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString(lng, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return time;
  return `${d.toLocaleDateString(lng, { day: 'numeric', month: 'short' })} ${time}`;
}

