import { z } from 'zod';

import { jsonError, jsonOk, validationDetails } from '@/lib/http';
import { logError } from '@/lib/logger';
import { adminGuard } from '@/modules/auth/guard';
import { fetchCountrySuggestion } from '@/modules/catalog/enrichment.client';

/**
 * `POST /api/admin/destinations/enrich` (api-contract §5.3, FR-A6, AC-E1, AC-E2).
 *
 * Advisory only: returns field suggestions for the form and writes nothing. `region` is not
 * fetched — the upstream does not provide it and the admin authors it (ADR-8).
 */
const enrichRequestSchema = z.strictObject({
  countryName: z.string().trim().min(2).max(80),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await adminGuard();

  if (!guard.ok) {
    return guard.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError('BAD_REQUEST', 'Request body must be valid JSON.');
  }

  const parsed = enrichRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      'VALIDATION_ERROR',
      'Enrichment payload is invalid.',
      validationDetails(parsed.error.issues),
    );
  }

  try {
    const result = await fetchCountrySuggestion(parsed.data.countryName);

    if (result.ok) {
      return jsonOk({
        countryCode: result.suggestion.countryCode,
        currencyCode: result.suggestion.currencyCode,
        flagEmoji: result.suggestion.flagEmoji,
        source: result.suggestion.source,
      });
    }

    if (result.kind === 'not_found') {
      return jsonError('NOT_FOUND', 'No country data for that name.');
    }

    return jsonError(
      'ENRICHMENT_UNAVAILABLE',
      'The country data service is unavailable. Enter the fields manually.',
    );
  } catch (error) {
    logError('admin destinations: enrich failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError(
      'ENRICHMENT_UNAVAILABLE',
      'The country data service is unavailable. Enter the fields manually.',
    );
  }
}
