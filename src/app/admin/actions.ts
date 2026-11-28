'use server';

import { redirect } from 'next/navigation';

import { logWarn } from '@/lib/logger';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Admin sign-out. Clears the Supabase session cookies through the cookie-bound server
 * client, then returns to the login page. A failure here still redirects: the admin must
 * never be trapped in a shell they asked to leave.
 */
export async function signOutAction(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (error) {
    logWarn('admin sign-out failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
  }

  redirect('/admin/login');
}
