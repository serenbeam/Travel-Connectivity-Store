import { describe, expect, it } from 'vitest';

import { serviceClient } from './support/clients';
import {
  buildCheckout,
  callCreateOrder,
  callSettle,
  rows,
  type CreateOrderResult,
} from './support/factories';
import { at } from './support/psql';

const service = serviceClient();

interface OrderState {
  status: string;
  paidAt: string | null;
}

function orderState(orderNumber: string): OrderState {
  const [row] = rows(
    `select status, coalesce(paid_at::text, '') from public.orders where order_number = '${orderNumber}';`,
  );
  return { status: at(row, 0), paidAt: at(row, 1) === '' ? null : at(row, 1) };
}

function paymentState(providerReference: string): {
  status: string;
  paidAt: string | null;
  failureCode: string | null;
} {
  const [row] = rows(
    `select status, coalesce(paid_at::text, ''), coalesce(failure_code, '')
       from public.payments where provider_reference = '${providerReference}';`,
  );
  return {
    status: at(row, 0),
    paidAt: at(row, 1) === '' ? null : at(row, 1),
    failureCode: at(row, 2) === '' ? null : at(row, 2),
  };
}

function outboxRows(orderNumber: string): string[][] {
  return rows(
    `select n.id::text, n.payload::text, n.status
       from public.notification_outbox n
       join public.orders o on o.id = n.order_id
      where o.order_number = '${orderNumber}';`,
  );
}

async function newOrder(): Promise<CreateOrderResult & { orderNumber: string }> {
  const request = await buildCheckout({ packageSlug: 'japan-5gb-15d' });
  const created = await callCreateOrder(request);
  return { ...created, orderNumber: request.orderNumber, payment_ref: request.providerReference };
}

/**
 * Payment settlement: the state machine that `settle_payment` owns.
 *
 * The route-level mapping (409 PAYMENT_ALREADY_FINAL, the adapter's `pending` branch,
 * MOCK_GATEWAY_ENABLED) belongs to E-5 and is not asserted here.
 */
