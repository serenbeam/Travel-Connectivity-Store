import { decodeCursor, parseRangePreset } from '@/lib/admin-list';
import { jsonError, jsonOk } from '@/lib/http';
import { logError } from '@/lib/logger';
import { adminGuard } from '@/modules/auth/guard';
import { listPaymentsAdmin, type AdminPaymentStatus } from '@/modules/payments/admin-queries';
import { paymentStatusSchema } from '@/modules/orders/schemas';

/**
 * `GET /api/admin/payments` (api-contract §5.5, FR-A8).
 *
 * Same filters as the order list minus free-text search: payments are found through orders,
 * and the order number comes from the embedded join rather than a per-row query.
 */
export async function GET(request: Request): Promise<Response> {
  const guard = await adminGuard();

  if (!guard.ok) {
    return guard.response;
  }

  const searchParams = new URL(request.url).searchParams;

  const rawStatus = searchParams.get('status');
  let status: AdminPaymentStatus | undefined;

  if (rawStatus !== null && rawStatus !== '') {
    const parsedStatus = paymentStatusSchema.safeParse(rawStatus);

    if (!parsedStatus.success) {
      return jsonError('VALIDATION_ERROR', 'Invalid status filter.');
    }

    status = parsedStatus.data;
  }

  const range = parseRangePreset(searchParams.get('range'));

  if (range === null) {
    return jsonError('VALIDATION_ERROR', 'Invalid range filter. Use 24h, 7d, or 30d.');
  }

  const rawCursor = searchParams.get('cursor');
  const cursor = decodeCursor(rawCursor);

  if (rawCursor !== null && rawCursor !== '' && cursor === null) {
    return jsonError('VALIDATION_ERROR', 'Invalid cursor.');
  }

  try {
    const page = await listPaymentsAdmin({ status, range, cursor });

    return jsonOk({ data: page.rows, nextCursor: page.nextCursor });
  } catch (error) {
    logError('admin payments: list failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'Payments could not be loaded.');
  }
}
