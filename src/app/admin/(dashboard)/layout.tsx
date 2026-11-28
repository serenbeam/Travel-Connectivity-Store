import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AdminNav } from '@/components/admin/admin-nav';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { getAdminSession } from '@/modules/auth/session';

import { signOutAction } from '../actions';

/**
 * Authoritative authorization for every admin page (FR-A2 / AC-A2, AC-A3).
 *
 * - no session  -> redirect to the login page (the proxy's early gate is not enough);
 * - non-admin   -> render an explicit "access denied" panel instead of redirecting, because
 *                  the user stays authenticated and a redirect would only bounce back here.
 * The check runs on the server for every request inside this route group.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();

  if (!session.ok) {
    if (session.status === 401) {
      redirect('/admin/login');
    }

    return (
      <main id="main" className="flex min-h-dvh items-center justify-center py-16">
        <Container className="max-w-md">
          <div className="rounded-sm border border-sand bg-surface p-6">
            <p className="text-xs font-medium tracking-[0.16em] text-ink-muted uppercase">
              Roamly admin
            </p>
            <h1 className="mt-2 font-display text-2xl text-ink">Access denied</h1>
            <p role="alert" className="mt-2 text-sm text-ink-muted">
              This account is signed in but does not have the administrator role.
            </p>
            <form action={signOutAction} className="mt-6">
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          </div>
        </Container>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-sand bg-surface">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-ink-muted uppercase">
              Roamly admin
            </p>
            <p className="text-sm text-ink">{session.user.email}</p>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </Container>
      </header>

      <Container className="flex flex-1 flex-col gap-6 py-6 lg:flex-row lg:gap-8">
        <AdminNav />
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </Container>
    </div>
  );
}
