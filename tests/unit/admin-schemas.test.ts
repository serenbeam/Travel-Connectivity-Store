import { describe, expect, it } from 'vitest';

import {
  destinationInputSchema,
  destinationPatchSchema,
  packageInputSchema,
  packagePatchSchema,
  validatePackageShape,
} from '@/modules/catalog/admin-schemas';

/**
 * Admin catalog validation (FR-A4, FR-A5).
 *
 * The schemas mirror the database constraints so a bad form is rejected with 422 before
 * PostgREST sees it, and every object is strict so an extra key cannot be mass-assigned.
 */
const destination = {
  slug: 'iceland',
  countryCode: 'IS',
  name: 'Iceland',
  region: 'Europe',
  currencyCode: 'ISK',
  flagEmoji: '🇮🇸',
  summary: 'Ring-road coverage for the whole island.',
  description: null,
  heroImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/example.jpg',
  heroImageAttribution: 'Photo: Example · CC BY',
  isActive: true,
  sortOrder: 6,
};

const pkg = {
  destinationId: '0f9c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'iceland-5gb-15d',
  name: 'Iceland 5 GB · 15 days',
  dataMb: 5120,
  isUnlimited: false,
  validityDays: 15,
  priceIdr: 145000,
  compareAtPriceIdr: 179000,
  network: 'Local 5G/LTE',
  hotspotAllowed: true,
  isActive: true,
};

describe('destinationInputSchema', () => {
  it('accepts a valid destination', () => {
    expect(destinationInputSchema.safeParse(destination).success).toBe(true);
  });

  it('rejects an unknown key (no mass assignment)', () => {
    const result = destinationInputSchema.safeParse({ ...destination, id: 'x' });

    expect(result.success).toBe(false);
  });

  it('rejects a bare uppercase-required field that is lowercase', () => {
    expect(destinationInputSchema.safeParse({ ...destination, countryCode: 'is' }).success).toBe(
      false,
    );
    expect(
      destinationInputSchema.safeParse({ ...destination, currencyCode: 'isk' }).success,
    ).toBe(false);
  });

  it('rejects a non-https hero image URL', () => {
    expect(
      destinationInputSchema.safeParse({
        ...destination,
        heroImageUrl: 'http://example.com/photo.jpg',
      }).success,
    ).toBe(false);
  });

  it('rejects a summary longer than 160 characters', () => {
    expect(
      destinationInputSchema.safeParse({ ...destination, summary: 'a'.repeat(161) }).success,
    ).toBe(false);
  });

  it('rejects a slug with invalid characters', () => {
    expect(destinationInputSchema.safeParse({ ...destination, slug: 'Ice Land' }).success).toBe(
      false,
    );
  });

  it('rejects an empty PATCH body and accepts a partial one', () => {
    expect(destinationPatchSchema.safeParse({}).success).toBe(false);
    expect(destinationPatchSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe('packageInputSchema', () => {
  it('accepts a valid metered package', () => {
    expect(packageInputSchema.safeParse(pkg).success).toBe(true);
  });

  it('rejects an unknown key', () => {
    expect(packageInputSchema.safeParse({ ...pkg, createdAt: 'now' }).success).toBe(false);
  });

  it('rejects validity outside 1..90 days', () => {
    expect(packageInputSchema.safeParse({ ...pkg, validityDays: 0 }).success).toBe(false);
    expect(packageInputSchema.safeParse({ ...pkg, validityDays: 91 }).success).toBe(false);
  });

  it('rejects a non-positive price', () => {
    expect(packageInputSchema.safeParse({ ...pkg, priceIdr: 0 }).success).toBe(false);
  });

  it('rejects an empty PATCH body and accepts a partial one', () => {
    expect(packagePatchSchema.safeParse({}).success).toBe(false);
    expect(packagePatchSchema.safeParse({ priceIdr: 150000 }).success).toBe(true);
  });
});

describe('validatePackageShape — the cross-column database CHECKs', () => {
  const base = {
    dataMb: 5120,
    isUnlimited: false,
    validityDays: 15,
    priceIdr: 145000,
    compareAtPriceIdr: 179000,
  };

  it('accepts a consistent metered package', () => {
    expect(validatePackageShape(base)).toEqual([]);
  });

  it('accepts an unlimited package without a data volume', () => {
    expect(validatePackageShape({ ...base, isUnlimited: true, dataMb: null })).toEqual([]);
  });

  it('rejects an unlimited package that still has a data volume', () => {
    const issues = validatePackageShape({ ...base, isUnlimited: true });

    expect(issues.map((issue) => issue.field)).toContain('dataMb');
  });

  it('rejects a metered package without a data volume (PATCH merge case)', () => {
    const issues = validatePackageShape({ ...base, dataMb: null });

    expect(issues.map((issue) => issue.field)).toContain('dataMb');
  });

  it('rejects a compare-at price that is not above the real price', () => {
    const equal = validatePackageShape({ ...base, compareAtPriceIdr: base.priceIdr });
    const lower = validatePackageShape({ ...base, compareAtPriceIdr: 1000 });

    expect(equal.map((issue) => issue.field)).toContain('compareAtPriceIdr');
    expect(lower.map((issue) => issue.field)).toContain('compareAtPriceIdr');
  });
});
