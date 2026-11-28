import type { User } from '@supabase/supabase-js';
import type { NextResponse } from 'next/server';

import { jsonError, type ApiErrorBody } from '@/lib/http';

import { getAdminSession, type AdminSessionResult } from './session';

/**
 * HTTP mapping for admin authorization (docs/api-contract.md §2, §5).
 *
 * `proxy.ts` is only an early session gate and the UI is never an authorization
 * decision: every `/api/admin/*` handler calls `adminGuard()` as its FIRST statement,
 * before it reads a query string or a request body. The guard returns a ready response
 * so a handler cannot forget to map 401 vs 403.
 *
 * The session reader is injectable so the mapping is unit-testable without a request
 * context or a running Supabase instance (tests/unit/admin-guard.test.ts).
 */
export type AdminGuardResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse<ApiErrorBody> };

/** 401 = no usable session, 403 = authenticated but `app_metadata.role !== 'admin'`. */
export function adminFailure(status: 401 | 403): NextResponse<ApiErrorBody> {
  return status === 401
    ? jsonError('UNAUTHORIZED', 'Authentication required.')
    : jsonError('FORBIDDEN', 'Administrator role required.');
}

export async function adminGuard(
  readSession: () => Promise<AdminSessionResult> = getAdminSession,
): Promise<AdminGuardResult> {
  const session = await readSession();

  if (!session.ok) {
    return { ok: false, response: adminFailure(session.status) };
  }

  return { ok: true, user: session.user };
}
