import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Absolute asset URLs: with './' a deep link such as /work-orders/123 made the
  // browser request /work-orders/assets/*.js, which the SPA fallback answers
  // with index.html — a blank page on refresh or when opening a shared link.
  base: '/',
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Split the shared vendor chunk by library instead of one shared
        // blob: these change at very different rates (React/Router almost
        // never, Supabase/query occasionally, app code every deploy), so a
        // returning visitor re-downloads only what actually changed instead
        // of the whole vendor bundle every time this app ships.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'vendor-router';
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler')
          ) {
            return 'vendor-react';
          }
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (id.includes('i18next')) return 'vendor-i18n';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('qrcode.react')) return 'vendor-misc';
          return 'vendor';
        },
      },
    },
  },
});
