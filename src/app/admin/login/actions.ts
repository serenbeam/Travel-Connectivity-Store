'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { logWarn } from '@/lib/logger';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Admin sign-in (Server Action, docs/api-contract.md §1).
 *
 * Rules:
 * - one generic failure message, never the Supabase error text (AC-A1 "safe message");
 * - neither email nor password is logged;
 * - the session is kept for an authenticated non-admin, so the dashboard can render the
 *   documented 403 panel (AC-A3) instead of silently pretending the user is not signed in;
 * - `redirect()` is called outside the try block: it throws NEXT_REDIRECT by design.
 */
export interface LoginState {
  status: 'idle' | 'error';
  message?: string;
}

const credentialsSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

const INVALID_CREDENTIALS = 'Wrong email or password.';

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
}

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  });

  if (!parsed.success) {
    // Shape errors are reported exactly like wrong credentials (no account probing).
    return { status: 'error', message: INVALID_CREDENTIALS };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error || !data.user) {
      logWarn('admin login rejected', { reason: 'invalid_credentials' });

      return { status: 'error', message: INVALID_CREDENTIALS };
    }
  } catch (error) {
    // Missing environment or an unreachable Auth service: fail closed, stay generic.
    logWarn('admin login failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return { status: 'error', message: 'Sign-in could not be completed. Try again.' };
  }

  redirect('/admin');
}
