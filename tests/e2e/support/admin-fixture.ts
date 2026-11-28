import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { E2E_ENV } from './env';

/**
 * Admin fixture for the E2E flows.
 *
 * Why this is not `ensureAdminUser()` from `tests/integration/support/auth.ts`:
 * that helper reaches `src/lib/supabase/admin.ts` through `./clients`, and that module
 * starts with `import 'server-only'`. The package resolves to a throwing module outside a
 * React Server Component graph; the integration suite only survives it because
 * `vitest.config.integration.ts` aliases `server-only` to the package's empty module.
 * Playwright has no such alias (and no ESM `import.meta`, see ./env.ts), so the same
 * fixture is reproduced here on top of the E2E environment loader, which keeps the
 * local-stack guard (loopback host, port 54421).
 *
 * Only `.env.test` is read, and `.env.test` and `.env.local` point at the same local
 * stack, so the browser and this fixture talk to one database.
 */

/** Fixed test credentials; never a production credential, never printed in a report. */
export const E2E_ADMIN_EMAIL = 'admin@roamly.test';
export const E2E_ADMIN_PASSWORD = 'Roamly-test-2026';

function serviceClient(): SupabaseClient {
  return createClient(E2E_ENV.NEXT_PUBLIC_SUPABASE_URL, E2E_ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Creates the admin user, or repairs the role and password of an existing one.
 *
 * The role lives in `app_metadata`: only a trusted server holding the service-role key can
 * write it, which is exactly what `public.is_admin()` and `getAdminSession()` read.
 */
export async function ensureAdminUser(): Promise<string> {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });

  if (error) {
    throw new Error(`E2E fixture: auth.admin.listUsers failed: ${error.message}`);
  }

  const existing = data.users.find((user) => user.email === E2E_ADMIN_EMAIL);

  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password: E2E_ADMIN_PASSWORD,
      app_metadata: { role: 'admin' },
    });

    if (updateError) {
      throw new Error(`E2E fixture: auth.admin.updateUserById failed: ${updateError.message}`);
    }

    return existing.id;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'admin' },
  });

  if (createError || !created.user) {
    throw new Error(
      `E2E fixture: auth.admin.createUser failed: ${createError?.message ?? 'no user returned'}`,
    );
  }

  return created.user.id;
}
