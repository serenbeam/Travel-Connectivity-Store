import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';

import type { PaymentGatewayAdapter, SettlementOutcome } from './adapter';

/**
 * Simulated provider (ADR-7).
 *
 * Reads only `mock_gateway_transactions` — the table owned by the simulation. It has no
 * code path into `orders` or `payments`; those are written exclusively by `settle_payment`.
 */

const outcomeRowSchema = z.strictObject({
  outcome: z.enum(['succeeded', 'failed', 'pending']),
});

export const mockGatewayAdapter: PaymentGatewayAdapter = {
  name: 'mock',

  async fetchSettlement(providerReference: string): Promise<SettlementOutcome | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('mock_gateway_transactions')
      .select('outcome')
      .eq('provider_reference', providerReference)
      .maybeSingle();

    if (error) {
      throw new Error(`mock gateway read failed: ${error.message}`);
    }

    if (!data) {
      // No simulated decision yet — identical semantics to `pending`.
      return null;
    }

    return outcomeRowSchema.parse(data).outcome;
  },
};
