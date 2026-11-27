import { jsonError, jsonNotFound, jsonOk } from '@/lib/http';
import { logError } from '@/lib/logger';
import { verifyRequestSchema } from '@/modules/orders/schemas';
import { performVerify } from '@/modules/orders/verify';

/**
 * `POST /api/payments/verify` (api-contract §4.5).
 *
 * The only endpoint that calls `settle_payment`. The settlement outcome comes from the
 * payment adapter, never from this request body.
 */

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError('BAD_REQUEST', 'Request body must be valid JSON.');
  }

  const parsed = verifyRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      'VALIDATION_ERROR',
      'Verification payload is invalid.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  try {
    const outcome = await performVerify(parsed.data.ref, parsed.data.token);

    switch (outcome.kind) {
      case 'settled':
      case 'pending':
        return jsonOk(
          {
            orderStatus: outcome.context.orderStatus,
            paymentStatus: outcome.context.paymentStatus,
            paidAt: outcome.context.paidAt,
          },
          { status: 200, headers: NO_STORE },
        );

      case 'already_final':
        return jsonError(
          'PAYMENT_ALREADY_FINAL',
          'This payment already has a final status.',
          {
            orderStatus: outcome.context.orderStatus,
            paymentStatus: outcome.context.paymentStatus,
            paidAt: outcome.context.paidAt,
          },
        );

      case 'not_found':
        // Unknown ref and token mismatch return the same body on purpose (AC-T3).
        return jsonNotFound();

      case 'provider_error':
        return jsonError('INTERNAL', 'The payment provider is unavailable.');
    }
  } catch (error) {
    logError('verify: unexpected failure', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'Verification could not be completed.');
  }
}
