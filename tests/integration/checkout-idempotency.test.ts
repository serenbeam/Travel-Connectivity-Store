import { describe, expect, it } from 'vitest';

import { adminSession } from './support/auth';
import { serviceClient } from './support/clients';
import {
  backdateIdempotencyKey,
  buildCheckoutWithKey,
  buildCheckout,
  callCreateOrder,
  countOrdersForOrderNumber,
  countPaymentsForOrder,
  newIdempotencyKey,
  orderIdByOrderNumber,
  packagePriceBySlug,
  paymentCountByReference,
  requestHashOf,
  rows,
  type CreateOrderResult,
} from './support/factories';
import { at, scalar } from './support/psql';

const service = serviceClient();

function countByOutcome(results: CreateOrderResult[], outcome: string): number {
  return results.filter((result) => result.outcome === outcome).length;
}

/**
 * AC-T8 / AC-T9 / AC-T6 / AC-T7 plus the database half of AC-C2, C3, C4, C6.
 *
 * The HTTP status envelope (201 vs 200, 409s, 422s) belongs to E-5; this suite pins
 * the RPC contract those routes must translate.
 */
describe('checkout idempotency', () => {
  it('AC-T8: ten concurrent requests with one key produce exactly one order', async () => {
    const key = newIdempotencyKey();
    const input = { packageSlug: 'japan-5gb-15d', quantity: 1 };
    const hash = requestHashOf(input);

    // Each racer generates its own creation fields, exactly as E-5 will; only the
    // winner's values may survive, and every loser must replay the winner's result.
    const racers = await Promise.all(
      Array.from({ length: 10 }, () => buildCheckoutWithKey(key, input)),
    );

    expect(racers.every((racer) => racer.requestHash === hash)).toBe(true);
    expect(new Set(racers.map((racer) => racer.orderNumber)).size).toBe(10);

    const results = await Promise.all(racers.map((racer) => callCreateOrder(racer)));

    expect(countByOutcome(results, 'created')).toBe(1);
    expect(countByOutcome(results, 'replay')).toBe(9);
    expect(countByOutcome(results, 'conflict')).toBe(0);
    expect(countByOutcome(results, 'expired')).toBe(0);

    const winnerIndex = results.findIndex((result) => result.outcome === 'created');
    const winner = racers[winnerIndex];
    const winnerResult = results[winnerIndex];

    if (!winner || !winnerResult) {
      throw new Error('AC-T8 invariant failed: no racer produced a "created" outcome.');
    }

    // One order, one payment.
    expect(await countOrdersForOrderNumber(winner.orderNumber)).toBe(1);
    expect(await countPaymentsForOrder(winnerResult.order_id!)).toBe(1);

    // Every response agrees on the commercial facts of the winner.
    for (const result of results) {
      expect(result.order_number).toBe(winner.orderNumber);
      expect(result.payment_ref).toBe(winner.providerReference);
      expect(result.total_idr).toBe(winnerResult.total_idr);
    }

    // Replays hand back the winner's sealed token, never a racer's own value.
    for (const [index, result] of results.entries()) {
      const ownSealed = racers[index]?.sealed;

      if (result.outcome === 'replay') {
        expect(result.sealed_token).toBe(winner.sealed);
        expect(ownSealed).not.toBe(winner.sealed);
      }
    }

    // Exactly one idempotency row, pointing at the one order.
    expect(Number(scalar(`select count(*) from public.idempotency_keys where scope = 'checkout' and key = '${key}';`))).toBe(1);
    expect(
      scalar(`select coalesce(max(order_id::text), '') from public.idempotency_keys where scope = 'checkout' and key = '${key}';`),
    ).toBe(winnerResult.order_id);
  });

  it('AC-T6: replay returns the identical sealed token and response body', async () => {
    const request = await buildCheckout({ packageSlug: 'malaysia-3gb-7d' });

    const first = await callCreateOrder(request);
    const second = await callCreateOrder(request);

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('replay');
    expect(second.order_number).toBe(first.order_number);
    expect(second.payment_ref).toBe(first.payment_ref);
    expect(second.total_idr).toBe(first.total_idr);
    expect(second.sealed_token).toBe(request.sealed);

    const [body] = rows(
      `select response_body::text from public.idempotency_keys
        where scope = 'checkout' and key = '${request.key}';`,
    );
    const parsed = JSON.parse(at(body, 0)) as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual(['order_number', 'payment_ref', 'total_idr']);
    expect(JSON.stringify(parsed)).not.toContain(request.token);
  });

  it('AC-T9: a different payload on the same key conflicts and creates nothing', async () => {
    const key = newIdempotencyKey();
    const primary = await buildCheckoutWithKey(key, { quantity: 1 });

    const first = await callCreateOrder(primary);
    expect(first.outcome).toBe('created');

    const ordersBefore = await countOrdersForOrderNumber(primary.orderNumber);
    const paymentsBefore = await paymentCountByReference(primary.providerReference);

    // Same key, genuinely different normalized payload -> different request hash.
    const divergent = await buildCheckoutWithKey(key, { quantity: 2 });
    expect(divergent.requestHash).not.toBe(primary.requestHash);

    const second = await callCreateOrder(divergent);
    expect(second.outcome).toBe('conflict');
    expect(second.order_number).toBeUndefined();

    expect(await countOrdersForOrderNumber(primary.orderNumber)).toBe(ordersBefore);
    expect(await paymentCountByReference(primary.providerReference)).toBe(paymentsBefore);
    expect(await countOrdersForOrderNumber(divergent.orderNumber)).toBe(0);

    // The stored row still describes the original order and is untouched.
    const [stored] = rows(
      `select order_id::text, response_body::text from public.idempotency_keys
        where scope = 'checkout' and key = '${key}';`,
    );
    expect(at(stored, 0)).toBe(orderIdByOrderNumber(primary.orderNumber));
    expect((JSON.parse(at(stored, 1)) as { order_number: string }).order_number).toBe(
      primary.orderNumber,
    );
  });

  it('AC-T9 (boundary): same key and hash replays even with different creation fields', async () => {
    const key = newIdempotencyKey();
    const first = await buildCheckoutWithKey(key, { quantity: 1 });
    const created = await callCreateOrder(first);

    // Replay is decided by key + request_hash only (0005 step 2), so fresh creation
    // fields must not turn a legitimate retry into a conflict or a new order.
    const retry = await buildCheckoutWithKey(key, { quantity: 1 });
    const replayed = await callCreateOrder(retry);

    expect(replayed.outcome).toBe('replay');
    expect(replayed.order_number).toBe(created.order_number);
    expect(replayed.sealed_token).toBe(first.sealed);
    expect(await countOrdersForOrderNumber(retry.orderNumber)).toBe(0);
  });

  it('AC-T7: replay after the 24 h window expires and creates nothing', async () => {
    const request = await buildCheckout({ packageSlug: 'singapore-1gb-7d' });
    const created = await callCreateOrder(request);

    expect(created.outcome).toBe('created');

    backdateIdempotencyKey(request.key, 25);

    const replay = await callCreateOrder(request);
    expect(replay.outcome).toBe('expired');
    expect(replay.order_number).toBeUndefined();

    expect(await countOrdersForOrderNumber(request.orderNumber)).toBe(1);
    expect(await paymentCountByReference(request.providerReference)).toBe(1);
  });

  it('AC-C2: total is price_idr x quantity and never comes from the caller', async () => {
    const price = await packagePriceBySlug('thailand-10gb-15d');
    const request = await buildCheckout({ packageSlug: 'thailand-10gb-15d', quantity: 2 });
    const result = await callCreateOrder(request);

    expect(result.outcome).toBe('created');
    expect(result.total_idr).toBe(price * 2);

    const [order] = rows(
      `select unit_price_idr, total_idr, quantity from public.orders
        where order_number = '${request.orderNumber}';`,
    );
    expect(Number(at(order, 0))).toBe(price);
    expect(Number(at(order, 1))).toBe(price * 2);
    expect(Number(at(order, 2))).toBe(2);
  });

  it('AC-C3: snapshots freeze after the catalog changes', async () => {
    const admin = await adminSession();
    const originalPrice = await packagePriceBySlug('switzerland-2gb-7d');
    const request = await buildCheckout({ packageSlug: 'switzerland-2gb-7d' });
    await callCreateOrder(request);

    const [before] = rows(
      `select destination_name_snapshot, package_name_snapshot, package_data_snapshot
         from public.orders where order_number = '${request.orderNumber}';`,
    );
    expect(at(before, 2)).toBe('2 GB · 7 hari');

    const { error: updateError } = await admin
      .from('packages')
      .update({ name: 'Renamed after checkout', price_idr: 1 })
      .eq('slug', 'switzerland-2gb-7d');
    expect(updateError).toBeNull();

    const [after] = rows(
      `select destination_name_snapshot, package_name_snapshot, package_data_snapshot,
              unit_price_idr, total_idr
         from public.orders where order_number = '${request.orderNumber}';`,
    );
    expect([at(after, 0), at(after, 1), at(after, 2)]).toEqual([
      at(before, 0),
      at(before, 1),
      at(before, 2),
    ]);
    expect(Number(at(after, 3))).toBe(originalPrice);

    await admin
      .from('packages')
      .update({ name: 'Switzerland 2 GB · 7 days', price_idr: originalPrice })
      .eq('slug', 'switzerland-2gb-7d');
  });

  it('AC-C4: quantity outside 1..5 is rejected by the RPC', async () => {
    for (const quantity of [0, 6]) {
      const request = await buildCheckout({ quantity });
      await expect(callCreateOrder(request)).rejects.toThrow(/INVALID_QUANTITY/);
      expect(await countOrdersForOrderNumber(request.orderNumber)).toBe(0);
    }
  });

  it('AC-C6: an inactive package creates no order', async () => {
    const admin = await adminSession();
    const request = await buildCheckout({ packageSlug: 'malaysia-12gb-30d' });

    await admin.from('packages').update({ is_active: false }).eq('slug', 'malaysia-12gb-30d');

    try {
      await expect(callCreateOrder(request)).rejects.toThrow(/PACKAGE_INACTIVE/);
      expect(await countOrdersForOrderNumber(request.orderNumber)).toBe(0);
      expect(await paymentCountByReference(request.providerReference)).toBe(0);
    } finally {
      await admin.from('packages').update({ is_active: true }).eq('slug', 'malaysia-12gb-30d');
    }
  });

  it('AC-C6: an unknown package id creates no order', async () => {
    const request = await buildCheckout();
    request.order.package_id = '00000000-0000-4000-8000-000000000000';

    await expect(callCreateOrder(request)).rejects.toThrow(/PACKAGE_INACTIVE/);
    expect(await countOrdersForOrderNumber(request.orderNumber)).toBe(0);
  });

  it('rejects malformed input before writing anything', async () => {
    const request = await buildCheckout();

    await expect(
      service.rpc('create_order_idempotent', {
        p_key: 'short',
        p_request_hash: request.requestHash,
        p_order: request.order,
      }),
    ).resolves.toMatchObject({ error: { code: '22000' } });

    await expect(
      service.rpc('create_order_idempotent', {
        p_key: request.key,
        p_request_hash: 'not-a-hash',
        p_order: request.order,
      }),
    ).resolves.toMatchObject({ error: { code: '22000' } });
  });
});
