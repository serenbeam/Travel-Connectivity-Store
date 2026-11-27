/**
 * Payment gateway adapter contract (ADR-7).
 *
 * The system never trusts the browser for a settlement decision: the outcome applied by
 * `settle_payment` comes from `fetchSettlement()` only. The result is a discriminated union
 * so the compiler forces the `pending` branch to be handled without calling the RPC.
 */

export type SettlementOutcome = 'succeeded' | 'failed' | 'pending';

export interface PaymentIntentRequest {
  providerReference: string;
  totalIdr: number;
  orderNumber: string;
}

export interface PaymentIntent {
  providerReference: string;
  /** Where the customer is sent to complete the simulated payment. */
  paymentUrl: string;
}

export interface PaymentGatewayAdapter {
  readonly name: string;

  /**
   * Optional: the simulated provider needs no intent call because
   * `create_order_idempotent` already persisted a `pending` payment row with this
   * reference. A real PSP adapter would create the intent here.
   */
  createIntent?(request: PaymentIntentRequest): Promise<PaymentIntent>;

  /**
   * Reads the provider's own record. `null` means "the provider has no decision yet",
   * which the caller treats exactly like `pending`: no state change.
   */
  fetchSettlement(providerReference: string): Promise<SettlementOutcome | null>;
}
