import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

/**
 * `/admin/login` — the only admin page reachable without a session. `proxy.ts` skips this
 * path so the redirect from a protected page cannot loop (KI-20 closed in E-6).
 */
export default function AdminLoginPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center py-16">
      <Container className="max-w-md">
        <div className="rounded-sm border border-sand bg-surface p-6">
          <p className="text-xs font-medium tracking-[0.16em] text-ink-muted uppercase">
            Roamly admin
          </p>
          <h1 className="mt-2 font-display text-2xl text-ink">Sign in to the admin panel</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Only an account with the administrator role can manage the catalog and view
            orders.
          </p>

          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </Container>
    </main>
  );
}
