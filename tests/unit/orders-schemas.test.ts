import { describe, expect, it } from 'vitest';

import {
  checkoutFieldErrors,
  checkoutRequestSchema,
  customerEmailSchema,
  customerNameSchema,
  customerPhoneSchema,
  idempotencyKeySchema,
  mockSettleRequestSchema,
  orderStatusDtoSchema,
  quantitySchema,
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

const NAME_RANGE = 'Please enter your full name (2–100 characters).';
const NAME_CHARSET = 'Only letters, spaces, periods, apostrophes, and hyphens are allowed.';
const EMAIL = 'Please enter a valid email address.';
const PHONE_REQUIRED = 'Please enter your phone number.';
const PHONE_PREFIX = 'Please enter a valid international phone number starting with +.';
const PHONE_CHARSET =
  'Phone number can only contain digits after the + sign (no spaces, hyphens, brackets, or letters).';
const PHONE_MIN = 'Phone number must contain at least 8 digits, including the country code.';
const PHONE_MAX = 'Phone number cannot exceed 15 digits.';
const QUANTITY_TYPE = 'Please enter a valid quantity.';
const QUANTITY_RANGE = 'Quantity must be between 1 and 5.';

/** Zod's raw wording must never reach a customer. */
const RAW_ZOD = /Too small|Too big|Invalid input|Invalid string|must match pattern|expected string|expected number|expected int|received number|received string/i;

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return result.error?.issues[0]?.message ?? '';
}

