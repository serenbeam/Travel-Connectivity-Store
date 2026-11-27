import { getEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveActivePackageId } from '@/modules/catalog/queries';

import { checkoutRequestHash } from './hash';
import { newOrderNumber, newProviderReference } from './ids';
import {
  checkoutResponseDtoSchema,
  type CheckoutRequest,
  type CheckoutResponseDto,
} from './schemas';
import {
  SealedTokenError,
  generateCapabilityToken,
  hashCapabilityToken,
  sealCapabilityToken,
  sealingKeyFromBase64,
  unsealCapabilityToken,
} from './token';

/**
 * Checkout orchestration (ADR-6, api-contract §4.3).
 *
 * Node owns only the parts Postgres must not know about: the capability token, its hash,
 * the AES-256-GCM sealed copy, the display order number, and the provider reference. All
 * pricing, the order/payment insert, and the idempotency decision happen inside
 * `create_order_idempotent`, which is the single writer.
 */

export type CheckoutOutcome =
  | { kind: 'created' | 'replay'; response: CheckoutResponseDto }
  | { kind: 'conflict' }
  | { kind: 'expired' }
  | { kind: 'package_inactive' }
  | { kind: 'replay_unavailable' };

/**
 * Canonical hash input lives in `hash.ts` so the determinism can be unit-tested without
 * pulling in the server-only Supabase client.
 */
export { canonicaliseCheckoutPayload, checkoutRequestHash } from './hash';

interface RpcOrderResult {
  outcome?: string;
  order_number?: string;
  payment_ref?: string;
  total_idr?: number;
  sealed_token?: string;
}

const INACTIVE_MESSAGE = 'PACKAGE_INACTIVE';

export async function performCheckout(
  idempotencyKey: string,
  payload: CheckoutRequest,
): Promise<CheckoutOutcome> {
  const env = getEnv();
  const sealingKey = sealingKeyFromBase64(env.IDEMPOTENCY_TOKEN_KEY);

  // Resolve the package through the anon read path (RLS hides inactive rows). The RPC
  // re-checks package and destination activity as its owner, so this is a fast 404 and
  // not a security boundary.
  const resolved = await resolveActivePackageId(payload.destinationSlug, payload.packageSlug);

  if (resolved === null) {
    return { kind: 'package_inactive' };
  }

  const token = generateCapabilityToken();
  const orderNumber = newOrderNumber();
  const providerReference = newProviderReference();

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('create_order_idempotent', {
    p_key: idempotencyKey,
    p_request_hash: checkoutRequestHash(payload),
    p_order: {
      package_id: resolved.packageId,
      quantity: payload.quantity,
      customer_name: payload.customerName,
      customer_email: payload.customerEmail,
      customer_phone: payload.customerPhone,
      order_number: orderNumber,
      access_token_hash: hashCapabilityToken(token),
      response_token_sealed: sealCapabilityToken(token, sealingKey),
      provider_reference: providerReference,
    },
  });

  if (error) {
    // The RPC signals an inactive/unknown package by raising 22000 rather than returning an
    // outcome, because that aborts the transaction and leaves the key reusable.
    if (error.code === '22000' && error.message.includes(INACTIVE_MESSAGE)) {
      return { kind: 'package_inactive' };
    }

    throw new Error(`create_order_idempotent failed: ${error.message}`);
  }

  const result = (data ?? {}) as RpcOrderResult;
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  switch (result.outcome) {
    case 'created': {
      const capabilityUrl = `${appUrl}/orders/${token}`;

      return {
        kind: 'created',
        response: checkoutResponseDtoSchema.parse({
          orderNumber: result.order_number,
          paymentRef: result.payment_ref,
          totalIdr: result.total_idr,
          // A freshly created order and its payment are always pending.
          orderStatus: 'pending',
          paymentStatus: 'pending',
          capabilityUrl,
          paymentUrl: `${appUrl}/mock-gateway/${result.payment_ref}?token=${token}`,
        }),
      };
    }

    case 'replay': {
      // Replay must return a byte-identical body, so the token is recovered from the
      // sealed copy rather than regenerated.
      if (typeof result.sealed_token !== 'string') {
        return { kind: 'replay_unavailable' };
      }

      let replayedToken: string;

      try {
        replayedToken = unsealCapabilityToken(result.sealed_token, sealingKey);
      } catch (sealError) {
        if (sealError instanceof SealedTokenError) {
          return { kind: 'replay_unavailable' };
        }
        throw sealError;
      }

      const capabilityUrl = `${appUrl}/orders/${replayedToken}`;

      return {
        kind: 'replay',
        response: checkoutResponseDtoSchema.parse({
          orderNumber: result.order_number,
          paymentRef: result.payment_ref,
          totalIdr: result.total_idr,
          orderStatus: 'pending',
          paymentStatus: 'pending',
          capabilityUrl,
          paymentUrl: `${appUrl}/mock-gateway/${result.payment_ref}?token=${replayedToken}`,
        }),
      };
    }

    case 'conflict':
      return { kind: 'conflict' };

    case 'expired':
      return { kind: 'expired' };

    default:
      throw new Error(`create_order_idempotent returned an unknown outcome: ${String(result.outcome)}`);
  }
}
