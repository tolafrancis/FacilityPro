import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

/**
 * App-wide toasts. `notifyError()` / `notify()` can be called from anywhere
 * (including the React Query MutationCache in main.tsx), so a failed save
 * is never silent even on screens that don't render their own error.
 */
const EVENT = 'fp-toast';

export type ToastKind = 'error' | 'success' | 'info';

export function notify(message: string, kind: ToastKind = 'info') {
  window.dispatchEvent(new CustomEvent<{ message: string; kind: ToastKind }>(EVENT, { detail: { message, kind } }));
}

export function notifyError(message: string) {
  notify(message, 'error');
}

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const STYLE: Record<ToastKind, { border: string; icon: typeof Info; color: string }> = {
  error: { border: 'border-status-crit/30', icon: AlertTriangle, color: 'text-status-crit' },
  success: { border: 'border-status-ok/30', icon: CheckCircle2, color: 'text-status-ok' },
  info: { border: 'border-line', icon: Info, color: 'text-status-info' },
};

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let next = 0;
    const onToast = (e: Event) => {
      const { message, kind } = (e as CustomEvent<{ message: string; kind: ToastKind }>).detail;
      const id = ++next;
      // Collapse repeats of the same message (e.g. several failed saves).
      setToasts((list) => [...list.filter((t) => t.message !== message), { id, message, kind }].slice(-3));
      window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-4"
    >
      {toasts.map((t) => {
        const { border, icon: Icon, color } = STYLE[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border ${border} bg-panel px-4 py-3 text-sm text-ink shadow-lg`}
          >
            <Icon size={18} className={`mt-px shrink-0 ${color}`} aria-hidden />
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
        );
      })}
    </div>
  );
}
