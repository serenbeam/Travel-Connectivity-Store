import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createPaidOrder, createPendingOrder } from '../support/factories';
import { psql, rows, scalar, sqlError, sqlState, at } from '../support/psql';

/**
 * Constraint and invariant probes that need a privileged connection.
 *
 * These run as the database owner through `docker exec psql`, because `service_role`
 * deliberately has no INSERT/UPDATE/DELETE grant on the transactional tables — a
 * negative test through that role would only prove the grant is missing, not that the
 * constraint holds (docs/database-design.md §2.8).
 */

const DESTINATION = `(select id from public.destinations where slug = 'japan')`;
const PACKAGE = `(select id from public.packages where slug = 'japan-3gb-7d')`;

function nextOrderNumber(): string {
  // Must satisfy orders_number_format_chk: 'RML-' + exactly six [A-Z0-9] characters.
  // Random per run so repeated suite runs do not collide on the unique index.
  return `RML-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Random 64-hex hash: unique across runs, so tests do not depend on a clean database. */
function randomHash(): string {
  return randomBytes(32).toString('hex');
}

function insertOrder(overrides: { orderNumber?: string; tokenHash?: string } = {}): string {
  const orderNumber = overrides.orderNumber ?? nextOrderNumber();
  const tokenHash = overrides.tokenHash ?? randomHash();

  return `insert into public.orders (
      order_number, access_token_hash, destination_id, package_id,
      destination_name_snapshot, package_name_snapshot, package_data_snapshot,
      customer_name, customer_email, customer_phone,
      quantity, unit_price_idr, total_idr, status
    ) values (
      '${orderNumber}', '${tokenHash}', ${DESTINATION}, ${PACKAGE},
      'Japan', 'Japan 3 GB · 7 days', '3 GB · 7 hari',
      'Constraint Probe', 'probe@example.com', '+628111111111',
      1, 89000, 89000, 'pending'
    );`;
}

describe('AC-T5 — capability token at rest', () => {
  it('T5.1 stores no plaintext token column', () => {
    const columns = rows(`
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'orders'
       order by ordinal_position;`).map(([name]) => name);

    expect(columns).toEqual([
      'id',
      'order_number',
      'access_token_hash',
      'destination_id',
      'package_id',
      'destination_name_snapshot',
      'package_name_snapshot',
      'package_data_snapshot',
      'customer_name',
      'customer_email',
      'customer_phone',
      'quantity',
      'unit_price_idr',
      'total_idr',
      'status',
      'paid_at',
      'created_at',
      'updated_at',
    ]);

    for (const forbidden of ['token', 'access_token', 'capability_token', 'plain_token']) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it('T5.2 rejects any hash that is not 64 lowercase hex characters', () => {
    const invalid = [
      'e'.repeat(63),
      'e'.repeat(65),
      'E'.repeat(64), // uppercase is not hex-as-stored
      'g'.repeat(64), // not a hex digit
    ];

    for (const tokenHash of invalid) {
      const label = `${tokenHash.slice(0, 4)}… length ${tokenHash.length}`;
      expect(sqlState(insertOrder({ tokenHash })), label).toBe('23514');
      // Name the constraint explicitly: an unrelated CHECK must not satisfy this test.
      expect(sqlError(insertOrder({ tokenHash })), label).toContain('orders_token_hash_chk');
    }

    expect(sqlState(insertOrder({ tokenHash: randomHash() }))).toBe('no_error');
  });

  it('T5.3 requires the hash (NOT NULL)', () => {
    const statement = `insert into public.orders (
        order_number, access_token_hash, destination_id, package_id,
        destination_name_snapshot, package_name_snapshot, package_data_snapshot,
        customer_name, customer_email, customer_phone,
        quantity, unit_price_idr, total_idr, status
      ) values (
        '${nextOrderNumber()}', null, ${DESTINATION}, ${PACKAGE},
        'Japan', 'Japan 3 GB · 7 days', '3 GB · 7 hari',
        'Constraint Probe', 'probe@example.com', '+628111111111',
        1, 89000, 89000, 'pending'
      );`;

    expect(sqlState(statement)).toBe('23502');
  });

  it('T5.4 enforces uniqueness of the hash', () => {
    const tokenHash = randomHash();

    expect(sqlState(insertOrder({ tokenHash }))).toBe('no_error');
    expect(sqlState(insertOrder({ tokenHash }))).toBe('23505');
    expect(sqlError(insertOrder({ tokenHash }))).toContain('access_token_hash');
  });

  it('T5.5 keeps no usable token in idempotency storage', async () => {
    const paid = await createPaidOrder({ packageSlug: 'japan-3gb-7d' });

    const [row] = rows(
      `select response_body::text, response_token_sealed,
              response_status::text, order_id::text
         from public.idempotency_keys where order_id = '${paid.orderId}';`,
    );

    const body = JSON.parse(at(row, 0)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['order_number', 'payment_ref', 'total_idr']);
    expect(at(row, 1)).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(at(row, 2)).toBe('201');
    expect(at(row, 3)).toBe(paid.orderId);

    // The sealed blob must not be a working capability token either.
    expect(at(row, 1)).not.toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(at(row, 0)).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });
});

describe('invariants — I1, I2, I4, I5, I6, I7', () => {
  it('I1 rejects a payment whose amount differs from the order total', () => {
    const orderId = scalar(
      `select id from public.orders where status = 'pending' order by created_at desc limit 1;`,
    );

    expect(
      sqlState(`insert into public.payments (order_id, provider_reference, amount_idr, status)
                values ('${orderId}', 'mock_${'a'.repeat(24)}', 1, 'pending');`),
    ).toBe('22000');
  });

  it('I2 rejects payment succeeded while the order is still pending (deferred)', async () => {
    const pending = await createPendingOrder({ packageSlug: 'japan-3gb-7d' });

    expect(
      sqlState(`update public.payments set status = 'succeeded', paid_at = now()
                 where provider_reference = '${pending.paymentRef}';`),
    ).toBe('22000');
  });

  it('I4 couples failure_code to the failed status only', () => {
    const orderId = scalar(
      `select id from public.orders where status = 'pending' order by created_at desc limit 1;`,
    );

    // failed without a failure_code
    expect(
      sqlState(`insert into public.payments (order_id, provider_reference, amount_idr, status)
                values ('${orderId}', 'mock_${'b'.repeat(24)}', 89000, 'failed');`),
    ).toBe('23514');
  });

  it('I5 refuses an outbox row for an unpaid order', async () => {
    const pending = await createPendingOrder({ packageSlug: 'japan-3gb-7d' });

    expect(
      sqlState(`insert into public.notification_outbox (order_id, payload)
                values ('${pending.orderId}', '{"notificationId":"x","orderNumber":"RML-XXXXXX",
                  "totalIdr":1,"customerName":"a","customerEmail":"a@b.c","paidAt":"2026-01-01",
                  "destinationName":"d","packageName":"p","packageDataSnapshot":"s"}'::jsonb);`),
    ).toBe('22000');
  });

  it('I6 refuses any update to a terminal order', async () => {
    const paid = await createPaidOrder({ packageSlug: 'japan-3gb-7d' });

    expect(
      sqlState(`update public.orders set customer_name = 'Rewritten'
                 where id = '${paid.orderId}';`),
    ).toBe('22000');
  });

  it('I6 refuses any update to a terminal payment', async () => {
    const paid = await createPaidOrder({ packageSlug: 'japan-3gb-7d' });

    expect(
      sqlState(`update public.payments set amount_idr = 1
                 where provider_reference = '${paid.paymentRef}';`),
    ).toBe('22000');
  });

  it('I7 / AC-P5 rejects a second payment for one order', async () => {
    const paid = await createPaidOrder({ packageSlug: 'japan-3gb-7d' });

    expect(
      sqlState(`insert into public.payments (order_id, provider_reference, amount_idr, status)
                values ('${paid.orderId}', 'mock_${'c'.repeat(24)}', ${paid.totalIdr}, 'pending');`),
    ).toBe('23505');
  });

  it('I5 permits exactly one outbox row per paid order', async () => {
    const paid = await createPaidOrder({ packageSlug: 'japan-3gb-7d' });

    expect(
      sqlState(`insert into public.notification_outbox (order_id, payload)
                values ('${paid.orderId}', '{"notificationId":"x","orderNumber":"RML-XXXXXX",
                  "totalIdr":1,"customerName":"a","customerEmail":"a@b.c","paidAt":"2026-01-01",
                  "destinationName":"d","packageName":"p","packageDataSnapshot":"s"}'::jsonb);`),
    ).toBe('23505');
  });
});

