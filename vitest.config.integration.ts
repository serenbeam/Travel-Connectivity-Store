import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Integration tests: real Postgres, real Auth, real RLS — no mocks (ADR-11).
 *
 * Two execution paths are kept deliberately separate (E-3 P2 decision):
 *   - Supabase client / RPC   -> tests/integration/*.test.ts
 *   - Administrative SQL      -> tests/integration/admin/*.test.ts (docker exec psql)
 * `tests/integration/meta.test.ts` enforces that separation.
 *
 * `server-only` throws outside a React Server Component graph (its default export
 * condition is a module that raises). This suite runs in plain Node, so the marker
 * is aliased to the package's empty module.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/integration/support/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The suite asserts global row counts (e.g. "exactly one order exists") against
    // one shared database, so test files must not run in parallel.
    fileParallelism: false,
    reporters: ['default'],
  },
});
