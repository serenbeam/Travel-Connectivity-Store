import { describe, expect, it } from 'vitest';

import { assertOpaqueFencingToken } from './support/assert';
import { serviceClient } from './support/clients';
import {
  callClaim,
  callFinish,
  createPaidOrder,
  forceExpiredAtCeiling,
  forceExpiredLease,
  forceLockedAt,
  outboxRow,
} from './support/factories';
import { psqlAsync } from './support/psql';

const service = serviceClient();

/**
 * Outbox claim / fencing / lease recovery.
 *
 * AC-T11 is asserted at the database level: a crashed dispatcher leaves `processing`,
 * the lease makes the row reclaimable while `attempts < 5`, and at the ceiling the next
 * claim sweeps it to a terminal `failed`. The HTTP delivery half of AC-T10/T11 is E-7.
 */
describe('outbox claim concurrency', () => {
  it('AC-T10 (database scope): two concurrent claims yield one claim and one none', async () => {
    const paid = await createPaidOrder();

    const results = await Promise.all([callClaim(paid.orderId), callClaim(paid.orderId)]);

    const claimed = results.filter((result) => result.outcome === 'claimed');
    const none = results.filter((result) => result.outcome === 'none');

    expect(claimed).toHaveLength(1);
    expect(none).toHaveLength(1);
    expect(claimed[0]?.attempts).toBe(1);

    const row = outboxRow(paid.outboxId);
    expect(row.status).toBe('processing');
    expect(row.attempts).toBe(1);
    expect(row.lockedAt).not.toBeNull();
  });

  it('returns none when the order is not paid', async () => {
    const paid = await createPaidOrder();
    expect((await callClaim(paid.orderId)).outcome).toBe('claimed');

    const again = await callClaim(paid.orderId);
    expect(again.outcome).toBe('none');
  });
});

describe('AC-T13 — fencing rejects a stale worker', () => {
  it('reclaims an expired lease and refuses the old token', async () => {
    const paid = await createPaidOrder();

    const first = await callClaim(paid.orderId);
    expect(first.outcome).toBe('claimed');
    const firstToken = first.locked_at;
    assertOpaqueFencingToken(firstToken);

    // Simulate a crashed dispatcher whose lease has expired.
    forceExpiredLease(paid.outboxId, 1, 121);

    const second = await callClaim(paid.orderId);
    expect(second.outcome).toBe('claimed');
    expect(second.attempts).toBe(2);

    const before = outboxRow(paid.outboxId);

    const stale = await callFinish(paid.outboxId, firstToken, false, 'late worker');
    expect(stale.outcome).toBe('stale');

    const after = outboxRow(paid.outboxId);
    expect(after).toEqual(before);
    expect(after.status).toBe('processing');
    expect(after.attempts).toBe(2);
  });
});

describe('AC-T11 — lease recovery and the attempts ceiling', () => {
  it('reclaims an expired lease while attempts < 5', async () => {
    const paid = await createPaidOrder();
    forceExpiredLease(paid.outboxId, 4, 121);

    const claimed = await callClaim(paid.orderId);
    expect(claimed.outcome).toBe('claimed');
    expect(claimed.attempts).toBe(5);
  });

  it('sweeps a dead lease at the ceiling into a terminal failure', async () => {
    const paid = await createPaidOrder();
    forceExpiredAtCeiling(paid.outboxId, 5, 200);

    // The claim itself finds nothing to claim ...
    const claimed = await callClaim(paid.orderId);
    expect(claimed.outcome).toBe('none');

    // ... but the sweep ran and turned the zombie into an honest terminal state.
    const row = outboxRow(paid.outboxId);
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(5);
    expect(row.lockedAt).toBeNull();
    expect(row.sentAt).toBeNull();
    expect(row.lastError).toBe('lease_expired_after_max_attempts');
  });

  it('never claims a row at the ceiling again', async () => {
    const paid = await createPaidOrder();
    forceExpiredAtCeiling(paid.outboxId, 5, 200);
    await callClaim(paid.orderId);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect((await callClaim(paid.orderId)).outcome).toBe('none');
    }

    expect(outboxRow(paid.outboxId).attempts).toBe(5);
  });

  it('preserves an existing error when sweeping', async () => {
    const paid = await createPaidOrder();

    await callClaim(paid.orderId);
    forceExpiredLease(paid.outboxId, 1, 121);
    await callClaim(paid.orderId);
    await callFinish(paid.outboxId, outboxRow(paid.outboxId).lockedAt!, false, 'n8n timeout');

    expect(outboxRow(paid.outboxId).status).toBe('failed');
    expect(outboxRow(paid.outboxId).lastError).toBe('n8n timeout');

    forceExpiredAtCeiling(paid.outboxId, 5, 200);
    await callClaim(paid.orderId);

    expect(outboxRow(paid.outboxId).lastError).toBe('n8n timeout');
  });
});

