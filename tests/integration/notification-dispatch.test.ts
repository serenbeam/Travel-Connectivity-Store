import { describe, expect, it, vi } from 'vitest';

import { OUTBOX_MAX_ATTEMPTS, dispatchForOrder, resendForOrder } from '@/modules/automation/dispatch';
import type { N8nSendResult } from '@/modules/automation/n8n.client';

import { serviceClient } from './support/clients';
import { createPaidOrder } from './support/factories';
import { psql, rows, scalar } from './support/psql';

/**
 * Dispatcher + resend against the real database (E-7, AC-T10/T12, FR-N6).
 *
 * The n8n call is injected, so no network and no n8n instance is involved. Everything else
 * is real: `settle_payment` creates the outbox row, `claim_outbox`/`finish_outbox` own the
 * concurrency, and the assertions read the committed rows.
 *
 * The DB-level claim/fencing/sweep behaviour is already covered by `outbox.test.ts` and is
 * deliberately not repeated here.
 */
const OK: N8nSendResult = { ok: true, attempts: 1, httpStatus: 200 };

function okSender(counter: { calls: number }) {
  return async (): Promise<N8nSendResult> => {
    counter.calls += 1;

    return OK;
  };
}

function outboxRow(orderId: string): { status: string; attempts: string; sent: string; lastError: string | null } {
  const [row] = rows(
    `select status, attempts, (sent_at is not null)::text, last_error
       from public.notification_outbox
      where order_id = '${orderId}';`,
  );

  if (!row) {
    throw new Error('outbox row not found');
  }

  return { status: row[0] ?? '', attempts: row[1] ?? '', sent: row[2] ?? '', lastError: row[3] ?? null };
}

function orderState(orderId: string): { status: string; paymentStatus: string } {
  return {
    status: scalar(`select status from public.orders where id = '${orderId}';`),
    paymentStatus: scalar(
      `select status from public.payments where order_id = '${orderId}';`,
    ),
  };
}

describe('settlement → outbox → dispatch', () => {
  it('a successful settlement creates an outbox row that the dispatcher can deliver', async () => {
    const paid = await createPaidOrder();
    const counter = { calls: 0 };

    const outcome = await dispatchForOrder(paid.orderId, { send: okSender(counter) });

    expect(outcome).toMatchObject({ kind: 'sent', notificationId: paid.outboxId, attempts: 1 });
    expect(counter.calls).toBe(1);

    const row = outboxRow(paid.orderId);
    expect(row.status).toBe('sent');
    expect(row.attempts).toBe('1');
    expect(row.sent).toBe('true');

    // AC-T15: the wire event id is the outbox row id.
    expect(paid.outboxId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('two concurrent dispatches produce exactly one delivery attempt', async () => {
    const paid = await createPaidOrder();
    const counter = { calls: 0 };
    const send = okSender(counter);

    const [first, second] = await Promise.all([
      dispatchForOrder(paid.orderId, { send }),
      dispatchForOrder(paid.orderId, { send }),
    ]);

    const kinds = [first.kind, second.kind].sort();

    expect(counter.calls).toBe(1);
    expect(kinds).toEqual(['none', 'sent']);
  });

  it('a failed delivery never changes a paid order', async () => {
    const paid = await createPaidOrder();
    const failing = async (): Promise<N8nSendResult> => ({
      ok: false,
      attempts: 2,
      reason: 'http_5xx',
      httpStatus: 503,
      error: 'n8n_http_503',
    });

    const outcome = await dispatchForOrder(paid.orderId, { send: failing });

    expect(outcome).toMatchObject({ kind: 'failed', error: 'n8n_http_503' });

    const row = outboxRow(paid.orderId);
    expect(row.status).toBe('failed');
    expect(row.lastError).toBe('n8n_http_503');

    const order = orderState(paid.orderId);
    expect(order.status).toBe('paid');
    expect(order.paymentStatus).toBe('succeeded');
  });
});

describe('admin resend guard rails', () => {
  it('skips a notification that was already sent', async () => {
    const paid = await createPaidOrder();

    await dispatchForOrder(paid.orderId, { send: okSender({ calls: 0 }) });

    const send = vi.fn(okSender({ calls: 0 }));
    const outcome = await resendForOrder(paid.orderId, { send });

    expect(outcome).toEqual({ kind: 'skipped', reason: 'already_sent' });
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses while another claim holds its lease', async () => {
    const paid = await createPaidOrder();
    const service = serviceClient();
    const { error } = await service.rpc('claim_outbox', { p_order_id: paid.orderId });

    expect(error).toBeNull();

    const send = vi.fn(okSender({ calls: 0 }));
    const outcome = await resendForOrder(paid.orderId, { send });

    expect(outcome).toEqual({ kind: 'in_flight' });
    expect(send).not.toHaveBeenCalled();

    // Release the probe claim so the row is not left processing for later runs.
    const [lockedAt] = rows(
      `select locked_at from public.notification_outbox where order_id = '${paid.orderId}';`,
    ).map((row) => row[0]);

    await service.rpc('finish_outbox', {
      p_id: paid.outboxId,
      p_locked_at: lockedAt,
      p_ok: false,
      p_error: 'probe_release',
    });
  });

  it('refuses at the attempts ceiling and leaves the order paid', async () => {
    const paid = await createPaidOrder();
    const service = serviceClient();

    for (let attempt = 1; attempt <= OUTBOX_MAX_ATTEMPTS; attempt += 1) {
      const { data } = await service.rpc('claim_outbox', { p_order_id: paid.orderId });
      const claimed = data as { outcome: string; locked_at?: string };

      expect(claimed.outcome).toBe('claimed');

      await service.rpc('finish_outbox', {
        p_id: paid.outboxId,
        p_locked_at: claimed.locked_at,
        p_ok: false,
        p_error: 'probe_attempt',
      });
    }

    const row = outboxRow(paid.orderId);
    expect(row.attempts).toBe(String(OUTBOX_MAX_ATTEMPTS));

    const send = vi.fn(okSender({ calls: 0 }));
    expect(await resendForOrder(paid.orderId, { send })).toEqual({
      kind: 'skipped',
      reason: 'max_attempts',
    });
    expect(await dispatchForOrder(paid.orderId, { send })).toEqual({ kind: 'none' });
    expect(send).not.toHaveBeenCalled();
    expect(orderState(paid.orderId).status).toBe('paid');
  });
});

describe('invalid payload after claim', () => {
  it('is finished as failed instead of being left in processing', async () => {
    const paid = await createPaidOrder();

    // The payload CHECK only requires the keys to exist, so a wrong value type is a
    // realistic "bad data" case that only the Zod validator catches.
    psql(`
      update public.notification_outbox
         set payload = jsonb_set(payload, '{totalIdr}', '"not-a-number"'::jsonb)
       where order_id = '${paid.orderId}';
    `);

    const send = vi.fn(okSender({ calls: 0 }));
    const outcome = await dispatchForOrder(paid.orderId, { send });

    expect(outcome).toMatchObject({ kind: 'failed', error: 'invalid_payload' });
    expect(send).not.toHaveBeenCalled();

    const row = outboxRow(paid.orderId);
    expect(row.status).toBe('failed');
    expect(row.lastError).toBe('invalid_payload');
    expect(row.attempts).toBe('1');
    expect(orderState(paid.orderId).status).toBe('paid');
  });
});
