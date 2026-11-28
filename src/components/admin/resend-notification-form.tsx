'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

/**
 * "Resend" trigger for the order-paid notification (FR-A10, AC-T12).
 *
 * Presentational + request state only. Every rule lives on the server: the handler re-checks
 * the admin session, the outbox state, the attempts ceiling, and the claim lease. This
 * component just reports what the API decided, never a raw internal error.
 */
export function ResendNotificationForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'ok' | 'error'>('ok');

  async function onResend() {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/notification/resend`, {
        method: 'POST',
      });
      const body = (await response.json().catch(() => null)) as
        | { status?: string; error?: { code?: string; message?: string } }
        | null;

      const code = body?.error?.code;

      if (response.status === 200) {
        setTone('ok');
        setMessage('Handed to n8n.');
      } else if (response.status === 202) {
        setTone('ok');
        setMessage('Nothing to resend.');
      } else if (response.status === 409 && code === 'NOTIFICATION_IN_FLIGHT') {
        setTone('error');
        setMessage('A delivery is already in progress.');
      } else if (response.status === 409 && code === 'NOTIFICATION_CLAIM_STALE') {
        setTone('error');
        setMessage('The claim expired before it was recorded. Try again.');
      } else if (response.status === 404) {
        setTone('error');
        setMessage('No notification exists for this order.');
      } else if (response.status === 502) {
        setTone('error');
        setMessage('n8n rejected the notification.');
      } else if (response.status === 401 || response.status === 403) {
        setTone('error');
        setMessage('The admin session is not valid. Reload and sign in again.');
      } else {
        setTone('error');
        setMessage('The resend request failed. Try again.');
      }

      router.refresh();
    } catch {
      setTone('error');
      setMessage('The resend request failed: the network is unavailable.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        onClick={onResend}
        loading={pending}
        disabled={pending}
        aria-label="Resend order-paid notification"
      >
        Resend
      </Button>
      {message ? (
        <p
          role="status"
          className={
            tone === 'ok' ? 'max-w-56 text-right text-xs text-ink-muted' : 'max-w-56 text-right text-xs text-danger'
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
