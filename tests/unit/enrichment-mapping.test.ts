import { describe, expect, it } from 'vitest';

import { mapCountriesNowResponse } from '@/modules/catalog/enrichment.client';

/**
 * Country-data mapping (AC-E1, AC-E2).
 *
 * Only the pure mapping is tested here: the network call itself belongs to manual/attested
 * verification, because it depends on an external service (ADR-8). The mapping must be strict
 * about what it returns (uppercase ISO codes, no invented region) and tolerant about what the
 * upstream sends (extra fields are stripped, not fatal).
 */
const ENTRY = {
  name: 'Japan',
  currency: 'JPY',
  iso2: 'JP',
  iso3: 'JPN',
  unicodeFlag: '🇯🇵',
  capital: 'Tokyo', // extra field from the upstream payload
};

describe('mapCountriesNowResponse', () => {
  it('maps a matching country from the array payload', () => {
    expect(
      mapCountriesNowResponse({ error: false, data: [ENTRY] }, 'Japan'),
    ).toEqual({
      countryCode: 'JP',
      currencyCode: 'JPY',
      flagEmoji: '🇯🇵',
      source: 'countriesnow',
    });
  });

  it('matches case-insensitively and trims the input', () => {
    const result = mapCountriesNowResponse({ error: false, data: [ENTRY] }, '  japan ');

    expect(result?.countryCode).toBe('JP');
  });

  it('uppercases lower-case upstream codes', () => {
    const result = mapCountriesNowResponse(
      { error: false, data: [{ ...ENTRY, iso2: 'jp', currency: 'jpy' }] },
      'Japan',
    );

    expect(result).toMatchObject({ countryCode: 'JP', currencyCode: 'JPY' });
  });

  it('accepts a single object instead of an array', () => {
    const result = mapCountriesNowResponse({ error: false, data: ENTRY }, 'Japan');

    expect(result?.countryCode).toBe('JP');
  });

  it('returns null for an unknown country', () => {
    expect(mapCountriesNowResponse({ error: false, data: [ENTRY] }, 'Atlantis')).toBeNull();
  });

  it('returns null when the upstream reports an error', () => {
    expect(mapCountriesNowResponse({ error: true, data: [] }, 'Japan')).toBeNull();
  });

  it('returns null for a malformed payload', () => {
    expect(mapCountriesNowResponse({ unexpected: true }, 'Japan')).toBeNull();
    expect(mapCountriesNowResponse('nope', 'Japan')).toBeNull();
    expect(mapCountriesNowResponse(null, 'Japan')).toBeNull();
  });

  it('returns null when the codes are missing or invalid', () => {
    expect(
      mapCountriesNowResponse({ error: false, data: [{ ...ENTRY, iso2: undefined }] }, 'Japan'),
    ).toBeNull();
    expect(
      mapCountriesNowResponse({ error: false, data: [{ ...ENTRY, currency: 'YENN' }] }, 'Japan'),
    ).toBeNull();
  });

  it('returns a null flag when the upstream omits it', () => {
    const result = mapCountriesNowResponse(
      { error: false, data: [{ ...ENTRY, unicodeFlag: undefined }] },
      'Japan',
    );

    expect(result).toMatchObject({ flagEmoji: null });
  });
});
