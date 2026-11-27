import { jsonError, jsonOk } from '@/lib/http';
import { logError } from '@/lib/logger';
import { performCheckout } from '@/modules/orders/checkout';
import { checkoutRequestSchema, idempotencyKeySchema } from '@/modules/orders/schemas';

/**
 * `POST /api/checkout` (api-contract §4.3).
 *
 * Thin transport layer: header and body validation, one call into the orders module, then
 * the documented status mapping. No SQL, no pricing, no state decision lives here.
 */

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: Request): Promise<Response> {
  const idempotencyKey = request.headers.get('idempotency-key');

  if (idempotencyKey === null || !idempotencyKeySchema.safeParse(idempotencyKey).success) {
    return jsonError('BAD_REQUEST', 'A valid Idempotency-Key header is required.');
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError('BAD_REQUEST', 'Request body must be valid JSON.');
  }

  const parsed = checkoutRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      'VALIDATION_ERROR',
      'Checkout payload is invalid.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  try {
    const outcome = await performCheckout(idempotencyKey, parsed.data);

    switch (outcome.kind) {
      case 'created':
        return jsonOk(outcome.response, { status: 201, headers: NO_STORE });

      case 'replay':
        return jsonOk(outcome.response, { status: 200, headers: NO_STORE });

      case 'conflict':
        return jsonError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key was already used with a different payload.',
        );

      case 'expired':
        return jsonError(
          'IDEMPOTENCY_EXPIRED',
          'Idempotency key is older than the 24 hour replay window.',
        );

      case 'package_inactive':
        return jsonError('PACKAGE_INACTIVE', 'This package is not available.');

      case 'replay_unavailable':
        return jsonError(
          'IDEMPOTENCY_REPLAY_UNAVAILABLE',
          'The stored replay token cannot be opened with the current key.',
        );
    }
  } catch (error) {
    // Never leak SQL, hashes, or tokens: the cause goes to the redacted logger only.
    logError('checkout: unexpected failure', { reason: error instanceof Error ? error.name : 'unknown' });

    return jsonError('INTERNAL', 'Checkout could not be completed.');
  }
}
