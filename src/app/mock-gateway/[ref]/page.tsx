import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { isMockGatewayEnabled } from '@/lib/env';

import { MockGatewayControls } from './mock-gateway-controls';

/**
 * `/mock-gateway/[ref]` — the simulated provider page (api-contract §4.6, AC-P7).
 *
 * Disabled outside development: `isMockGatewayEnabled()` returns 404 in production unless
 * `MOCK_GATEWAY_ENABLED=true` was deliberately set. The capability token arrives as a query
 * parameter (E-5 D-1); the path already carries `no-referrer`, `no-store`, `noindex` from
 * next.config.ts, so it is the same secrecy class as `/orders/<token>`.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Simulated payment',
  robots: { index: false, follow: false },
};

const REF_PATTERN = /^[A-Za-z0-9_]{8,64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export default async function MockGatewayPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  if (!isMockGatewayEnabled()) {
    notFound();
  }

  const { ref } = await params;
  const query = await searchParams;
  const rawToken = Array.isArray(query.token) ? query.token[0] : query.token;

  if (!REF_PATTERN.test(ref) || rawToken === undefined || !TOKEN_PATTERN.test(rawToken)) {
    notFound();
  }

  return (
    <main className="min-h-dvh bg-sand py-16">
      <Container>
        <div className="mx-auto flex max-w-[560px] flex-col gap-6 rounded-lg border border-sand-strong bg-paper p-6 shadow-card">
          <p className="rounded-sm bg-warn/15 px-3 py-2 text-center text-xs font-semibold tracking-wide text-warn uppercase">
            Simulation — no real payment
          </p>

          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-medium">Simulated payment page</h1>
            <p className="text-sm text-ink-muted">
              Choose the outcome this simulated gateway should record for the reference below.
              The order status changes only after the server verifies that decision.
            </p>
          </div>

          <p className="rounded-sm border border-sand bg-surface px-3 py-2 font-mono text-xs break-all text-ink-muted">
            {ref}
          </p>

          <MockGatewayControls reference={ref} token={rawToken} />
        </div>
      </Container>
    </main>
  );
}