describe('catalog and quantity constraints', () => {
  it('rejects quantity outside 1..5', () => {
    for (const quantity of [0, 6]) {
      expect(
        sqlState(`insert into public.orders (
            order_number, access_token_hash, destination_id, package_id,
            destination_name_snapshot, package_name_snapshot, package_data_snapshot,
            customer_name, customer_email, customer_phone,
            quantity, unit_price_idr, total_idr, status
          ) values (
            '${nextOrderNumber()}', '${'f'.repeat(64)}', ${DESTINATION}, ${PACKAGE},
            'Japan', 'P', 'S', 'Probe', 'probe@example.com', '+628111111111',
            ${quantity}, 89000, 89000, 'pending'
          );`),
      ).toBe('23514');
    }
  });

  it('rejects a metered package with no data_mb', () => {
    expect(
      sqlState(`insert into public.packages (destination_id, slug, name, data_mb, is_unlimited, validity_days, price_idr)
                values (${DESTINATION}, 'probe-null-data', 'Probe', null, false, 7, 1000);`),
    ).toBe('23514');
  });

  it('rejects a compare-at price that is not above the real price', () => {
    expect(
      sqlState(`insert into public.packages (destination_id, slug, name, data_mb, is_unlimited, validity_days, price_idr, compare_at_price_idr)
                values (${DESTINATION}, 'probe-compare', 'Probe', 1024, false, 7, 5000, 5000);`),
    ).toBe('23514');
  });

  it('keeps updated_at maintained by the single BEFORE UPDATE trigger', () => {
    psql(`insert into public.packages (destination_id, slug, name, data_mb, is_unlimited, validity_days, price_idr)
          values (${DESTINATION}, 'probe-touch', 'Probe', 1024, false, 7, 5000);`);

    try {
      const before = scalar(
        `select updated_at::text from public.packages where slug = 'probe-touch';`,
      );

      psql(`update public.packages set name = 'Probe renamed' where slug = 'probe-touch';`);

      const after = scalar(
        `select updated_at::text from public.packages where slug = 'probe-touch';`,
      );

      expect(after).not.toBe(before);
    } finally {
      psql(`delete from public.packages where slug = 'probe-touch';`);
    }
  });
});
