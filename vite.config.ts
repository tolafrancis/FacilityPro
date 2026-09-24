import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Stamps dist/sw.js with a hash of the built index.html (which names every
// hashed asset), so each deploy invalidates the service-worker cache.
function swBuildId(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sw-build-id',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const index = readFileSync(resolve(outDir, 'index.html'));
      const id = createHash('sha256').update(index).digest('hex').slice(0, 12);
      const swPath = resolve(outDir, 'sw.js');
      writeFileSync(swPath, readFileSync(swPath, 'utf8').replace(/__BUILD_ID__/g, id));
    },
  };
}

export default defineConfig({
  plugins: [react(), swBuildId()],
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
          // Loaded on demand only when VITE_SENTRY_DSN is set (src/lib/monitoring.ts).
          if (id.includes('@sentry')) return 'vendor-sentry';
          return 'vendor';
        },
      },
    },
  },
});
