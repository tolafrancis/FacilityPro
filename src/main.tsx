import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from './i18n';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { OrgProvider } from './contexts/OrgContext';
import { SyncProvider } from './contexts/SyncContext';
import ErrorBoundary from './components/ErrorBoundary';
import Toaster, { notifyError } from './components/Toaster';
import { friendlyError } from './lib/ui';

type ApiError = { code?: string; message?: string; status?: number };

// Errors that can't succeed on a retry (not found, permission, bad input):
// fail straight away so the page shows "not found" instead of loading for ~7s.
function isPermanent(error: unknown): boolean {
  const e = error as ApiError;
  return (
    e?.code === 'PGRST116' ||
    /^(22|23|42)/.test(e?.code ?? '') ||
    (typeof e?.status === 'number' && e.status >= 400 && e.status < 500)
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => !isPermanent(error) && failureCount < 2,
    },
  },
  // A list that failed to load must not look like an empty list. Missing
  // records (PGRST116) are left to the page, which shows "not found".
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.errorHandled || (error as ApiError)?.code === 'PGRST116') return;
      notifyError(friendlyError(error as ApiError, i18n.getFixedT(null, 'common')));
    },
  }),
  // Every failed save is visible: mutations that don't show their own error
  // (no onError, no meta.errorHandled) get an app-wide toast.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError || mutation.meta?.errorHandled) return;
      notifyError(friendlyError(error as ApiError, i18n.getFixedT(null, 'common')));
    },
  }),
});

const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div className="grid min-h-screen place-items-center text-ink-muted">Loading…</div>}>
        <QueryClientProvider client={queryClient}>
          <SyncProvider>
            <BrowserRouter>
              <AuthProvider>
                <OrgProvider>
                  <App />
                  <Toaster />
                </OrgProvider>
              </AuthProvider>
            </BrowserRouter>
          </SyncProvider>
        </QueryClientProvider>
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(serviceWorkerUrl).catch(() => {
      /* offline shell unavailable; app still works online */
    });
  });
}
