import { decodeCursor, parseRangePreset } from '@/lib/admin-list';
import { jsonError, jsonOk } from '@/lib/http';
import { logError } from '@/lib/logger';
import { adminGuard } from '@/modules/auth/guard';
import { listOrdersAdmin, type AdminOrderStatus } from '@/modules/orders/admin-queries';
import { parseOrdersSearch } from '@/modules/orders/admin-search';
import { orderStatusSchema } from '@/modules/orders/schemas';

/**
 * `GET /api/admin/orders` (api-contract §5.4, FR-A7, AC-A5).
 *
 * - `limit` is fixed at 10 in the module; a supplied `limit` is ignored, never trusted;
 * - `q` goes through parseOrdersSearch(): an order number or an email address, never a
 *   filter expression (G-16);
 * - every query parameter is validated before the query is built; the cursor is decoded and
 *   re-validated so it can only carry an ISO instant and a UUID.
 */
export async function GET(request: Request): Promise<Response> {
  const guard = await adminGuard();

  if (!guard.ok) {
    return guard.response;
  }

  const searchParams = new URL(request.url).searchParams;

  const rawStatus = searchParams.get('status');
  let status: AdminOrderStatus | undefined;

  if (rawStatus !== null && rawStatus !== '') {
    const parsedStatus = orderStatusSchema.safeParse(rawStatus);

    if (!parsedStatus.success) {
      return jsonError('VALIDATION_ERROR', 'Invalid status filter.');
    }

    status = parsedStatus.data;
  }

  const range = parseRangePreset(searchParams.get('range'));

  if (range === null) {
    return jsonError('VALIDATION_ERROR', 'Invalid range filter. Use 24h, 7d, or 30d.');
  }

  const search = parseOrdersSearch(searchParams.get('q'));

  if (search.kind === 'invalid') {
    return jsonError(
      'VALIDATION_ERROR',
      'Search must be an order number (RML-XXXXXX) or an email address.',
    );
  }

  const rawCursor = searchParams.get('cursor');
  const cursor = decodeCursor(rawCursor);

  if (rawCursor !== null && rawCursor !== '' && cursor === null) {
    return jsonError('VALIDATION_ERROR', 'Invalid cursor.');
  }

  try {
    const page = await listOrdersAdmin({ status, range, search, cursor });

    return jsonOk({ data: page.rows, nextCursor: page.nextCursor });
  } catch (error) {
    logError('admin orders: list failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'Orders could not be loaded.');
  }
}
