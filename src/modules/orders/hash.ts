import { createHash } from 'node:crypto';

import type { CheckoutRequest } from './schemas';

/**
 * Idempotency hash input (ADR-3, ADR-6).
 *
 * The hash is computed over the Zod-normalised payload with a fixed key order, so a retry
 * that differs only in JSON key order, surrounding whitespace, or email casing produces the
 * same hash and therefore the same order. Kept free of server-only imports so the
 * determinism can be unit-tested.
 */

export function canonicaliseCheckoutPayload(payload: CheckoutRequest): string {
  return JSON.stringify({
    destinationSlug: payload.destinationSlug,
    packageSlug: payload.packageSlug,
    quantity: payload.quantity,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    customerPhone: payload.customerPhone,
  });
}

export function checkoutRequestHash(payload: CheckoutRequest): string {
  return createHash('sha256').update(canonicaliseCheckoutPayload(payload), 'utf8').digest('hex');
}
