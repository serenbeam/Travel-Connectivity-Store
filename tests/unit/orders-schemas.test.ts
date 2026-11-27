import { describe, expect, it } from 'vitest';

import {
  checkoutRequestSchema,
  idempotencyKeySchema,
  mockSettleRequestSchema,
  orderStatusDtoSchema,
  verifyRequestSchema,
} from '@/modules/orders/schemas';

const valid = {
  destinationSlug: 'japan',
  packageSlug: 'japan-5gb-15d',
  quantity: 1,
  customerName: 'Budi Santoso',
  customerEmail: 'budi@example.com',
  customerPhone: '+628123456789',
};

describe('checkout request', () => {
  it('accepts a valid payload', () => {
    expect(() => checkoutRequestSchema.parse(valid)).not.toThrow();
  });

  it('normalises email to lowercase and trims whitespace', () => {
    const parsed = checkoutRequestSchema.parse({
      ...valid,
      customerName: '  Budi Santoso  ',
      customerEmail: '  Budi@Example.COM ',
    });

    expect(parsed.customerEmail).toBe('budi@example.com');
    expect(parsed.customerName).toBe('Budi Santoso');
  });

  it('requires destinationSlug (E-5 D-2)', () => {
    const withoutDestination = {
      packageSlug: valid.packageSlug,
      quantity: valid.quantity,
      customerName: valid.customerName,
      customerEmail: valid.customerEmail,
      customerPhone: valid.customerPhone,
    };

    expect(() => checkoutRequestSchema.parse(withoutDestination)).toThrow();
  });

  it('rejects a price or status field from the browser (strict)', () => {
    expect(() => checkoutRequestSchema.parse({ ...valid, price: 1 })).toThrow();
    expect(() => checkoutRequestSchema.parse({ ...valid, totalIdr: 1 })).toThrow();
    expect(() => checkoutRequestSchema.parse({ ...valid, status: 'paid' })).toThrow();
  });

  it('enforces quantity 1..5', () => {
    for (const quantity of [0, 6, -1, 1.5]) {
      expect(() => checkoutRequestSchema.parse({ ...valid, quantity }), String(quantity)).toThrow();
    }
    for (const quantity of [1, 5]) {
      expect(checkoutRequestSchema.parse({ ...valid, quantity }).quantity).toBe(quantity);
    }
  });

  it('rejects malformed emails and phones with a field error', () => {
    const email = checkoutRequestSchema.safeParse({ ...valid, customerEmail: 'nope' });
    expect(email.success).toBe(false);

    for (const phone of ['08123456789', '+62', '+62abc123456', '']) {
      expect(() => checkoutRequestSchema.parse({ ...valid, customerPhone: phone }), phone).toThrow();
    }
  });

  it('rejects invalid slugs', () => {
    expect(() => checkoutRequestSchema.parse({ ...valid, destinationSlug: 'Japan' })).toThrow();
    expect(() => checkoutRequestSchema.parse({ ...valid, packageSlug: '' })).toThrow();
  });
});

describe('idempotency key', () => {
  it('accepts 22..64 base64url characters only', () => {
    expect(idempotencyKeySchema.safeParse('a'.repeat(22)).success).toBe(true);
    expect(idempotencyKeySchema.safeParse('A-b_'.repeat(11)).success).toBe(true); // 44 chars
    expect(idempotencyKeySchema.safeParse('a'.repeat(21)).success).toBe(false);
    expect(idempotencyKeySchema.safeParse('a'.repeat(65)).success).toBe(false);
    expect(idempotencyKeySchema.safeParse('has space here 1234567890').success).toBe(false);
  });
});

describe('verify and mock settle requests', () => {
  it('accepts only ref + 43-char token for verify', () => {
    const token = 'A'.repeat(43);

    expect(verifyRequestSchema.safeParse({ ref: 'mock_' + 'a'.repeat(24), token }).success).toBe(
      true,
    );
    expect(
      verifyRequestSchema.safeParse({ ref: 'mock_' + 'a'.repeat(24), token, outcome: 'succeeded' })
        .success,
    ).toBe(false);
  });

  it('accepts the three simulated outcomes only', () => {
    for (const outcome of ['succeeded', 'failed', 'pending']) {
      expect(mockSettleRequestSchema.parse({ outcome }).outcome).toBe(outcome);
    }
    expect(() => mockSettleRequestSchema.parse({ outcome: 'paid' })).toThrow();
    expect(() => mockSettleRequestSchema.parse({})).toThrow();
  });
});

describe('order status DTO', () => {
  it('accepts a complete row projection', () => {
    expect(() =>
      orderStatusDtoSchema.parse({
        orderNumber: 'RML-4KQ9ZT',
        createdAt: '2026-11-28T03:11:02.000Z',
        orderStatus: 'paid',
        paymentStatus: 'succeeded',
        destinationName: 'Japan',
        packageName: 'Japan 5 GB · 15 days',
        packageDataSnapshot: '5 GB · 15 hari',
        quantity: 2,
        unitPriceIdr: 145000,
        totalIdr: 290000,
        customerName: 'Budi Santoso',
        customerEmail: 'b***@example.com',
        paidAt: '2026-11-28T03:12:44.000Z',
        notificationStatus: 'sent',
      }),
    ).not.toThrow();
  });

  it('rejects leaking fields such as the hash or internal ids', () => {
    const base = {
      orderNumber: 'RML-4KQ9ZT',
      createdAt: '2026-11-28T03:11:02.000Z',
      orderStatus: 'pending',
      paymentStatus: 'pending',
      destinationName: 'Japan',
      packageName: 'Japan 5 GB · 15 days',
      packageDataSnapshot: '5 GB · 15 hari',
      quantity: 1,
      unitPriceIdr: 145000,
      totalIdr: 145000,
      customerName: 'Budi Santoso',
      customerEmail: 'b***@example.com',
      paidAt: null,
      notificationStatus: null,
    };

    expect(() => orderStatusDtoSchema.parse({ ...base, access_token_hash: 'a'.repeat(64) })).toThrow();
    expect(() => orderStatusDtoSchema.parse({ ...base, id: 'uuid' })).toThrow();
  });
});