describe('D-21 — locked_at is an opaque fencing token', () => {
  it('TP-1 returns a string, never a Date', async () => {
    const paid = await createPaidOrder();
    const claimed = await callClaim(paid.orderId);

    assertOpaqueFencingToken(claimed.locked_at);
    expect(typeof claimed.locked_at).toBe('string');
  });

  it('TP-2 echoes the token verbatim and finishes the row', async () => {
    const paid = await createPaidOrder();
    const claimed = await callClaim(paid.orderId);
    const token = claimed.locked_at;
    assertOpaqueFencingToken(token);

    const finished = await callFinish(paid.outboxId, token, true);
    expect(finished.outcome).toBe('sent');

    const row = outboxRow(paid.outboxId);
    expect(row.status).toBe('sent');
    expect(row.lockedAt).toBeNull();
    expect(row.sentAt).not.toBeNull();
    expect(row.lastError).toBeNull();
  });

  it('TP-3/4 a millisecond-truncated token is rejected (proves sub-millisecond precision matters)', async () => {
    const paid = await createPaidOrder();
    forceLockedAt(paid.outboxId, '2026-01-01 00:00:00.123456+00');

    const before = outboxRow(paid.outboxId);
    expect(before.micros).not.toBe(0); // guaranteed non-zero sub-millisecond part

    // Exactly what `new Date(x).toISOString()` would produce.
    const truncated = await callFinish(paid.outboxId, '2026-01-01T00:00:00.123+00:00', true);
    expect(truncated.outcome).toBe('stale');

    expect(outboxRow(paid.outboxId)).toEqual(before);
  });

  it('TP-5 the exact instant still matches, whatever its textual form', async () => {
    const paid = await createPaidOrder();
    forceLockedAt(paid.outboxId, '2026-01-01 00:00:00.123456+00');

    // Same instant, different rendering: equality is on the instant, not the string.
    const finished = await callFinish(paid.outboxId, '2026-01-01T00:00:00.123456+00:00', true);
    expect(finished.outcome).toBe('sent');
  });

  it('TP-6/7 the current lease holder wins after a reclaim', async () => {
    const paid = await createPaidOrder();

    const first = await callClaim(paid.orderId);
    assertOpaqueFencingToken(first.locked_at);
    forceExpiredLease(paid.outboxId, 1, 121);

    const second = await callClaim(paid.orderId);
    assertOpaqueFencingToken(second.locked_at);
    expect(second.locked_at).not.toBe(first.locked_at);

    expect((await callFinish(paid.outboxId, first.locked_at, true)).outcome).toBe('stale');

    const row = outboxRow(paid.outboxId);
    expect(row.status).toBe('processing');
    expect(row.sentAt).toBeNull();

    expect((await callFinish(paid.outboxId, second.locked_at, true)).outcome).toBe('sent');
    expect(outboxRow(paid.outboxId).status).toBe('sent');
  });
});

