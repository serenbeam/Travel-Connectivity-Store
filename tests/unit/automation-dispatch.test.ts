import { describe, expect, it, vi } from 'vitest';

import {
  OUTBOX_LEASE_MS,
  OUTBOX_MAX_ATTEMPTS,
  canResendNotification,
  dispatchForOrder,
  isWithinLease,
  resendEligibility,
  resendForOrder,
  type DispatchDeps,
  type FinishOutcome,
} from '@/modules/automation/dispatch';
import type { N8nSendResult } from '@/modules/automation/n8n.client';
import type { OutboxState } from '@/modules/automation/outbox-queries';
import type { WirePayload } from '@/modules/automation/payload';

/**
 * Dispatcher behavior (FR-N2, FR-N6, AC-T12, AC-T14).
 *
 * All five dependencies are injected, so this suite touches neither the database nor the
 * network. The database-level guarantees (SKIP LOCKED, fencing, sweep, ceiling) are already
 * covered by tests/integration/outbox.test.ts and are not duplicated here.
 */
const ORDER_ID = '4cc911b5-7d1b-4ea8-931b-5b11a51e0d00';
const NOTIFICATION_ID = '0f9c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

/** PostgREST returns microsecond precision; the token must be echoed verbatim. */
const LOCKED_AT = '2026-11-28T05:56:03.123456+00:00';

const storedPayload = {
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

const OK: N8nSendResult = { ok: true, attempts: 1, httpStatus: 200 };

interface Harness {
  deps: DispatchDeps;
  claim: ReturnType<typeof vi.fn>;
  readPayload: ReturnType<typeof vi.fn>;
  readState: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  finish: ReturnType<typeof vi.fn>;
}

function harness(options: {
  claim?: unknown;
  payload?: unknown;
  send?: N8nSendResult | Error;
  finish?: FinishOutcome | Error;
  state?: OutboxState | null;
  attempts?: number;
} = {}): Harness {
  const attempts = options.attempts ?? 1;
  const claim = vi.fn(async () =>
    options.claim ?? {
      outcome: 'claimed',
      notificationId: NOTIFICATION_ID,
      attempts,
      lockedAt: LOCKED_AT,
    },
  );
  const readPayload = vi.fn(async () =>
    'payload' in options ? options.payload : storedPayload,
  );
  const readState = vi.fn(async () =>
    options.state === undefined
      ? {
          notificationId: NOTIFICATION_ID,
          status: 'pending',
          attempts,
          lockedAt: null,
          orderStatus: 'paid',
        }
      : options.state,
  );
  const send = vi.fn(async () => {
    if (options.send instanceof Error) {
      throw options.send;
    }

    return options.send ?? OK;
  });
  const finish = vi.fn(async (_id: string, _lockedAt: string, ok: boolean) => {
    if (options.finish instanceof Error) {
      throw options.finish;
    }

    return options.finish ?? (ok ? 'sent' : 'failed');
  });

  return {
    deps: { claim, readPayload, readState, send, finish } as unknown as DispatchDeps,
    claim,
    readPayload,
    readState,
    send,
    finish,
  };
}

describe('dispatchForOrder — happy path', () => {
  it('claims, sends one wire payload, and finishes with the fenced token', async () => {
    const h = harness();

    const outcome = await dispatchForOrder(ORDER_ID, h.deps);

    expect(outcome).toEqual({ kind: 'sent', notificationId: NOTIFICATION_ID, attempts: 1 });
    expect(h.send).toHaveBeenCalledTimes(1);

    const wire = h.send.mock.calls[0]?.[0] as WirePayload;
    expect(wire.event).toBe('order.paid');
    expect(wire.notificationId).toBe(NOTIFICATION_ID);

    expect(h.finish).toHaveBeenCalledWith(NOTIFICATION_ID, LOCKED_AT, true, null);
  });

  it('passes the locked_at string through unchanged (no Date conversion)', async () => {
    const h = harness({ attempts: 3 });

    await dispatchForOrder(ORDER_ID, h.deps);

    const [, lockedAt] = h.finish.mock.calls[0] as [string, string];
    expect(lockedAt).toBe(LOCKED_AT);
    expect(typeof lockedAt).toBe('string');
  });

  it('reports none when nothing is claimable, without sending', async () => {
    const h = harness({ claim: { outcome: 'none' } });

    const outcome = await dispatchForOrder(ORDER_ID, h.deps);

    expect(outcome).toEqual({ kind: 'none' });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.finish).not.toHaveBeenCalled();
  });
});

