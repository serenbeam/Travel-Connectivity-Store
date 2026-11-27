import { jsonNotFound, jsonOk } from '@/lib/http';
import { logError } from '@/lib/logger';
import { getOrderStatusByToken } from '@/modules/orders/queries';

/**
 * `GET /api/orders/[token]` (api-contract §4.4).
 *
 * The token is the authorization. A miss and a malformed token return the same body, so an
 * attacker cannot tell "wrong token" from "no such order" (AC-T3).
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  if (!TOKEN_PATTERN.test(token)) {
    return jsonNotFound();
  }

  try {
    const lookup = await getOrderStatusByToken(token);

    if (lookup === null) {
      return jsonNotFound();
    }

    // Only the agreed DTO leaves this handler: no hash, no internal ids, no payment ref.
    return jsonOk(lookup.order, { status: 200, headers: NO_STORE });
  } catch (error) {
    logError('order read: unexpected failure', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonNotFound();
  }
}
