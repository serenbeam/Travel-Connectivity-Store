import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E for the two flows only (ADR-11): guest checkout to a simulated success,
 * and admin login plus package management.
 *
 * Deliberately narrow:
 * - chromium only, one worker: both specs share one local database (an order is written
 *   by the customer flow, a package is created and deleted by the admin flow);
 * - the dev server is started on demand and reused when one is already listening, so an
 *   interrupted run does not need a manual restart;
 * - `MOCK_GATEWAY_ENABLED=true` comes from `.env.local`, which is why the simulated
 *   provider exists at all (src/lib/env.ts);
 * - traces are written on the first retry only. A trace contains the capability URL of
 *   the order it visited, so `test-results/` stays local and gitignored (never attached
 *   to a commit or a report share).
 *
 * Prerequisites: local Supabase stack (`npx supabase start`) and the admin fixture in
 * `tests/e2e/global-setup.ts`.
 */
const BASE_URL = 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',

  // One database, two specs: serial on purpose.
  fullyParallel: false,
  workers: 1,

  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
