import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getPublicEnv } from '@/lib/env.public';
import { createFetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from '@/lib/http';

/**
 * Cookie-bound Supabase client for Server Components, Server Actions and Route
 * Handlers. Always create a new client per request — never share it.
 *
 * Uses the @supabase/ssr 0.12 cookie API (getAll / setAll). `setAll` is wrapped in
 * try/catch because Server Components cannot write cookies; proxy.ts refreshes the
 * session in that case.
 */
export async function createSupabaseServerClient(options?: {
  fetchTimeoutMs?: number;
}) {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options: cookieOptions } of cookiesToSet) {
              cookieStore.set(name, value, cookieOptions);
            }
          } catch {
            // Server Components cannot set cookies. proxy.ts refreshes the session.
          }
        },
      },
      global: {
        fetch: createFetchWithTimeout(options?.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS),
      },
    },
  );
}
