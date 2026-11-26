import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Unit tests only. Node environment on purpose:
 * - no jsdom / component tests (ADR-11);
 * - integration tests against a real Supabase instance are added in E-3;
 * - E2E (Playwright) is added in E-8.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    reporters: ['default'],
  },
});
