import { z } from 'zod';

import { jsonError, jsonOk } from '@/lib/http';
import { logError } from '@/lib/logger';
import { adminGuard } from '@/modules/auth/guard';
import { resendForOrder } from '@/modules/automation/dispatch';

/**
 * `POST /api/admin/orders/[id]/notification/resend` (api-contract §5.6, FR-A10, AC-T12).
 *
 * Manual recovery for the outbox. The handler is authorization-first (`adminGuard()`), and
 * the decision it returns is advisory: whatever the state read says, the delivery itself
 * goes through `claim_outbox`/`finish_outbox`, so a stale read cannot cause a second
 * concurrent delivery. No endpoint resets `attempts`; a row at the ceiling is terminal for
 * dispatch and its recovery is the documented operator runbook (ADR-9).
 */
const idSchema = z.uuid();

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  const guard = await adminGuard();

  if (!guard.ok) {
    return guard.response;
  }

  const orderId = idSchema.safeParse((await context.params).id);

  if (!orderId.success) {
    return jsonError('BAD_REQUEST', 'Malformed path parameter.');
  }

  try {
    const outcome = await resendForOrder(orderId.data);

    switch (outcome.kind) {
      case 'sent':
        return jsonOk({ status: 'sent', notificationId: outcome.notificationId });

      case 'skipped': {
        if (outcome.reason === 'no_outbox') {
          return jsonError('NOT_FOUND', 'No notification exists for this order.');
        }

        // already sent, attempts exhausted, or the order is not paid
        return jsonOk({ status: 'skipped', reason: 'none_claimable' }, { status: 202 });
      }

      case 'in_flight':
        return jsonError(
          'NOTIFICATION_IN_FLIGHT',
          'A notification delivery is already in progress.',
        );

      case 'stale':
        return jsonError(
          'NOTIFICATION_CLAIM_STALE',
          'The delivery claim expired before the result could be recorded.',
        );

      case 'failed':
        return jsonError(
          'NOTIFICATION_DELIVERY_FAILED',
          'n8n rejected the notification or did not answer.',
        );

      case 'none':
        return jsonOk({ status: 'skipped', reason: 'none_claimable' }, { status: 202 });

      case 'error':
        logError('admin resend: dispatch unavailable', { operation: outcome.error });

        return jsonError('INTERNAL', 'The notification could not be dispatched.');
    }
  } catch (error) {
    logError('admin resend: unexpected failure', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'The notification could not be dispatched.');
  }
}
