import { describe, expect, it } from 'vitest';

import {
  destinationCardDtoSchema,
  destinationCardRowSchema,
  packageDetailRowSchema,
  packageDtoSchema,
  slugSchema,
} from '@/modules/catalog/schemas';

const destinationBase = {
  slug: 'japan',
  name: 'Japan',
  countryCode: 'JP',
  region: 'Asia',
  currencyCode: 'JPY',
  flagEmoji: '🇯🇵',
  summary: 'Reliable data across Tokyo, Kyoto and beyond.',
  description: 'Local 5G/LTE coverage with instant activation on arrival.',
  heroImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/16/example.jpg',
  heroImageAttribution: 'Photo: Reginald Pentinlo · CC BY',
};

const destination = {
  ...destinationBase,
  packageCount: 3,
  fromPriceIdr: 89_000,
};

const pkg = {
  slug: 'japan-5gb-15d',
  name: 'Japan 5 GB · 15 days',
  dataMb: 5120,
  isUnlimited: false,
  validityDays: 15,
  priceIdr: 145_000,
  compareAtPriceIdr: 179_000,
  network: 'Local 5G/LTE',
  hotspotAllowed: true,
};

describe('catalog DTO — destination card', () => {
  it('accepts a complete row', () => {
    expect(() => destinationCardDtoSchema.parse(destination)).not.toThrow();
  });

  it('accepts nullable columns', () => {
    expect(() =>
      destinationCardDtoSchema.parse({
        ...destination,
        flagEmoji: null,
        description: null,
        fromPriceIdr: null,
      }),
    ).not.toThrow();
  });

  it('rejects unknown keys, so internal columns cannot leak through', () => {
    expect(() => destinationCardDtoSchema.parse({ ...destination, id: 'uuid' })).toThrow();
    expect(() => destinationCardDtoSchema.parse({ ...destination, is_active: true })).toThrow();
    expect(() => destinationCardDtoSchema.parse({ ...destination, created_at: 'now' })).toThrow();
  });

  it('rejects a malformed slug and an out-of-range summary', () => {
    expect(() => destinationCardDtoSchema.parse({ ...destination, slug: 'Not A Slug' })).toThrow();
    expect(() =>
      destinationCardDtoSchema.parse({ ...destination, summary: 'x'.repeat(161) }),
    ).toThrow();
  });

  it('rejects a non-https hero image URL', () => {
    expect(() =>
      destinationCardDtoSchema.parse({ ...destination, heroImageUrl: '/local.jpg' }),
    ).toThrow();
  });
});

describe('catalog DTO — package', () => {
  it('accepts a metered package', () => {
    expect(() => packageDtoSchema.parse(pkg)).not.toThrow();
  });

  it('accepts unlimited packages with no data volume and nullable extras', () => {
    expect(() =>
      packageDtoSchema.parse({
        ...pkg,
        dataMb: null,
        isUnlimited: true,
        network: null,
        compareAtPriceIdr: null,
      }),
    ).not.toThrow();
  });

  it('rejects internal identifiers', () => {
    expect(() => packageDtoSchema.parse({ ...pkg, destination_id: 'uuid' })).toThrow();
  });

  it('rejects an out-of-range validity', () => {
    expect(() => packageDtoSchema.parse({ ...pkg, validityDays: 0 })).toThrow();
    expect(() => packageDtoSchema.parse({ ...pkg, validityDays: 91 })).toThrow();
  });
});

describe('catalog transport rows', () => {
  it('derives card aggregates from the embedded packages array', () => {
    const row = destinationCardRowSchema.parse({
      ...destinationBase,
      packages: [{ priceIdr: 89_000 }, { priceIdr: 145_000 }],
    });

    expect(row.packages).toHaveLength(2);
  });

  it('reads the embedded destination on the package detail row', () => {
    const row = packageDetailRowSchema.parse({
      ...pkg,
      destinations: { slug: 'japan', name: 'Japan', region: 'Asia', flagEmoji: '🇯🇵' },
    });

    expect(row.destinations.slug).toBe('japan');
  });
});

describe('slug validation used before querying', () => {
  it('matches the database CHECK pattern', () => {
    expect(slugSchema.safeParse('japan-5gb-15d').success).toBe(true);
    expect(slugSchema.safeParse('Japan').success).toBe(false);
    expect(slugSchema.safeParse('a b').success).toBe(false);
    expect(slugSchema.safeParse('').success).toBe(false);
  });
});
