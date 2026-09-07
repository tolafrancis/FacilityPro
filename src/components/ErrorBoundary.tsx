import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const RELOAD_FLAG = 'fp_chunk_reload_attempted';

function isChunkLoadError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|Loading chunk|dynamically imported module|error loading dynamically imported module/i.test(
    error.message
  );
}

/**
 * Catches render errors app-wide. React.lazy() means every page is its own
 * chunk fetched at navigation time — after a new deploy replaces dist/, a
 * browser holding an older cached index.html can request a chunk file that
 * no longer exists (404), and Suspense does not catch that: it's a render
 * error, and with no boundary React just unmounts the whole tree, leaving a
 * blank page. A stale chunk is fixed by a fresh page load (it re-fetches the
 * current index.html and its correct chunk manifest), so that's tried once,
 * automatically, before falling back to an explicit "something went wrong"
 * screen — this also covers any other unexpected render error.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      // Auto-reload for a chunk-load error is already in flight; render
      // nothing while that happens rather than flashing the fallback.
      if (isChunkLoadError(this.state.error) && sessionStorage.getItem(RELOAD_FLAG)) {
        return null;
      }
      return (
        <div className="grid min-h-screen place-items-center bg-surface p-6 text-center">
          <div>
            <p className="text-lg font-semibold text-ink">Something went wrong.</p>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              This usually clears up with a reload — a new version may have just been deployed.
            </p>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(RELOAD_FLAG);
                window.location.reload();
              }}
              className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
