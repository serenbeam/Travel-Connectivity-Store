import { describe, expect, it } from 'vitest';

import {
  WIRE_EVENT,
  outboxPayloadSchema,
  parseOutboxPayload,
  toWirePayload,
} from '@/modules/automation/payload';

/**
 * Outbox payload contract (api-contract §7, FR-N5, AC-T16).
 *
 * The stored payload is written by `settle_payment`; the wire payload is what leaves the
 * process. A strict schema is what keeps a capability token, an access-token hash, or an
 * internal UUID from being forwarded if the database payload ever grows a field.
 */
const NOTIFICATION_ID = '0f9c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

const stored = {
  notificationId: NOTIFICATION_ID,
  orderNumber: 'RML-4KQ9ZT',
  customerName: 'Budi Santoso',
  customerEmail: 'budi@example.com',
  destinationName: 'Japan',
  packageName: 'Japan 5 GB · 15 days',
  packageDataSnapshot: '5 GB · 15 hari',
  totalIdr: 145000,
  paidAt: '2026-11-28T05:56:03.123Z',
};

describe('parseOutboxPayload', () => {
  it('accepts the object settle_payment writes', () => {
    expect(parseOutboxPayload(stored)).toEqual(stored);
  });

  it('rejects a missing required field', () => {
    const { totalIdr, ...withoutTotal } = stored;
    void totalIdr;

    expect(outboxPayloadSchema.safeParse(withoutTotal).success).toBe(false);
  });

  it('rejects an extra key (no capability material may ride along)', () => {
    expect(
      outboxPayloadSchema.safeParse({ ...stored, capabilityUrl: 'https://x/orders/abc' }).success,
    ).toBe(false);
    expect(
      outboxPayloadSchema.safeParse({ ...stored, accessTokenHash: 'a'.repeat(64) }).success,
    ).toBe(false);
    expect(outboxPayloadSchema.safeParse({ ...stored, orderId: NOTIFICATION_ID }).success).toBe(
      false,
    );
  });

  it('rejects malformed identifiers and money', () => {
    expect(outboxPayloadSchema.safeParse({ ...stored, notificationId: 'not-a-uuid' }).success).toBe(
      false,
    );
    expect(outboxPayloadSchema.safeParse({ ...stored, orderNumber: 'RML-123' }).success).toBe(false);
    expect(outboxPayloadSchema.safeParse({ ...stored, totalIdr: 0 }).success).toBe(false);
    expect(outboxPayloadSchema.safeParse({ ...stored, totalIdr: 12.5 }).success).toBe(false);
    expect(outboxPayloadSchema.safeParse({ ...stored, customerEmail: 'nope' }).success).toBe(false);
  });

  it('rejects a paidAt that is not the to_char shape the database writes', () => {
    expect(outboxPayloadSchema.safeParse({ ...stored, paidAt: '2026-11-28 05:56:03' }).success).toBe(
      false,
    );
    expect(outboxPayloadSchema.safeParse({ ...stored, paidAt: '2026-11-28T05:56:03+00:00' }).success).toBe(
      false,
    );
  });

  it('rejects a non-object payload', () => {
    expect(outboxPayloadSchema.safeParse(null).success).toBe(false);
    expect(outboxPayloadSchema.safeParse('x').success).toBe(false);
  });
});

describe('toWirePayload', () => {
  it('adds the order.paid event and keeps notificationId stable', () => {
    const wire = toWirePayload(parseOutboxPayload(stored));

    expect(wire.event).toBe(WIRE_EVENT);
    expect(wire.notificationId).toBe(NOTIFICATION_ID);
    expect(wire).toMatchObject(stored);
  });

  it('contains no capability or credential material', () => {
    const serialised = JSON.stringify(toWirePayload(parseOutboxPayload(stored)));

    expect(serialised).not.toMatch(/capabilit|token|hash|secret|password/i);
  });
});
