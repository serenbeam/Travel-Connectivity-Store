import type { SupabaseClient } from '@supabase/supabase-js';

import { newUserClient, serviceClient } from './clients';

/**
 * Auth fixtures built with the Auth Admin API.
 *
 * `app_metadata` can only be written with the service role, which is exactly why
 * `public.is_admin()` reads `app_metadata` and not `user_metadata`: a user can edit
 * their own `user_metadata`, so it must never grant privileges (see jwt-spoof test).
 */

export const TEST_PASSWORD = 'Roamly-test-2026';
export const ADMIN_EMAIL = 'admin@roamly.test';
export const MEMBER_EMAIL = 'member@roamly.test';

async function ensureUser(email: string, appMetadata: Record<string, unknown>): Promise<string> {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });

  if (error) {
    throw new Error(`auth.admin.listUsers failed: ${error.message}`);
  }

  const existing = data.users.find((user) => user.email === email);

  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password: TEST_PASSWORD,
      app_metadata: appMetadata,
    });

    if (updateError) {
      throw new Error(`auth.admin.updateUserById failed: ${updateError.message}`);
    }

    return existing.id;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: appMetadata,
  });

  if (createError || !created.user) {
    throw new Error(`auth.admin.createUser failed: ${createError?.message ?? 'no user returned'}`);
  }

  return created.user.id;
}

export function ensureAdminUser(): Promise<string> {
  return ensureUser(ADMIN_EMAIL, { role: 'admin' });
}

export function ensureMemberUser(): Promise<string> {
  return ensureUser(MEMBER_EMAIL, { role: 'member' });
}

/** Signs in and returns a client whose requests carry that user's JWT. */
export async function signInAs(email: string): Promise<SupabaseClient> {
  const client = newUserClient();
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });

  if (error) {
    throw new Error(`signInWithPassword(${email}) failed: ${error.message}`);
  }

  return client;
}

export async function adminSession(): Promise<SupabaseClient> {
  await ensureAdminUser();
  return signInAs(ADMIN_EMAIL);
}

export async function memberSession(): Promise<SupabaseClient> {
  await ensureMemberUser();
  return signInAs(MEMBER_EMAIL);
}
