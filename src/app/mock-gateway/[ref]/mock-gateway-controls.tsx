'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Simulated PSP controls (design §6, api-contract §4.6, architecture §6.2).
 *
 * Two steps, on purpose:
 *  1. `POST /api/mock-gateway/[ref]/settle` makes the *simulated provider* record the
 *     choice. It never touches `orders`/`payments` (AC-P6).
 *  2. `POST /api/payments/verify` asks the server to re-read that provider record and
 *     apply it. The browser sends only `ref` + the capability token — never an outcome —
 *     so the outcome always comes from the provider's own table.
 *
 * The customer is redirected only after the backend verification succeeded (or reported
 * that the payment was already final). Nothing here ever claims success on its own.
 */

const OUTCOMES = [
  { value: 'succeeded', label: 'Simulate success' },
  { value: 'failed', label: 'Simulate failure' },
  { value: 'pending', label: 'Leave pending' },
] as const;

interface VerifyErrorBody {
  error?: { code?: string };
}

export function MockGatewayControls({ reference, token }: { reference: string; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(outcome: string) {
    setBusy(outcome);
    setError(null);

    try {
      const settled = await fetch(`/api/mock-gateway/${reference}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
        cache: 'no-store',
      });

      if (!settled.ok) {
        setError('The simulation could not record your choice. Please try again.');
        return;
      }

      // From here on the provider has a record, so a failure must say so instead of
      // implying nothing happened. The outcome itself is never sent from the browser.
      let verified: Response;

      try {
        verified = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref: reference, token }),
          cache: 'no-store',
        });
      } catch {
        setError(
          'Your choice was recorded, but the payment could not be confirmed yet. Please try again.',
        );
        return;
      }

      if (verified.ok) {
        router.push(`/orders/${token}`);
        return;
      }

      if (verified.status === 409) {
        const body = (await verified.json().catch(() => null)) as VerifyErrorBody | null;

        // The first recorded outcome stays the source of truth: a repeat attempt against a
        // final payment is not an error, it is simply already settled.
        if (body?.error?.code === 'PAYMENT_ALREADY_FINAL') {
          router.push(`/orders/${token}`);
          return;
        }
      }

      if (verified.status === 404) {
        setError(
          'This payment reference does not belong to your order. Open your order link again.',
        );
        return;
      }

      setError(
        'Your choice was recorded, but the payment could not be confirmed yet. Please try again.',
      );
    } catch {
      setError('The simulation is unreachable. Please try again.');
    } finally {
      // Every path above restores the buttons, including redirects.
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {OUTCOMES.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          disabled={busy !== null}
          className="inline-flex min-h-11 items-center justify-center rounded-sm border border-sand-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-ink disabled:opacity-60"
        >
          {busy === option.value ? 'Working…' : option.label}
        </button>
      ))}

      {error === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
