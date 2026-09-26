import { useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, CircleHelp, Compass, X } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { pageHelpFor } from '../../help/pageHelp';
import { startTour } from '../../lib/tour';

// "? Help" in the top bar: explains the page you're on — what it's for,
// what you can do here and what the fields mean — with a link to the full
// guide section. Page texts live in src/help/pageHelp.ts.

export default function HelpButton() {
  const { t } = useTranslation('help');
  const { pathname } = useLocation();
  const { role } = useOrg();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const page = pageHelpFor(pathname, role);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        data-tour="help"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm font-medium text-ink hover:bg-surface"
      >
        <CircleHelp size={17} aria-hidden className="text-brand" />
        <span className="hidden sm:inline">{t('button')}</span>
        <span className="sr-only sm:hidden">{t('button')}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[65]" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="absolute inset-0 bg-black/30" aria-hidden onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-[min(26rem,100vw)] flex-col bg-white shadow-2xl" data-testid="help-drawer">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t('drawer.kicker')}</p>
                <h2 id={titleId} className="mt-0.5 text-lg font-semibold text-ink">{page ? page.title : t('drawer.generalTitle')}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="-mr-1 rounded-lg p-2 text-ink-muted hover:bg-surface hover:text-ink" aria-label={t('drawer.close')}>
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm leading-6">
              {page ? (
                <>
                  <p className="text-ink">{page.what}</p>
                  {page.canDo.length > 0 && (
                    <section>
                      <h3 className="font-semibold text-ink">{t('drawer.canDo')}</h3>
                      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-muted marker:text-brand">
                        {page.canDo.map((c) => <li key={c}>{c}</li>)}
                      </ul>
                    </section>
                  )}
                  {page.fields.length > 0 && (
                    <section>
                      <h3 className="font-semibold text-ink">{t('drawer.fields')}</h3>
                      <dl className="mt-1.5 divide-y divide-line rounded-xl border border-line">
                        {page.fields.map(([name, desc]) => (
                          <div key={name} className="px-3 py-2">
                            <dt className="font-medium text-ink">{name}</dt>
                            <dd className="text-ink-muted">{desc}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}
                  {page.tip && (
                    <p className="rounded-xl border-l-4 border-emerald-500/60 bg-emerald-50 px-3 py-2 text-emerald-950">
                      <strong>{t('drawer.tip')}</strong> {page.tip}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-ink-muted">{t('drawer.generalBody')}</p>
              )}
            </div>

            <div className="space-y-2 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {page?.guide && (
                <Link to={page.guide} className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
                  <BookOpen size={16} aria-hidden /> {t('drawer.openGuide')}
                </Link>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Link to="/help" className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface">
                  <BookOpen size={15} aria-hidden /> {t('drawer.helpCenter')}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    startTour();
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
                >
                  <Compass size={15} aria-hidden /> {t('drawer.tour')}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
