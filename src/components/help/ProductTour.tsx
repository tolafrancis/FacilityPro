import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useOrg } from '../../contexts/OrgContext';
import { TOUR_START_EVENT, readTourState, saveTourState, shouldAutoStart } from '../../lib/tour';
import { tourSteps } from '../../help/tour';

// The guided tour: a spotlight on one part of the screen at a time with a
// short explanation. Starts by itself on the home screen the first time
// someone signs in, and again from Help (Take the tour). Skip hides it for
// this visit; "Don't show again" or finishing it hides it for good.

const SESSION_SKIP = 'fp.tour.skipped';
const PAD = 6;

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(key: string | undefined): HTMLElement | null {
  if (!key) return null;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export default function ProductTour() {
  const { t } = useTranslation('help');
  const { user } = useAuth();
  const { role } = useOrg();
  const { pathname } = useLocation();
  const steps = tourSteps(role);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [never, setNever] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: 340, h: 200 });

  // First visit to the home screen: start by itself.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!user || !role || autoChecked.current || pathname !== '/') return;
    autoChecked.current = true;
    let skipped = false;
    try {
      skipped = sessionStorage.getItem(SESSION_SKIP) === '1';
    } catch {
      /* no storage */
    }
    if (!skipped && shouldAutoStart(readTourState(user.id, user.user_metadata))) {
      const id = window.setTimeout(() => {
        setI(0);
        setOpen(true);
      }, 900);
      return () => window.clearTimeout(id);
    }
  }, [user, role, pathname]);

  useEffect(() => {
    const start = () => {
      setI(0);
      setNever(false);
      setOpen(true);
    };
    window.addEventListener(TOUR_START_EVENT, start);
    return () => window.removeEventListener(TOUR_START_EVENT, start);
  }, []);

  const step = steps[Math.min(i, steps.length - 1)];

  const measure = useCallback(() => {
    const el = findTarget(step?.target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    // Clamp tall targets (the side menu) to the screen.
    const top = Math.max(4, r.top - PAD);
    const bottom = Math.min(window.innerHeight - 4, r.bottom + PAD);
    setRect({ top, left: r.left - PAD, width: r.width + PAD * 2, height: Math.max(0, bottom - top) });
  }, [step?.target]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = findTarget(step?.target);
    if (el) {
      const r = el.getBoundingClientRect();
      // Bring small targets into view; never scroll for ones taller than the screen.
      if (r.height < window.innerHeight && (r.top < 0 || r.bottom > window.innerHeight)) el.scrollIntoView({ block: 'center' });
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, i, measure, step?.target]);

  useLayoutEffect(() => {
    if (!open || !card.current) return;
    const r = card.current.getBoundingClientRect();
    setCardSize({ w: r.width, h: r.height });
    card.current.focus();
  }, [open, i]);

  const finish = useCallback(
    (how: 'done' | 'skip') => {
      setOpen(false);
      if (!user) return;
      if (how === 'done' || never) {
        void saveTourState(user.id, { done: how === 'done', dismissed: never });
      } else {
        try {
          sessionStorage.setItem(SESSION_SKIP, '1');
        } catch {
          /* no storage */
        }
      }
    },
    [user, never]
  );

  const next = useCallback(() => (i >= steps.length - 1 ? finish('done') : setI(i + 1)), [i, steps.length, finish]);
  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish('skip');
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, next, prev, finish]);

  if (!open || !step) return null;

  // Card beside the highlighted element (below, else above), kept on screen;
  // centred when the step has no target on this screen size.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let pos: React.CSSProperties;
  if (rect) {
    const below = rect.top + rect.height + 12;
    const above = rect.top - cardSize.h - 12;
    const sideRight = rect.left + rect.width + 12;
    let top: number;
    let left: number;
    if (below + cardSize.h <= vh - 8) {
      top = below;
      left = rect.left;
    } else if (above >= 8) {
      top = above;
      left = rect.left;
    } else {
      // Tall targets (the side menu): put the card beside them.
      top = Math.max(8, Math.min(vh - cardSize.h - 8, rect.top + 40));
      left = sideRight;
    }
    left = Math.max(8, Math.min(vw - cardSize.w - 8, left));
    pos = { top, left };
  } else {
    pos = { top: Math.max(8, (vh - cardSize.h) / 2), left: Math.max(8, (vw - cardSize.w) / 2) };
  }

  const last = i === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[70]" data-testid="product-tour">
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl ring-2 ring-brand transition-all duration-200"
          style={{ ...rect, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)' }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-slate-900/55" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp-tour-title"
        aria-describedby="fp-tour-body"
        tabIndex={-1}
        className="fixed w-[min(22rem,calc(100vw-1rem))] rounded-2xl border border-line bg-white p-5 shadow-2xl outline-none"
        style={pos}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            {t('tour.progress', { current: i + 1, total: steps.length })}
          </p>
          <button type="button" onClick={() => finish('skip')} className="-m-1 rounded p-1 text-ink-muted hover:bg-surface hover:text-ink" aria-label={t('tour.skip')}>
            <X size={16} aria-hidden />
          </button>
        </div>
        <h2 id="fp-tour-title" className="mt-1 text-lg font-semibold text-ink">{t(`tour.steps.${step.id}.title`)}</h2>
        <p id="fp-tour-body" className="mt-1.5 text-sm leading-6 text-ink-muted">{t(`tour.steps.${step.id}.body`)}</p>
        <div className="mt-3 flex gap-1" aria-hidden>
          {steps.map((s, n) => (
            <span key={s.id} className={`h-1.5 flex-1 rounded-full ${n <= i ? 'bg-brand' : 'bg-line'}`} />
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} className="h-4 w-4 rounded border-line accent-[var(--color-brand,#e8542b)]" />
          {t('tour.dontShow')}
        </label>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={() => finish('skip')} className="text-sm font-medium text-ink-muted hover:text-ink">
            {t('tour.skip')}
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" onClick={prev} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface">
                {t('tour.previous')}
              </button>
            )}
            <button type="button" onClick={next} className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">
              {last ? t('tour.finish') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