describe('payment settlement', () => {
  it('AC-P1: succeeded sets both statuses and exactly one outbox row', async () => {
    const order = await newOrder();
    const result = await callSettle(order.payment_ref!, 'succeeded');

    expect(result.outcome).toBe('applied');
    expect(result.order_status).toBe('paid');
    expect(result.payment_status).toBe('succeeded');

    const orderAfter = orderState(order.orderNumber);
    expect(orderAfter.status).toBe('paid');
    expect(orderAfter.paidAt).not.toBeNull();

    const paymentAfter = paymentState(order.payment_ref!);
    expect(paymentAfter.status).toBe('succeeded');
    expect(paymentAfter.paidAt).toBe(orderAfter.paidAt);
    expect(paymentAfter.failureCode).toBeNull();

    const outbox = outboxRows(order.orderNumber);
    expect(outbox).toHaveLength(1);
  });

  it('AC-P2: failed sets both statuses and creates no outbox row', async () => {
    const order = await newOrder();
    const result = await callSettle(order.payment_ref!, 'failed');

    expect(result.outcome).toBe('applied');
    expect(result.order_status).toBe('failed');
    expect(result.payment_status).toBe('failed');

    const orderAfter = orderState(order.orderNumber);
    expect(orderAfter.status).toBe('failed');
    expect(orderAfter.paidAt).toBeNull();

    const paymentAfter = paymentState(order.payment_ref!);
    expect(paymentAfter.status).toBe('failed');
    expect(paymentAfter.failureCode).toBe('GATEWAY_DECLINED');
    expect(paymentAfter.paidAt).toBeNull();

    expect(outboxRows(order.orderNumber)).toHaveLength(0);
  });

  it('AC-P3: a pending gateway result is refused and changes nothing', async () => {
    const order = await newOrder();

    const { error } = await service.rpc('settle_payment', {
      p_provider_reference: order.payment_ref!,
      p_outcome: 'pending',
    });

    expect(error?.code).toBe('22000');
    expect(orderState(order.orderNumber).status).toBe('pending');
    expect(paymentState(order.payment_ref!).status).toBe('pending');
    expect(outboxRows(order.orderNumber)).toHaveLength(0);

    // A later terminal result still applies (the row was left pending).
    const applied = await callSettle(order.payment_ref!, 'succeeded');
    expect(applied.outcome).toBe('applied');
  });

  it('AC-P4: a second settlement is a no-op', async () => {
    const order = await newOrder();
    await callSettle(order.payment_ref!, 'succeeded');

    const before = {
      order: orderState(order.orderNumber),
      payment: paymentState(order.payment_ref!),
      outbox: outboxRows(order.orderNumber),
    };

    const second = await callSettle(order.payment_ref!, 'succeeded');
    expect(second.outcome).toBe('unchanged');
    expect(second.order_status).toBe('paid');
    expect(second.payment_status).toBe('succeeded');

    // Crossing the terminal boundary is also refused rather than applied.
    const conflicting = await callSettle(order.payment_ref!, 'failed');
    expect(conflicting.outcome).toBe('unchanged');

    expect({
      order: orderState(order.orderNumber),
      payment: paymentState(order.payment_ref!),
      outbox: outboxRows(order.orderNumber),
    }).toEqual(before);
  });

  it('rejects malformed settle arguments', async () => {
    const order = await newOrder();

    for (const outcome of ['PAID', 'succeeded ', '']) {
      const { error } = await service.rpc('settle_payment', {
        p_provider_reference: order.payment_ref!,
        p_outcome: outcome,
      });
      expect(error?.code).toBe('22000');
    }

    const { error: refError } = await service.rpc('settle_payment', {
      p_provider_reference: 'short',
      p_outcome: 'succeeded',
    });
    expect(refError?.code).toBe('22000');

    expect(await callSettle(order.payment_ref!, 'succeeded')).toMatchObject({ outcome: 'applied' });
  });

  it('returns not_found for an unknown reference', async () => {
    const result = await callSettle(`mock_${'f'.repeat(24)}`, 'succeeded');
    expect(result.outcome).toBe('not_found');
  });

  it('AC-T15: notificationId equals the outbox row id and survives a dispatch cycle', async () => {
    const order = await newOrder();
    await callSettle(order.payment_ref!, 'succeeded');

    const [row] = outboxRows(order.orderNumber);
    if (!row) {
      throw new Error(`No outbox row for ${order.orderNumber}`);
    }
    const outboxId = at(row, 0);
    const payload = JSON.parse(at(row, 1)) as Record<string, unknown>;

    expect(payload.notificationId).toBe(outboxId);
    expect(payload.orderNumber).toBe(order.orderNumber);
    expect(payload.totalIdr).toBe(order.total_idr);

    // Stable across a claim/finish cycle (the receiver deduplicates on this value).
    const claimed = await service.rpc('claim_outbox', { p_order_id: order.order_id });
    expect(claimed.data).toMatchObject({ outcome: 'claimed', id: outboxId });

    await service.rpc('finish_outbox', {
      p_id: outboxId,
      p_locked_at: String((claimed.data as { locked_at: string }).locked_at),
      p_ok: true,
    });

    const [after] = outboxRows(order.orderNumber);
    expect(JSON.parse(at(after, 1)).notificationId).toBe(outboxId);
  });

  it('AC-T16: one outbox row per order and no capability material in the payload', async () => {
    const order = await newOrder();
    await callSettle(order.payment_ref!, 'succeeded');

    const outbox = outboxRows(order.orderNumber);
    expect(outbox).toHaveLength(1);

    const payloadText = at(outbox[0], 1);

    for (const key of [
      'notificationId',
      'orderNumber',
      'totalIdr',
      'customerName',
      'customerEmail',
      'paidAt',
      'destinationName',
      'packageName',
      'packageDataSnapshot',
    ]) {
      expect(Object.keys(JSON.parse(payloadText))).toContain(key);
    }

    expect(payloadText).not.toContain('/orders/');
    expect(payloadText).not.toContain('token');
    expect(payloadText).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });
});