describe('dispatchForOrder — failure paths keep the claim fenced', () => {
  it('marks invalid payload as failed and never sends it', async () => {
    const h = harness({ payload: { ...storedPayload, totalIdr: 'oops' } });

    const outcome = await dispatchForOrder(ORDER_ID, h.deps);

    expect(outcome).toMatchObject({ kind: 'failed', error: 'invalid_payload' });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.finish).toHaveBeenCalledWith(NOTIFICATION_ID, LOCKED_AT, false, 'invalid_payload');
  });

  it('marks a missing payload row as failed', async () => {
    const h = harness({ payload: null });

    const outcome = await dispatchForOrder(ORDER_ID, h.deps);

    expect(outcome).toMatchObject({ kind: 'failed', error: 'payload_unavailable' });
    expect(h.finish).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      LOCKED_AT,
      false,
      'payload_unavailable',
    );
  });

  it('marks a payload read error as failed', async () => {
    const h = harness();
    h.readPayload.mockRejectedValueOnce(new Error('db down'));

    const outcome = await dispatchForOrder(ORDER_ID, h.deps);

    expect(outcome).toMatchObject({ kind: 'failed', error: 'payload_unavailable' });
    expect(h.finish).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      LOCKED_AT,
      false,
      'payload_unavailable',
    );
  });

  it('records the sanitised n8n error when delivery fails', async () => {
    const h = harness({
      send: { ok: false, attempts: 2, reason: 'http_5xx', httpStatus: 503, error: 'n8n_http_503' },
    });

    const outcome = await dispatchForOrder(ORDER_ID, h.deps);

    expect(outcome).toMatchObject({ kind: 'failed', error: 'n8n_http_503' });
    expect(h.finish).toHaveBeenCalledWith(NOTIFICATION_ID, LOCKED_AT, false, 'n8n_http_503');
  });

  it('marks a thrown client error as a network failure', async () => {
    const h = harness({ send: new Error('unexpected') });

    const outcome = await dispatchForOrder(ORDER_ID, h.deps);

    expect(outcome).toMatchObject({ kind: 'failed', error: 'n8n_network' });
  });

  it('reports stale when the fencing token lost a race', async () => {
    const h = harness({ finish: 'stale' });

    const outcome = await dispatchForOrder(ORDER_ID, h.deps);

    expect(outcome).toEqual({ kind: 'stale', notificationId: NOTIFICATION_ID, attempts: 1 });
  });

  it('does not throw when finish itself fails', async () => {
    const h = harness({ finish: new Error('db down') });

    const outcome = await dispatchForOrder(ORDER_ID, h.deps);

    expect(outcome).toMatchObject({ kind: 'failed', error: 'finish_unavailable' });
  });

  it('reports a claim error without touching payload or n8n', async () => {
    const h = harness();
    h.claim.mockRejectedValueOnce(new Error('db down'));

    const outcome = await dispatchForOrder(ORDER_ID, h.deps);

    expect(outcome).toEqual({ kind: 'error', error: 'claim_unavailable' });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.finish).not.toHaveBeenCalled();
  });
});

