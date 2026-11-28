import { z } from 'zod';

import { createFetchWithTimeout } from '@/lib/http';

/**
 * Country-data enrichment (FR-A6, FR-X1, FR-X2, AC-E1, AC-E2).
 *
 * Advisory only: this module returns a suggestion to the form and writes nothing. It is the
 * single external API of the system (ADR-8) and is called only from the admin enrich route —
 * never per storefront page view.
 *
 * Timeout 5 s, one retry, then `503 ENRICHMENT_UNAVAILABLE`; the destination form stays
 * submittable by hand.
 */
const ENRICHMENT_TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 2;
const ENDPOINT =
  'https://countriesnow.space/api/v0.1/countries/info?returns=currency,iso2,iso3,unicodeFlag';

/**
 * Third-party payload: parsed with a plain `z.object` (unknown keys are stripped, not
 * rejected). A `strictObject` here would break whenever the upstream adds a field — this is
 * the one boundary where the shape is not ours to pin.
 */
const countrySchema = z.object({
  name: z.string(),
  currency: z.string().optional(),
  iso2: z.string().optional(),
  unicodeFlag: z.string().optional(),
});

const payloadSchema = z.object({
  error: z.boolean(),
  data: z.union([z.array(countrySchema), countrySchema]).optional(),
});

export interface CountrySuggestion {
  countryCode: string;
  currencyCode: string;
  flagEmoji: string | null;
  source: 'countriesnow';
}

export type EnrichmentResult =
  | { ok: true; suggestion: CountrySuggestion }
  | { ok: false; kind: 'not_found' | 'unavailable' };

const ISO2 = /^[A-Za-z]{2}$/;
const ISO3 = /^[A-Za-z]{3}$/;

/** Pure mapping, exported so it is unit-testable without any network call. */
export function mapCountriesNowResponse(
  payload: unknown,
  countryName: string,
): CountrySuggestion | null {
  const parsed = payloadSchema.safeParse(payload);

  if (!parsed.success || parsed.data.error) {
    return null;
  }

  const raw = parsed.data.data;
  const entries = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const wanted = countryName.trim().toLowerCase();
  const match = entries.find((entry) => entry.name.trim().toLowerCase() === wanted);

  if (!match) {
    return null;
  }

  const iso2 = match.iso2?.trim() ?? '';
  const currency = match.currency?.trim() ?? '';

  if (!ISO2.test(iso2) || !ISO3.test(currency)) {
    return null;
  }

  const flagEmoji = match.unicodeFlag?.trim() ?? '';

  return {
    countryCode: iso2.toUpperCase(),
    currencyCode: currency.toUpperCase(),
    flagEmoji: flagEmoji === '' ? null : flagEmoji,
    source: 'countriesnow',
  };
}

export async function fetchCountrySuggestion(
  countryName: string,
): Promise<EnrichmentResult> {
  const fetchWithTimeout = createFetchWithTimeout(ENRICHMENT_TIMEOUT_MS);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(ENDPOINT, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        continue;
      }

      const suggestion = mapCountriesNowResponse(await response.json(), countryName);

      // A well-formed answer without the country is final: retrying cannot add it.
      return suggestion === null
        ? { ok: false, kind: 'not_found' }
        : { ok: true, suggestion };
    } catch {
      // Network error, abort, or unparsable JSON: retry once.
    }
  }

  return { ok: false, kind: 'unavailable' };
}