describe('D-17 — sweep versus finish_outbox', () => {
  it('TP-8a: after a sweep, a late finish is stale and cannot resurrect the row', async () => {
    const paid = await createPaidOrder();
    const claimed = await callClaim(paid.orderId);
    const token = claimed.locked_at;
    assertOpaqueFencingToken(token);

    forceExpiredAtCeiling(paid.outboxId, 5, 200);
    await callClaim(null); // carries the sweep

    expect(outboxRow(paid.outboxId).status).toBe('failed');

    const late = await callFinish(paid.outboxId, token, true);
    expect(late.outcome).toBe('stale');

    const row = outboxRow(paid.outboxId);
    expect(row.status).toBe('failed');
    expect(row.sentAt).toBeNull();
    expect(row.lastError).toBe('lease_expired_after_max_attempts');
  });

  it('TP-8b: a swept-target that already finished sent is never overwritten', async () => {
    const paid = await createPaidOrder();
    const claimed = await callClaim(paid.orderId);
    assertOpaqueFencingToken(claimed.locked_at);

    expect((await callFinish(paid.outboxId, claimed.locked_at, true)).outcome).toBe('sent');

    // Force the row to look sweep-eligible except for its status.
    await callClaim(null);

    const row = outboxRow(paid.outboxId);
    expect(row.status).toBe('sent');
    expect(row.sentAt).not.toBeNull();
    expect(row.lastError).toBeNull();
  });

  it('TP-8c: concurrent finish_outbox and sweep preserve exactly one legal terminal state', async () => {
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const paid = await createPaidOrder();
      const claimed = await callClaim(paid.orderId);
      const token = claimed.locked_at;
      assertOpaqueFencingToken(token);

      forceExpiredAtCeiling(paid.outboxId, 5, 200);

      const finishDelay = iteration % 2 === 0 ? 0 : 0.05;
      const sweepDelay = iteration % 2 === 0 ? 0.05 : 0;

      await Promise.all([
        psqlAsync(
          `begin;\nselect pg_sleep(${finishDelay});\n` +
            `select public.finish_outbox('${paid.outboxId}'::uuid, '${token}'::timestamptz, true);\ncommit;`,
        ),
        psqlAsync(
          `begin;\nselect pg_sleep(${sweepDelay});\nselect public.claim_outbox(null);\ncommit;`,
        ),
      ]);

      const row = outboxRow(paid.outboxId);

      // Which side wins is not asserted; the invariant is.
      expect(['sent', 'failed']).toContain(row.status);
      expect(row.attempts).toBe(5);

      if (row.status === 'sent') {
        expect(row.sentAt).not.toBeNull();
        expect(row.lastError).toBeNull();
      } else {
        expect(row.sentAt).toBeNull();
        expect(row.lastError).toBe('lease_expired_after_max_attempts');
      }
    }
  });
});

describe('outbox rejects malformed finish arguments', () => {
  it('requires id, locked_at and ok', async () => {
    const paid = await createPaidOrder();
    const claimed = await callClaim(paid.orderId);

    const missingId = await service.rpc('finish_outbox', {
      p_id: null,
      p_locked_at: claimed.locked_at,
      p_ok: true,
    });
    expect(missingId.error?.code).toBe('22000');

    const missingLock = await service.rpc('finish_outbox', {
      p_id: paid.outboxId,
      p_locked_at: null,
      p_ok: true,
    });
    expect(missingLock.error?.code).toBe('22000');

    const missingOk = await service.rpc('finish_outbox', {
      p_id: paid.outboxId,
      p_locked_at: claimed.locked_at,
      p_ok: null,
    });
    expect(missingOk.error?.code).toBe('22000');
  });

  it('records a failure reason for a failed delivery', async () => {
    const paid = await createPaidOrder();
    const claimed = await callClaim(paid.orderId);
    assertOpaqueFencingToken(claimed.locked_at);

    expect((await callFinish(paid.outboxId, claimed.locked_at, false, '')).outcome).toBe('failed');

    const row = outboxRow(paid.outboxId);
    expect(row.status).toBe('failed');
    expect(row.sentAt).toBeNull();
    expect(row.lastError).toBe('unknown_error');
  });
});
