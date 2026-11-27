/**
 * Assertion helpers shared by the integration suite.
 */

/**
 * Guards the ADR-9 fencing contract: `claim_outbox` returns `locked_at` as an opaque
 * value and it must be echoed to `finish_outbox` verbatim.
 *
 * The token's textual representation is deliberately NOT asserted (no timezone or
 * fractional-digit format is promised). What matters is that it stays a string and is
 * a parseable instant; converting it to a `Date` truncates to milliseconds and breaks
 * the equality check inside `finish_outbox`.
 */
export function assertOpaqueFencingToken(value: unknown): asserts value is string {
  if (value instanceof Date) {
    throw new Error(
      'Fencing token must be the raw string returned by claim_outbox, not a Date ' +
        '(Date truncates microseconds and finish_outbox would report "stale").',
    );
  }

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Fencing token must be a non-empty string, received ${typeof value}.`);
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`Fencing token is not a parseable timestamp: "${value}".`);
  }
}
