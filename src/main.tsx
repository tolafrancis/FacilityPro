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

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={<div />}>
      <QueryClientProvider client={queryClient}>
        <SyncProvider>
          <BrowserRouter>
            <AuthProvider>
              <OrgProvider>
                <App />
              </OrgProvider>
            </AuthProvider>
          </BrowserRouter>
        </SyncProvider>
      </QueryClientProvider>
    </Suspense>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell unavailable; app still works online */
    });
  });
}
