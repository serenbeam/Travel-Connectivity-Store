import { randomBytes, randomInt } from 'node:crypto';

/**
 * Identifiers generated in Node and handed to `create_order_idempotent` (ADR-6: the SQL
 * function never creates, hashes, or encrypts anything).
 *
 * Shapes are enforced twice: here and by database CHECKs
 * (`orders_number_format_chk`, `payments_reference_len_chk`).
 */

/** Excludes look-alike characters so a customer can read the number aloud. */
const ORDER_NUMBER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** `RML-4KQ9ZT` — display only, never an authorization factor. */
export function newOrderNumber(): string {
  let suffix = '';

  for (let index = 0; index < 6; index += 1) {
    suffix += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  }

  return `RML-${suffix}`;
}

/** `mock_` + 24 lowercase hex characters (29 chars, inside the 8..64 range). */
export function newProviderReference(): string {
  return `mock_${randomBytes(12).toString('hex')}`;
}
