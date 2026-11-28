import { after } from 'next/server';

import { jsonError, jsonNotFound, jsonOk } from '@/lib/http';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { dispatchForOrder } from '@/modules/automation/dispatch';
import { verifyRequestSchema } from '@/modules/orders/schemas';
import { performVerify } from '@/modules/orders/verify';

/**
 * `POST /api/payments/verify` (api-contract §4.5).
 *
 * The only endpoint that calls `settle_payment`. The settlement outcome comes from the
 * payment adapter, never from this request body.
 *
 * E-7: after a successful settlement the outbox row is dispatched from `after()`. The
 * response never waits for n8n, and a notification failure cannot change the payment: the
 * callback only touches `notification_outbox` (through claim/finish) and always swallows
 * its own errors. `after()` is a post-response hook, not a durable queue — if the process
 * dies before the callback runs, the row stays `pending` and the admin resend path is the
 * recovery.
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
      case 'settled': {
        const orderId = outcome.context.orderId;

        after(async () => {
          try {
            const dispatch = await dispatchForOrder(orderId);

            logInfo('notification dispatch finished', { outcome: dispatch.kind });
          } catch {
            // A notification failure is never a payment failure.
            logWarn('notification dispatch crashed', { operation: 'after' });
          }
        });

        return jsonOk(
          {
            orderStatus: outcome.context.orderStatus,
            paymentStatus: outcome.context.paymentStatus,
            paidAt: outcome.context.paidAt,
          },
          { status: 200, headers: NO_STORE },
        );
      }

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