describe('checkout request — payload shape', () => {
  it('accepts a valid payload', () => {
    expect(() => checkoutRequestSchema.parse(valid)).not.toThrow();
  });

  it('normalises name and email', () => {
    const parsed = checkoutRequestSchema.parse({
      ...valid,
      customerName: '  Budi Santoso  ',
      customerEmail: '  Budi@Example.COM ',
    });

    expect(parsed.customerName).toBe('Budi Santoso');
    expect(parsed.customerEmail).toBe('budi@example.com');
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

  it('rejects invalid slugs', () => {
    expect(() => checkoutRequestSchema.parse({ ...valid, destinationSlug: 'Japan' })).toThrow();
    expect(() => checkoutRequestSchema.parse({ ...valid, packageSlug: '' })).toThrow();
  });
});

describe('customer name', () => {
  it('accepts 2 and 100 characters', () => {
    expect(customerNameSchema.safeParse('Jo').success).toBe(true);
    expect(customerNameSchema.safeParse('A'.repeat(100)).success).toBe(true);
  });

  it('rejects 1 and 101 characters with one friendly range message', () => {
    expect(firstMessage(customerNameSchema.safeParse('A'))).toBe(NAME_RANGE);
    expect(firstMessage(customerNameSchema.safeParse('A'.repeat(101)))).toBe(NAME_RANGE);
  });

  it('reports the length rule before the charset rule for a very short value', () => {
    // "1" is both too short and the wrong charset; the customer sees the actionable one.
    expect(firstMessage(customerNameSchema.safeParse('1'))).toBe(NAME_RANGE);
  });

  it('rejects empty and whitespace-only values', () => {
    expect(firstMessage(customerNameSchema.safeParse(''))).toBe(NAME_RANGE);
    expect(firstMessage(customerNameSchema.safeParse('   '))).toBe(NAME_RANGE);
  });

  it('allows Unicode letters, marks, spaces, periods, both apostrophes, and hyphens', () => {
    for (const name of [
      'José Álvarez',
      'Łukasz Żółć',
      'Nurul Aini O’Brien', // typographic apostrophe (D-2)
      "Nurul Aini O'Brien", // ASCII apostrophe
      'Jean-Luc Picard',
      'St. John Smith',
      'محمد عبدالله',
    ]) {
      expect(customerNameSchema.safeParse(name), name).toMatchObject({ success: true });
    }
  });

  it('rejects digits, emoji, and other symbols', () => {
    for (const name of ['Budi 2', '12345', 'Budi 🙂', 'Budi @#$', 'Budi_Santoso', 'Budi/Santoso']) {
      const result = customerNameSchema.safeParse(name);
      expect(result.success, name).toBe(false);
      expect(firstMessage(result)).toBe(NAME_CHARSET);
    }
  });

  it('trims before validating', () => {
    expect(customerNameSchema.parse('  Budi Santoso  ')).toBe('Budi Santoso');
  });
});

describe('customer email', () => {
  it('trims and lowercases', () => {
    expect(customerEmailSchema.parse('  Budi@Example.COM ')).toBe('budi@example.com');
  });

  it('accepts plus tags and subdomains without extra restrictions', () => {
    for (const email of ['a+b@mail.example.co.id', 'first.last@sub.example.com']) {
      expect(customerEmailSchema.safeParse(email), email).toMatchObject({ success: true });
    }
  });

  it('rejects invalid and empty values with a customer-friendly message', () => {
    for (const email of ['nope', '', 'a@', '@example.com', 'a b@example.com']) {
      const result = customerEmailSchema.safeParse(email);
      expect(result.success, email).toBe(false);
      expect(firstMessage(result)).toBe(EMAIL);
    }
  });
});

describe('customer phone', () => {
  it('accepts 8 and 15 digits after the plus', () => {
    expect(customerPhoneSchema.safeParse('+62812345').success).toBe(true);
    expect(customerPhoneSchema.safeParse('+' + '1'.repeat(15)).success).toBe(true);
  });

  it('rejects 7 and 16 digits with the specific message', () => {
    expect(firstMessage(customerPhoneSchema.safeParse('+6281234'))).toBe(PHONE_MIN);
    expect(firstMessage(customerPhoneSchema.safeParse('+' + '1'.repeat(16)))).toBe(PHONE_MAX);
  });

  it('requires a leading plus', () => {
    expect(firstMessage(customerPhoneSchema.safeParse('62812345678'))).toBe(PHONE_PREFIX);
  });

  it('rejects separators, brackets, and letters', () => {
    for (const phone of ['+62 8123456789', '+62-812-3456-789', '+(62)8123456789', '+62abc123456']) {
      expect(firstMessage(customerPhoneSchema.safeParse(phone)), phone).toBe(PHONE_CHARSET);
    }
  });

  it('requires a value', () => {
    expect(firstMessage(customerPhoneSchema.safeParse(''))).toBe(PHONE_REQUIRED);
  });
});

describe('quantity', () => {
  it('accepts the default 1 and the upper bound 5', () => {
    expect(quantitySchema.parse(1)).toBe(1);
    expect(quantitySchema.parse(5)).toBe(5);
  });

  it('rejects 0 and 6 with the range message', () => {
    expect(firstMessage(quantitySchema.safeParse(0))).toBe(QUANTITY_RANGE);
    expect(firstMessage(quantitySchema.safeParse(6))).toBe(QUANTITY_RANGE);
  });

  it('rejects decimals and strings from the DOM', () => {
    expect(firstMessage(quantitySchema.safeParse(1.5))).toBe(QUANTITY_TYPE);
    expect(firstMessage(quantitySchema.safeParse('1'))).toBe(QUANTITY_TYPE);
  });
});

describe('error messages stay customer-friendly', () => {
  it('never leaks raw Zod wording for any field', () => {
    const invalidPayloads = [
      { ...valid, customerName: 'A' },
      { ...valid, customerName: '123' },
      { ...valid, customerEmail: 'nope' },
      { ...valid, customerPhone: '62812345678' },
      { ...valid, customerPhone: '+62 8123456789' },
      { ...valid, customerPhone: '+6281234' },
      { ...valid, quantity: 0 },
      { ...valid, quantity: '1' as unknown as number },
    ];

    for (const payload of invalidPayloads) {
      const result = checkoutRequestSchema.safeParse(payload);

      expect(result.success).toBe(false);

      for (const issue of result.error?.issues ?? []) {
        expect(issue.message).not.toMatch(RAW_ZOD);
      }
    }
  });

  it('maps a Zod error to the first message per field', () => {
    const result = checkoutRequestSchema.safeParse({
      ...valid,
      customerName: '12345', // length is fine, charset is not
      customerEmail: 'nope',
      customerPhone: '62812345678',
      quantity: 9,
    });

    const fields = checkoutFieldErrors(result.error!);

    expect(fields.customerName).toBe(NAME_CHARSET);
    expect(fields.customerEmail).toBe(EMAIL);
    expect(fields.customerPhone).toBe(PHONE_PREFIX);
    expect(fields.quantity).toBe(QUANTITY_RANGE);
    expect(fields.destinationSlug).toBeUndefined();
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
