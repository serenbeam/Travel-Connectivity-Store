import { afterAll, describe, expect, it } from 'vitest';

import { MEMBER_EMAIL, ensureMemberUser, signInAs } from './support/auth';
import { serviceClient } from './support/clients';

import { at } from './support/psql';

/**
 * `public.is_admin()` reads `app_metadata`, which only the Auth Admin API can write.
 * A user can edit `user_metadata` themselves, so if the policy ever read the wrong
 * claim this test would fail.
 */
describe('JWT — user_metadata cannot assert admin', () => {
  const service = serviceClient();

  const decode = (token: string) =>
    JSON.parse(Buffer.from(at(token.split('.'), 1), 'base64url').toString('utf8')) as {
      app_metadata?: { role?: string };
      user_metadata?: { role?: string };
      role?: string;
    };

  afterAll(async () => {
    const userId = await ensureMemberUser();
    await service.auth.admin.updateUserById(userId, { user_metadata: { role: null } });
  });

  it('ignores an admin claim placed in user_metadata', async () => {
    const userId = await ensureMemberUser();

    const { error: metaError } = await service.auth.admin.updateUserById(userId, {
      user_metadata: { role: 'admin', spoofed: true },
    });
    expect(metaError).toBeNull();

    const member = await signInAs(MEMBER_EMAIL);
    const {
      data: { session },
    } = await member.auth.getSession();

    expect(session).not.toBeNull();

    const claims = decode(session!.access_token);

    // The spoof is genuinely present in the signed token ...
    expect(claims.user_metadata?.role).toBe('admin');
    // ... but the claim the database reads is untouched.
    expect(claims.app_metadata?.role).toBe('member');
    expect(claims.role).toBe('authenticated');

    const { data: isAdmin, error: rpcError } = await member.rpc('is_admin');
    expect(rpcError).toBeNull();
    expect(isAdmin).toBe(false);

    const orders = await member.from('orders').select('id');
    expect(orders.error).toBeNull();
    expect(orders.data).toEqual([]);
  });

  it('grants admin only through app_metadata', async () => {
    const admin = await signInAs('admin@roamly.test');
    const {
      data: { session },
    } = await admin.auth.getSession();

    const claims = decode(session!.access_token);
    expect(claims.app_metadata?.role).toBe('admin');

    const { data: isAdmin } = await admin.rpc('is_admin');
    expect(isAdmin).toBe(true);
  });
});
