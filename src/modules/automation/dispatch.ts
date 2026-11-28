import { ZodError, z } from 'zod';

import { logWarn } from '@/lib/logger';

import type { N8nSendResult } from './n8n.client';
import type { OutboxState } from './outbox-queries';
import { parseOutboxPayload, toWirePayload, type WirePayload } from './payload';

/**
 * Outbox dispatcher (FR-N2, ADR-9).
 *
 * One dispatch is: claim → read payload → send → fenced finish. The database RPCs own the
 * concurrency guarantees (`FOR UPDATE SKIP LOCKED`, `locked_at` fencing, the 5-attempt
 * ceiling); this module only sequences them and never writes order/payment status.
 *
 * Failure rules:
 * - once a claim is held, EVERY error path makes a fenced `finish_outbox` attempt, so a row
 *   does not sit in `processing` until its lease expires for want of trying;
 * - a `stale` finish means a newer claim owns the row: nothing is overwritten;
 * - a notification failure is never reported as a payment failure.
 */
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_LEASE_MS = 120_000;

export type ClaimOutcome =
  | { outcome: 'claimed'; notificationId: string; attempts: number; lockedAt: string }
  | { outcome: 'none' };

export type FinishOutcome = 'sent' | 'failed' | 'stale';

/**
 * Eligibility for the admin "Resend" action, shared by the endpoint and the admin list UI
 * so the rendering rule can never drift from the rule the endpoint enforces.
 *
 * `in_flight` is only reported while the claim still holds its 120 s lease; an expired
 * `processing` row is legitimately resendable again (that is the crash-recovery path).
 */
export type ResendEligibility =
  | 'eligible'
  | 'already_sent'
  | 'in_flight'
  | 'max_attempts'
  | 'order_not_paid';

/** The subset of outbox state the eligibility rule needs (no payload, no order UUID). */
export interface ResendEligibilityInput {
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  lockedAt: string | null;
  orderStatus: 'pending' | 'paid' | 'failed';
}

export function resendEligibility(state: ResendEligibilityInput): ResendEligibility {
  if (state.orderStatus !== 'paid') {
    return 'order_not_paid';
  }

  if (state.status === 'sent') {
    return 'already_sent';
  }

  if (state.attempts >= OUTBOX_MAX_ATTEMPTS) {
    // Terminal for dispatch by design; recovery is the documented operator runbook.
    return 'max_attempts';
  }

  if (state.status === 'processing' && isWithinLease(state.lockedAt)) {
    return 'in_flight';
  }

  return 'eligible';
}

/**
 * Advisory UI state for the admin order list. `null` (no outbox row) is not resendable.
 * The value is a hint only: the endpoint re-reads the state and re-claims, and `claim_outbox`
 * remains the final authority.
 */
export function canResendNotification(state: ResendEligibilityInput | null): boolean {
  return state !== null && resendEligibility(state) === 'eligible';
}

export interface DispatchDeps {
  claim(orderId: string): Promise<ClaimOutcome>;
  readPayload(notificationId: string): Promise<unknown | null>;
  readState(orderId: string): Promise<OutboxState | null>;
  send(payload: WirePayload): Promise<N8nSendResult>;
  finish(
    notificationId: string,
    /** Opaque fencing token, echoed verbatim (never converted to a Date). */
    lockedAt: string,
    ok: boolean,
    error: string | null,
  ): Promise<FinishOutcome>;
}

export type DispatchOutcome =
  | { kind: 'sent'; notificationId: string; attempts: number }
  | { kind: 'failed'; notificationId: string; attempts: number; error: string }
  | { kind: 'stale'; notificationId: string; attempts: number }
  | { kind: 'none' }
  | { kind: 'error'; error: string };

export type ResendOutcome =
  | DispatchOutcome
  | { kind: 'skipped'; reason: 'no_outbox' | 'order_not_paid' | 'already_sent' | 'max_attempts' }
  | { kind: 'in_flight' };

const claimResultSchema = z.union([
  z.strictObject({ outcome: z.literal('none') }),
  z.strictObject({
    outcome: z.literal('claimed'),
    id: z.uuid(),
    order_id: z.uuid(),
    attempts: z.int().min(1).max(OUTBOX_MAX_ATTEMPTS),
    locked_at: z.string().min(1),
  }),
]);

const finishResultSchema = z.strictObject({
  outcome: z.enum(['sent', 'failed', 'stale']),
});

/**
 * Real wiring, imported lazily so unit tests can use this module without the server-only
 * Supabase admin client or any environment variable.
 */
async function createDefaultDeps(): Promise<DispatchDeps> {
  const [{ createAdminClient }, queries, { createN8nClient }] = await Promise.all([
    import('@/lib/supabase/admin'),
    import('./outbox-queries'),
    import('./n8n.client'),
  ]);

  const client = createN8nClient();

  return {
    async claim(orderId) {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc('claim_outbox', { p_order_id: orderId });

      if (error) {
        // Code only: the message can echo arguments, and this string may be logged.
        throw new Error(`claim_outbox failed (${error.code ?? 'unknown'})`);
      }

      const parsed = claimResultSchema.safeParse(data);

      if (!parsed.success) {
        throw new Error('claim_outbox returned an unexpected shape');
      }

      if (parsed.data.outcome === 'none') {
        return { outcome: 'none' };
      }

      return {
        outcome: 'claimed',
        notificationId: parsed.data.id,
        attempts: parsed.data.attempts,
        lockedAt: parsed.data.locked_at,
      };
    },

    readPayload: (notificationId) => queries.getOutboxPayloadById(notificationId),
    readState: (orderId) => queries.getOutboxStateByOrderId(orderId),
    send: (payload) => client.send(payload),

    async finish(notificationId, lockedAt, ok, error) {
      const admin = createAdminClient();
      const { data, error: rpcError } = await admin.rpc('finish_outbox', {
        p_id: notificationId,
        p_locked_at: lockedAt,
        p_ok: ok,
        p_error: error,
      });

      if (rpcError) {
        throw new Error(`finish_outbox failed (${rpcError.code ?? 'unknown'})`);
      }

      const parsed = finishResultSchema.safeParse(data);

      if (!parsed.success) {
        throw new Error('finish_outbox returned an unexpected shape');
      }

      return parsed.data.outcome;
    },
  };
}

