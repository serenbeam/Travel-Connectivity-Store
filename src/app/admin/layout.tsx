import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Admin shell. Deliberately NO authorization here: `/admin/login` must stay reachable
 * without a session. Authorization lives in `(dashboard)/layout.tsx` plus `adminGuard()`
 * in every admin route handler, with RLS as the final layer.
 */
export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Roamly Admin' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-paper text-ink">{children}</div>;
}
