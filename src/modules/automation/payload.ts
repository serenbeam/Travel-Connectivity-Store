import { z } from 'zod';

/**
 * Outbox payload contract (docs/api-contract.md §7).
 *
 * `settle_payment` writes this object into `notification_outbox.payload` inside the same
 * transaction that marks the order paid, so the values are frozen snapshots — later catalog
 * edits never rewrite a notification.
 *
 * Everything is a `strictObject`: a payload with an unexpected key is rejected instead of
 * being forwarded to n8n. That is the guard that keeps a capability token, an access-token
 * hash, or an internal UUID out of the webhook body even if the database payload ever grows
 * a new field.
 */

/** Wire event stamped by the dispatcher; it is not stored in the outbox payload. */
export const WIRE_EVENT = 'order.paid';

const ORDER_NUMBER_PATTERN = /^RML-[A-Z0-9]{6}$/;
/** `settle_payment` formats `paidAt` with to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'). */
const PAID_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const outboxPayloadSchema = z.strictObject({
  notificationId: z.uuid(),
  orderNumber: z.string().regex(ORDER_NUMBER_PATTERN),
  customerName: z.string().trim().min(1).max(100),
  customerEmail: z.email(),
  destinationName: z.string().trim().min(1).max(120),
  packageName: z.string().trim().min(1).max(160),
  packageDataSnapshot: z.string().trim().min(1).max(120),
  totalIdr: z.int().positive().max(2_147_483_647),
  paidAt: z.string().regex(PAID_AT_PATTERN),
});

export type OutboxPayload = z.infer<typeof outboxPayloadSchema>;

/** What actually leaves the process: the stored payload plus the wire event name. */
export const wirePayloadSchema = outboxPayloadSchema.extend({
  event: z.literal(WIRE_EVENT),
});

export type WirePayload = z.infer<typeof wirePayloadSchema>;

/**
 * Validates a raw `payload` column value. Throws `ZodError` on any mismatch; the dispatcher
 * turns that into a fenced `failed` with the sanitised code `invalid_payload`.
 */
export function parseOutboxPayload(raw: unknown): OutboxPayload {
  return outboxPayloadSchema.parse(raw);
}

export function toWirePayload(payload: OutboxPayload): WirePayload {
  return wirePayloadSchema.parse({ ...payload, event: WIRE_EVENT });
}
