import type { User } from '@supabase/supabase-js';

/**
 * Admin authorization — the authoritative gate for admin Route Handlers, Server
 * Actions and Server Components (proxy.ts is only an early, fail-closed session
 * check; RLS is the final layer).
 *
 * Deliberately free of secrets and of `next/headers` at module scope:
 * - no `import 'server-only'` here because this module imports no secrets — the
 *   secret boundary is enforced by src/lib/env.ts (see AGENTS.md);
 * - the Supabase server client is imported lazily inside getAdminSession(), so the
 *   pure decision function is unit-testable without a request context (gate G7d).
 *
 * app_metadata is used, never user_metadata: only a trusted server holding the
 * service-role key can write app_metadata.
 */
export type AdminRoleInput =
  | { app_metadata?: Record<string, unknown> | null }
  | null
  | undefined;

export function isAdminUser(user: AdminRoleInput): boolean {
  if (!user) {
    return false;
  }

  const role = user.app_metadata?.role;

  return role === 'admin';
}

export type AdminSessionResult =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403 };

export class AuthorizationError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 401 ? 'Authentication required.' : 'Administrator role required.');
    this.name = 'AuthorizationError';
    this.status = status;
  }
}

/**
 * Resolves the current admin session, or a discriminated failure.
 * Route handlers map the result onto 401/403 (docs/api-contract.md §2).
 */
export async function getAdminSession(): Promise<AdminSessionResult> {
  let supabase;

  try {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server');
    supabase = await createSupabaseServerClient();
  } catch {
    // Missing environment, unavailable cookies, or unusable client: fail closed.
    return { ok: false, status: 401 };
  }

  try {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return { ok: false, status: 401 };
    }

    if (!isAdminUser(data.user)) {
      return { ok: false, status: 403 };
    }

    return { ok: true, user: data.user };
  } catch {
    return { ok: false, status: 401 };
  }
}

/** Throws AuthorizationError(401|403) when the caller is not an administrator. */
export async function requireAdmin(): Promise<User> {
  const result = await getAdminSession();

  if (!result.ok) {
    throw new AuthorizationError(result.status);
  }

  return result.user;
}
