'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Simulated PSP controls (design §6, api-contract §4.6).
 *
 * The buttons only choose an outcome; they never claim the order was paid. After the
 * provider records the choice, the customer is sent to the order page, which asks the
 * server to verify — that is where state actually changes.
 */

const OUTCOMES = [
  { value: 'succeeded', label: 'Simulate success' },
  { value: 'failed', label: 'Simulate failure' },
  { value: 'pending', label: 'Leave pending' },
] as const;

export function MockGatewayControls({ reference, token }: { reference: string; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(outcome: string) {
    setBusy(outcome);
    setError(null);

    try {
      const response = await fetch(`/api/mock-gateway/${reference}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
        cache: 'no-store',
      });

      if (!response.ok) {
        setError('The simulation could not record your choice. Please try again.');
        setBusy(null);
        return;
      }

      router.push(`/orders/${token}?ref=${reference}`);
    } catch {
      setError('The simulation is unreachable. Please try again.');
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
