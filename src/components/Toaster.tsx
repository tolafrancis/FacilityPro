import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Minimal app-wide error toasts. `notifyError()` can be called from anywhere
 * (including the React Query MutationCache in main.tsx), so a failed save
 * is never silent even on screens that don't render their own error.
 */
const EVENT = 'fp-toast';

export function notifyError(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

interface Toast {
  id: number;
  message: string;
}

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let next = 0;
    const onToast = (e: Event) => {
      const message = (e as CustomEvent<string>).detail;
      const id = ++next;
      // Collapse repeats of the same message (e.g. several failed saves).
      setToasts((list) => [...list.filter((t) => t.message !== message), { id, message }].slice(-3));
      window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 6000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border border-status-crit/30 bg-white px-4 py-3 text-sm text-ink shadow-lg"
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
            className="text-ink-muted hover:text-ink"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