const REQUIRED_DEPS = ['claim', 'readPayload', 'readState', 'send', 'finish'] as const;

/**
 * Builds the real wiring only when at least one dependency is missing, so a caller that
 * injects all five (unit tests) never imports the server-only admin client or any secret.
 */
async function resolveDeps(overrides: Partial<DispatchDeps>): Promise<DispatchDeps> {
  const complete = REQUIRED_DEPS.every((key) => overrides[key] !== undefined);

  if (complete) {
    return overrides as DispatchDeps;
  }

  return { ...(await createDefaultDeps()), ...overrides };
}

/** Dispatches the notification for one order. Never throws to the caller. */
export async function dispatchForOrder(
  orderId: string,
  overrides: Partial<DispatchDeps> = {},
): Promise<DispatchOutcome> {
  const deps = await resolveDeps(overrides);

  let claim: ClaimOutcome;

  try {
    claim = await deps.claim(orderId);
  } catch {
    logWarn('notification: claim failed', { operation: 'claim_outbox' });

    return { kind: 'error', error: 'claim_unavailable' };
  }

  if (claim.outcome === 'none') {
    // Nothing claimable: already sent, in flight inside its lease, attempts exhausted, or
    // the order is not paid. All four are legitimate "do nothing" outcomes.
    return { kind: 'none' };
  }

  const { notificationId, attempts, lockedAt } = claim;

  const settle = async (ok: boolean, error: string | null): Promise<DispatchOutcome> => {
    try {
      const outcome = await deps.finish(notificationId, lockedAt, ok, error);

      if (outcome === 'stale') {
        // A newer claim owns the row: it was not recorded and must not be overwritten.
        return { kind: 'stale', notificationId, attempts };
      }

      // Report what this dispatcher actually did, not what the RPC echoed back.
      if (ok) {
        return { kind: 'sent', notificationId, attempts };
      }

      return { kind: 'failed', notificationId, attempts, error: error ?? 'unknown_error' };
    } catch {
      // The claim stays in `processing`; the 120 s lease makes the row reclaimable and the
      // attempts ceiling keeps that bounded. Reported as failed, never as sent.
      logWarn('notification: finish failed', { operation: 'finish_outbox' });

      return { kind: 'failed', notificationId, attempts, error: error ?? 'finish_unavailable' };
    }
  };

  let payload: WirePayload;

  try {
    const raw = await deps.readPayload(notificationId);

    if (raw === null) {
      return await settle(false, 'payload_unavailable');
    }

    payload = toWirePayload(parseOutboxPayload(raw));
  } catch (error) {
    const code = error instanceof ZodError ? 'invalid_payload' : 'payload_unavailable';

    return await settle(false, code);
  }

  let result: N8nSendResult;

  try {
    result = await deps.send(payload);
  } catch {
    return await settle(false, 'n8n_network');
  }

  return result.ok ? settle(true, null) : settle(false, result.error);
}

/** True while a claim still holds its 120 s lease (advisory; `claim_outbox` is authoritative). */
export function isWithinLease(lockedAt: string | null, now: number = Date.now()): boolean {
  if (lockedAt === null) {
    return false;
  }

  const locked = Date.parse(lockedAt);

  if (Number.isNaN(locked)) {
    // Unparsable token: treat as expired rather than blocking the resend; the claim decides.
    return false;
  }

  return now - locked < OUTBOX_LEASE_MS;
}

/**
 * Admin resend path (FR-A10, AC-T12).
 *
 * The state read produces a fast, explicit answer for the operator (`409 in flight`,
 * `202 already sent / ceiling reached / not paid`) but it is **not** the concurrency guard:
 * the subsequent `claim_outbox` still decides, so a stale read can never cause a double
 * delivery — at worst the claim returns `none`. The rule itself lives in
 * `resendEligibility()` so the admin list shows the same answer the endpoint will give.
 */
export async function resendForOrder(
  orderId: string,
  overrides: Partial<DispatchDeps> = {},
): Promise<ResendOutcome> {
  const deps = await resolveDeps(overrides);

  let state: OutboxState | null;

  try {
    state = await deps.readState(orderId);
  } catch {
    return { kind: 'error', error: 'state_unavailable' };
  }

  if (state === null) {
    return { kind: 'skipped', reason: 'no_outbox' };
  }

  switch (resendEligibility(state)) {
    case 'order_not_paid':
      return { kind: 'skipped', reason: 'order_not_paid' };
    case 'already_sent':
      return { kind: 'skipped', reason: 'already_sent' };
    case 'max_attempts':
      return { kind: 'skipped', reason: 'max_attempts' };
    case 'in_flight':
      return { kind: 'in_flight' };
    case 'eligible':
      return dispatchForOrder(orderId, overrides);
  }
}
