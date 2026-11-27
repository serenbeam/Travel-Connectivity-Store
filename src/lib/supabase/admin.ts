import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';

/**
 * Service-role Supabase client. Server-only.
 *
 * Bypasses RLS, so every call site must have made an authorization decision first and
 * must select an explicit column list (AGENTS.md: a bare row would leak
 * `access_token_hash`, unmasked PII, and internal ids).
 *
 * This module deliberately does NOT reuse `createFetchWithTimeout` from `@/lib/http`:
 * that module imports `next/server`, which would drag the Next runtime into non-Next
 * processes such as the integration suite. The same AbortSignal-based deadline is
 * inlined below.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 8_000;

export function createAdminClient(options?: { fetchTimeoutMs?: number }): SupabaseClient {
  const env = getEnv();
  const timeoutMs = options?.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => {
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        return fetch(input, { ...init, signal });
      },
    },
  });
}
