import { createAdminClient } from '@/lib/supabase/admin';

import { mockGatewayAdapter } from '@/modules/payments/mock-adapter';
import type { SettlementOutcome } from '@/modules/payments/adapter';

import { getPaymentContext, type PaymentContext } from './queries';

/**
 * Payment verification (api-contract §4.5, ADR-7).
 *
 * Trust boundary: the outcome applied to the payment is read from the provider through
 * `adapter.fetchSettlement()`. Nothing in the request body can influence it — the body
 * carries only `ref` and the capability token.
 */

export type VerifyOutcome =
  | { kind: 'settled'; context: PaymentContext }
  | { kind: 'pending'; context: PaymentContext }
  | { kind: 'already_final'; context: PaymentContext }
  | { kind: 'not_found' }
  | { kind: 'provider_error' };

interface SettleRpcResult {
  outcome?: 'applied' | 'unchanged' | 'not_found';
  order_status?: 'pending' | 'paid' | 'failed';
  payment_status?: 'pending' | 'succeeded' | 'failed';
}

export async function performVerify(
  providerReference: string,
  token: string,
  adapter = mockGatewayAdapter,
): Promise<VerifyOutcome> {
  // 1) The reference must belong to the order the token authorises (G-4).
  const before = await getPaymentContext(token, providerReference);

  if (before === null) {
    return { kind: 'not_found' };
  }

  // 2) Terminal payments are not re-settled (AC-P4).
  if (before.paymentStatus !== 'pending') {
    return { kind: 'already_final', context: before };
  }

  // 3) Ask the provider. A missing provider record is `pending`, not an error.
  let settlement: SettlementOutcome | null;

  try {
    settlement = await adapter.fetchSettlement(providerReference);
  } catch {
    // The adapter is unavailable: no state change, the caller returns 500.
    return { kind: 'provider_error' };
  }

  if (settlement === null || settlement === 'pending') {
    return { kind: 'pending', context: before };
  }

  // 4) The single writer applies the decision. `pending` never reaches it.
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('settle_payment', {
    p_provider_reference: providerReference,
    p_outcome: settlement,
  });

  if (error) {
    throw new Error(`settle_payment failed: ${error.message}`);
  }

  const result = (data ?? {}) as SettleRpcResult;

  if (result.outcome === 'not_found') {
    return { kind: 'not_found' };
  }

  if (result.outcome === 'unchanged') {
    const after = await getPaymentContext(token, providerReference);

    return after === null ? { kind: 'not_found' } : { kind: 'already_final', context: after };
  }

  // 5) Re-read so the response reflects committed state, not the RPC echo.
  const after = await getPaymentContext(token, providerReference);

  return after === null ? { kind: 'not_found' } : { kind: 'settled', context: after };
}
