import { defineConfig } from 'vitest/config';

// Unit tests for the web app only. The Edge Functions (Deno) and the IoT
// gateway / MQTT bridge have their own test runners.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