describe('resendForOrder — operator guard rails', () => {
  const baseState: OutboxState = {
    notificationId: NOTIFICATION_ID,
    status: 'pending',
    attempts: 0,
    lockedAt: null,
    orderStatus: 'paid',
  };

  it('skips when the notification was already sent', async () => {
    const h = harness({ state: { ...baseState, status: 'sent' } });

    const outcome = await resendForOrder(ORDER_ID, h.deps);

    expect(outcome).toEqual({ kind: 'skipped', reason: 'already_sent' });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('skips when the order is not paid', async () => {
    const h = harness({ state: { ...baseState, orderStatus: 'pending' } });

    expect(await resendForOrder(ORDER_ID, h.deps)).toEqual({
      kind: 'skipped',
      reason: 'order_not_paid',
    });
    expect(h.claim).not.toHaveBeenCalled();
  });

  it('skips at the attempts ceiling', async () => {
    const h = harness({ state: { ...baseState, status: 'failed', attempts: OUTBOX_MAX_ATTEMPTS } });

    expect(await resendForOrder(ORDER_ID, h.deps)).toEqual({
      kind: 'skipped',
      reason: 'max_attempts',
    });
    expect(h.claim).not.toHaveBeenCalled();
  });

  it('reports in-flight while a claim holds its lease', async () => {
    const h = harness({
      state: {
        ...baseState,
        status: 'processing',
        attempts: 1,
        lockedAt: new Date(Date.now() - 5_000).toISOString(),
      },
    });

    expect(await resendForOrder(ORDER_ID, h.deps)).toEqual({ kind: 'in_flight' });
    expect(h.claim).not.toHaveBeenCalled();
  });

  it('dispatches when the previous claim is older than the lease', async () => {
    const h = harness({
      state: {
        ...baseState,
        status: 'processing',
        attempts: 1,
        lockedAt: new Date(Date.now() - OUTBOX_LEASE_MS - 5_000).toISOString(),
      },
    });

    const outcome = await resendForOrder(ORDER_ID, h.deps);

    expect(outcome).toEqual({ kind: 'sent', notificationId: NOTIFICATION_ID, attempts: 1 });
    expect(h.claim).toHaveBeenCalledWith(ORDER_ID);
  });

  it('skips cleanly when the order has no outbox row', async () => {
    const h = harness({ state: null });

    expect(await resendForOrder(ORDER_ID, h.deps)).toEqual({
      kind: 'skipped',
      reason: 'no_outbox',
    });
  });
});

describe('isWithinLease', () => {
  it('is false without a token and true inside the window', () => {
    const now = Date.parse('2026-11-28T06:00:00.000Z');

    expect(isWithinLease(null, now)).toBe(false);
    expect(isWithinLease('not-a-date', now)).toBe(false);
    expect(isWithinLease('2026-11-28T05:59:00.000Z', now)).toBe(true);
    expect(isWithinLease('2026-11-28T05:57:00.000Z', now)).toBe(false);
  });
});

/**
 * A2: the admin list must render the Resend button under exactly the rule the endpoint
 * enforces. `resendEligibility` is that rule; `canResendNotification` is the boolean the
 * order list exposes.
 */
describe('resendEligibility', () => {
  const base = {
    status: 'pending' as const,
    attempts: 0,
    lockedAt: null,
    orderStatus: 'paid' as const,
  };

  it('is eligible for a pending row on a paid order', () => {
    expect(resendEligibility(base)).toBe('eligible');
  });

  it('is eligible for a failed row below the ceiling', () => {
    expect(resendEligibility({ ...base, status: 'failed', attempts: 4 })).toBe('eligible');
  });

  it('is never eligible when the order is not paid', () => {
    expect(resendEligibility({ ...base, orderStatus: 'pending' })).toBe('order_not_paid');
    expect(resendEligibility({ ...base, orderStatus: 'failed' })).toBe('order_not_paid');
  });

  it('is never eligible once the notification was sent', () => {
    expect(resendEligibility({ ...base, status: 'sent' })).toBe('already_sent');
    expect(resendEligibility({ ...base, status: 'sent', attempts: 1 })).toBe('already_sent');
  });

  it('is never eligible at the attempts ceiling (exactly 5)', () => {
    expect(resendEligibility({ ...base, status: 'failed', attempts: OUTBOX_MAX_ATTEMPTS })).toBe(
      'max_attempts',
    );
    expect(
      resendEligibility({ ...base, status: 'pending', attempts: OUTBOX_MAX_ATTEMPTS }),
    ).toBe('max_attempts');
  });

  it('is in flight only while the lease is active', () => {
    const active = new Date(Date.now() - 5_000).toISOString();
    const expired = new Date(Date.now() - OUTBOX_LEASE_MS - 5_000).toISOString();

    expect(resendEligibility({ ...base, status: 'processing', lockedAt: active })).toBe(
      'in_flight',
    );
    expect(resendEligibility({ ...base, status: 'processing', lockedAt: expired })).toBe(
      'eligible',
    );
  });

  it('treats a processing row without a token as expired (claim decides)', () => {
    expect(resendEligibility({ ...base, status: 'processing', lockedAt: null })).toBe('eligible');
  });
});

describe('canResendNotification (admin list mapping)', () => {
  it('is true only for the eligible state', () => {
    const eligible = {
      status: 'pending' as const,
      attempts: 0,
      lockedAt: null,
      orderStatus: 'paid' as const,
    };

    expect(canResendNotification(eligible)).toBe(true);
    expect(canResendNotification({ ...eligible, status: 'sent' })).toBe(false);
    expect(canResendNotification({ ...eligible, attempts: OUTBOX_MAX_ATTEMPTS })).toBe(false);
    expect(canResendNotification({ ...eligible, orderStatus: 'pending' })).toBe(false);
    expect(
      canResendNotification({
        ...eligible,
        status: 'processing',
        lockedAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    ).toBe(false);
    expect(
      canResendNotification({
        ...eligible,
        status: 'processing',
        lockedAt: new Date(Date.now() - OUTBOX_LEASE_MS - 1_000).toISOString(),
      }),
    ).toBe(true);
  });

  it('is false when the order has no outbox row (null relation)', () => {
    expect(canResendNotification(null)).toBe(false);
  });
});
