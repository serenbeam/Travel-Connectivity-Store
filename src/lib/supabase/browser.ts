import { createBrowserClient } from '@supabase/ssr';

import { getPublicEnv } from '@/lib/env.public';

/**
 * Browser Supabase client (anon key only, RLS-bound).
 * Browser-only by construction: creating it during SSR would bind it to the server
 * process, so the call site is guarded explicitly.
 */
export function getSupabaseBrowserClient() {
  if (typeof window === 'undefined') {
    throw new Error(
      'getSupabaseBrowserClient() is browser-only. Use createSupabaseServerClient() on the server.',
    );
  }

  const env = getPublicEnv();

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
