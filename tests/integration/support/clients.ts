import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/supabase/admin';

import { TEST_ENV } from './env';

/**
 * Supabase clients for the integration suite.
 *
 * Every factory re-checks the local-stack guard (via env.ts, imported first) so a
 * misconfigured environment fails before a connection is attempted.
 */
export function anonClient(): SupabaseClient {
  return createClient(TEST_ENV.NEXT_PUBLIC_SUPABASE_URL, TEST_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Service role. Bypasses RLS; only used to call the writer RPCs in tests. */
export function serviceClient(): SupabaseClient {
  return createAdminClient();
}

/** A fresh, session-less anon client used as the base for user sign-in. */
export function newUserClient(): SupabaseClient {
  return anonClient();
}
