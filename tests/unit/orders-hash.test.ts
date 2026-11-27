import { describe, expect, it } from 'vitest';

import { canonicaliseCheckoutPayload, checkoutRequestHash } from '@/modules/orders/hash';
import { checkoutRequestSchema } from '@/modules/orders/schemas';

const base = {
  destinationSlug: 'japan',
  packageSlug: 'japan-5gb-15d',
  quantity: 1,
  customerName: 'Budi Santoso',
  customerEmail: 'budi@example.com',
  customerPhone: '+628123456789',
};

const normalise = (input: unknown) => checkoutRequestSchema.parse(input);

describe('checkout request hash', () => {
  it('is stable for the same normalised payload', () => {
    expect(checkoutRequestHash(normalise(base))).toBe(checkoutRequestHash(normalise(base)));
    expect(checkoutRequestHash(normalise(base))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores key order and insignificant whitespace/email casing', () => {
    const reordered = {
      customerPhone: '  +628123456789 ',
      customerName: '  Budi Santoso  ',
      quantity: 1,
      packageSlug: 'japan-5gb-15d',
      destinationSlug: 'japan',
      customerEmail: '  BUDI@Example.com ',
    };

    expect(checkoutRequestHash(normalise(reordered))).toBe(checkoutRequestHash(normalise(base)));
  });

  it('changes when any material field changes (conflict detection)', () => {
    const variants = [
      { ...base, quantity: 2 },
      { ...base, packageSlug: 'japan-10gb-30d' },
      { ...base, destinationSlug: 'singapore' },
      { ...base, customerEmail: 'other@example.com' },
      { ...base, customerName: 'Budi Santoso Jr' },
    ];

    const baseline = checkoutRequestHash(normalise(base));

    for (const variant of variants) {
      expect(checkoutRequestHash(normalise(variant)), JSON.stringify(variant)).not.toBe(baseline);
    }
  });

  it('canonicalises to a fixed field order', () => {
    expect(canonicaliseCheckoutPayload(normalise(base))).toBe(
      JSON.stringify({
        destinationSlug: 'japan',
        packageSlug: 'japan-5gb-15d',
        quantity: 1,
        customerName: 'Budi Santoso',
        customerEmail: 'budi@example.com',
        customerPhone: '+628123456789',
      }),
    );
  });
});
