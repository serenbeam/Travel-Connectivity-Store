import type { User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { adminFailure, adminGuard } from '@/modules/auth/guard';
import type { AdminSessionResult } from '@/modules/auth/session';

/**
 * 401/403 mapping (AC-A2, AC-A3).
 *
 * This proves the HTTP layer of the authorization decision: no session -> 401, authenticated
 * non-admin -> 403, both with `Cache-Control: no-store`, and a valid admin session yields the
 * user. The database half (RLS) is already covered by tests/integration/rls.test.ts and is
 * deliberately not repeated here.
 */
const USER = { id: 'user-1', email: 'admin@roamly.test' } as unknown as User;

function reader(result: AdminSessionResult) {
  return async () => result;
}

describe('adminFailure', () => {
  it('maps 401 to UNAUTHORIZED', async () => {
    const response = adminFailure(401);

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
  });

  it('maps 403 to FORBIDDEN', async () => {
    const response = adminFailure(403);

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: { code: 'FORBIDDEN', message: 'Administrator role required.' },
    });
  });
});

describe('adminGuard', () => {
  it('returns a 401 response and no user when there is no session', async () => {
    const result = await adminGuard(reader({ ok: false, status: 401 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it('returns a 403 response and no user for a non-admin session', async () => {
    const result = await adminGuard(reader({ ok: false, status: 403 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
    }
  });

  it('returns the user for an admin session', async () => {
    const result = await adminGuard(reader({ ok: true, user: USER }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toBe(USER);
    }
  });

  it('reads the session exactly once per request', async () => {
    const readSession = vi.fn(reader({ ok: true, user: USER }));

    await adminGuard(readSession);

    expect(readSession).toHaveBeenCalledTimes(1);
  });
});
