import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Outbox reads for the dispatcher and the admin resend path (E-7).
 *
 * These run with the service client because `claim_outbox` / `finish_outbox` are
 * service-role-only RPCs and the dispatch path has no user session (`after()`). Every call
 * site has already made an authorization decision — `after()` only runs after a server-side
 * settlement, and the resend handler calls `adminGuard()` first — and every query selects an
 * explicit column list, then parses the row with a `strictObject` so an unexpected column
 * fails loudly instead of travelling onward.
 */
export type OutboxStatus = 'pending' | 'processing' | 'sent' | 'failed';
export type OrderStatus = 'pending' | 'paid' | 'failed';

export interface OutboxState {
  notificationId: string;
  status: OutboxStatus;
  attempts: number;
  /** Opaque fencing token passed back to `finish_outbox` verbatim (never a Date). */
  lockedAt: string | null;
  orderStatus: OrderStatus;
}

export class OutboxQueryError extends Error {
  constructor(operation: string, cause: string) {
    super(`Outbox query failed: ${operation}`);
    this.name = 'OutboxQueryError';
    this.cause = cause;
  }
}

const outboxStatusSchema = z.enum(['pending', 'processing', 'sent', 'failed']);
const orderStatusSchema = z.enum(['pending', 'paid', 'failed']);

const stateRowSchema = z.strictObject({
  id: z.uuid(),
  status: outboxStatusSchema,
  attempts: z.int(),
  lockedAt: z.string().nullable(),
  order: z.strictObject({ status: orderStatusSchema }),
});

const payloadRowSchema = z.strictObject({ payload: z.unknown() });

/** Current state of the single outbox row that belongs to an order, or `null`. */
export async function getOutboxStateByOrderId(orderId: string): Promise<OutboxState | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('notification_outbox')
    .select('id,status,attempts,lockedAt:locked_at,order:orders!inner(status)')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) {
    throw new OutboxQueryError('getOutboxStateByOrderId', error.message);
  }

  if (data === null) {
    return null;
  }

  const parsed = stateRowSchema.parse(data);

  return {
    notificationId: parsed.id,
    status: parsed.status,
    attempts: parsed.attempts,
    lockedAt: parsed.lockedAt,
    orderStatus: parsed.order.status,
  };
}

/**
 * Raw `payload` column for a notification id, validated by the caller. `null` means the row
 * disappeared, which the dispatcher reports as `payload_unavailable` rather than crashing.
 */
export async function getOutboxPayloadById(notificationId: string): Promise<unknown | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('notification_outbox')
    .select('payload')
    .eq('id', notificationId)
    .maybeSingle();

  if (error) {
    throw new OutboxQueryError('getOutboxPayloadById', error.message);
  }

  if (data === null) {
    return null;
  }

  return payloadRowSchema.parse(data).payload;
}
