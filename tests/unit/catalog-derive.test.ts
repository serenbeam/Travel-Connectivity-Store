import { describe, expect, it } from 'vitest';

import {
  formatDataAllowance,
  formatValidity,
  fromPriceOf,
  packageCountOf,
  packageHighlights,
  packageSpecs,
} from '@/modules/catalog/derive';

const metered = {
  dataMb: 5120,
  isUnlimited: false,
  validityDays: 15,
  network: 'Local 5G/LTE',
  hotspotAllowed: true,
  priceIdr: 145_000,
};

describe('catalog derive — data allowance', () => {
  it('renders exact GB multiples as GB (rule shared with the order snapshot)', () => {
    expect(formatDataAllowance({ ...metered, dataMb: 5120 })).toBe('5 GB');
    expect(formatDataAllowance({ ...metered, dataMb: 1024 })).toBe('1 GB');
    expect(formatDataAllowance({ ...metered, dataMb: 10240 })).toBe('10 GB');
  });

  it('keeps a non-multiple in MB rather than rounding', () => {
    expect(formatDataAllowance({ ...metered, dataMb: 3000 })).toBe('3000 MB');
  });

  it('reports unlimited packages without a number', () => {
    expect(
      formatDataAllowance({ ...metered, dataMb: null, isUnlimited: true, validityDays: 7 }),
    ).toBe('Unlimited');
  });
});

describe('catalog derive — validity', () => {
  it('singularises one day', () => {
    expect(formatValidity(1)).toBe('1 day');
    expect(formatValidity(15)).toBe('15 days');
  });
});

describe('catalog derive — highlights and specs', () => {
  it('returns three deterministic highlights', () => {
    expect(packageHighlights(metered)).toEqual([
      '5 GB of data',
      'Valid 15 days',
      'Local 5G/LTE',
    ]);
  });

  it('falls back to a neutral network label when the column is null', () => {
    expect(packageHighlights({ ...metered, network: null })[2]).toBe('Local network');
  });

  it('exposes the four specification rows used on the detail page', () => {
    const specs = packageSpecs(metered);

    expect(specs.map((spec) => spec.label)).toEqual([
      'Data',
      'Validity',
      'Network',
      'Mobile hotspot',
    ]);
    expect(specs[3]?.value).toBe('Allowed');
    expect(packageSpecs({ ...metered, hotspotAllowed: false })[3]?.value).toBe('Not allowed');
  });
});

describe('catalog derive — aggregates', () => {
  it('counts active packages', () => {
    expect(packageCountOf([])).toBe(0);
    expect(packageCountOf([metered, { ...metered, priceIdr: 89_000 }])).toBe(2);
  });

  it('picks the cheapest price, or null when there are no packages', () => {
    expect(fromPriceOf([])).toBeNull();
    expect(fromPriceOf([{ priceIdr: 145_000 }])).toBe(145_000);
    expect(fromPriceOf([{ priceIdr: 145_000 }, { priceIdr: 89_000 }, { priceIdr: 249_000 }])).toBe(
      89_000,
    );
  });
});
