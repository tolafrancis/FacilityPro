import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { OrgProvider } from './contexts/OrgContext';
import { SyncProvider } from './contexts/SyncContext';
import ErrorBoundary from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

const routerBasename = new URL(import.meta.env.BASE_URL, window.location.href).pathname.replace(/\/$/, '') || '/';
const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div className="grid min-h-screen place-items-center text-ink-muted">Loading…</div>}>
        <QueryClientProvider client={queryClient}>
          <SyncProvider>
            <BrowserRouter basename={routerBasename}>
              <AuthProvider>
                <OrgProvider>
                  <App />
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
