import { jsonError, jsonNotFound, jsonOk } from '@/lib/http';
import { isMockGatewayEnabled } from '@/lib/env';
import { logError } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { mockSettleRequestSchema } from '@/modules/orders/schemas';

/**
 * `POST /api/mock-gateway/[ref]/settle` (api-contract §4.6).
 *
 * SIMULATION ONLY. It writes one row into `mock_gateway_transactions` through
 * `record_mock_settlement` and has no code path into `orders` or `payments`: settling a
 * payment stays the job of `/api/payments/verify` → `settle_payment`.
 */

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const REF_PATTERN = /^[A-Za-z0-9_]{8,64}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  // Gate first: in production (or when disabled) this route does not exist.
  if (!isMockGatewayEnabled()) {
    return jsonNotFound();
  }

  const { ref } = await params;

  if (!REF_PATTERN.test(ref)) {
    return jsonNotFound();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError('BAD_REQUEST', 'Request body must be valid JSON.');
  }

  const parsed = mockSettleRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Outcome must be succeeded, failed, or pending.');
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('record_mock_settlement', {
      p_ref: ref,
      p_outcome: parsed.data.outcome,
    });

    if (error) {
      throw new Error(`record_mock_settlement failed: ${error.message}`);
    }

    const stored = data as { outcome?: string; transition?: string } | null;

    // `conflict` means the provider already holds a different terminal outcome; the stored
    // value wins and the caller is told about it rather than overwriting history.
    return jsonOk(
      { outcome: stored?.outcome ?? parsed.data.outcome, ref, transition: stored?.transition },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    logError('mock-gateway settle: unexpected failure', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'The simulated gateway could not record the outcome.');
  }
}
