import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * A screenshot that opens full screen on click. In the viewer the image fits
 * the window; clicking it (or the zoom button) shows it at full size, and it
 * scrolls or pinch-zooms from there. Escape, the backdrop or ✕ closes it.
 */
export default function ZoomableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const { t } = useTranslation('help');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('zoom.open', { alt })} title={t('zoom.open', { alt })} className="group relative block w-full cursor-zoom-in self-start text-left">
        <img src={src} alt={alt} loading="lazy" className={className} />
        <span aria-hidden className="pointer-events-none absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ZoomIn size={16} />
        </span>
      </button>
      {open && <Viewer src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function Viewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { t } = useTranslation('help');
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-end gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setFull((f) => !f)} aria-label={full ? t('zoom.fit') : t('zoom.full')} title={full ? t('zoom.fit') : t('zoom.full')} className="grid h-10 w-10 place-items-center rounded-lg text-white hover:bg-white/15">
          {full ? <ZoomOut size={20} aria-hidden /> : <ZoomIn size={20} aria-hidden />}
        </button>
        <button type="button" onClick={onClose} aria-label={t('zoom.close')} title={t('zoom.close')} className="grid h-10 w-10 place-items-center rounded-lg text-white hover:bg-white/15">
          <X size={22} aria-hidden />
        </button>
      </div>
      <div className={`min-h-0 flex-1 overflow-auto px-3 pb-3 ${full ? '' : 'flex items-center justify-center'}`}>
        <img
          src={src}
          alt={alt}
          onClick={(e) => {
            e.stopPropagation();
            setFull((f) => !f);
          }}
          className={full ? 'mx-auto max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain'}
        />
      </div>
    </div>
  );
}
