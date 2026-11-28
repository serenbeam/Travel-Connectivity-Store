import { z } from 'zod';

/**
 * Admin order search parser (api-contract §5.4: exact match on `order_number` or
 * `customer_email`).
 *
 * SECURITY (G-16): the raw `q` is NEVER interpolated into a PostgREST `or=(…)` expression.
 * This parser classifies the input into one of two fixed shapes, and the query builder then
 * uses a single `.eq(column, value)` — so user input can only ever be a *value*, never part
 * of the filter structure. Anything that is neither an order number nor an email address is
 * rejected with 422 instead of being "cleaned up" and guessed at.
 */

export const ORDER_NUMBER_PATTERN = /^RML-[A-Z0-9]{6}$/;
export const MAX_SEARCH_LENGTH = 64;

/** Structural characters of a PostgREST filter expression, plus LIKE wildcards. */
const FORBIDDEN_STRUCTURE_CHARS = /[()"*%\\,\s]/;

const emailSchema = z.email();

export type OrdersSearch =
  | { kind: 'none' }
  | { kind: 'order_number'; value: string }
  | { kind: 'customer_email'; value: string }
  | { kind: 'invalid' };

export function parseOrdersSearch(raw: string | null | undefined): OrdersSearch {
  if (raw === null || raw === undefined) {
    return { kind: 'none' };
  }

  const value = raw.trim();

  if (value === '') {
    return { kind: 'none' };
  }

  if (value.length > MAX_SEARCH_LENGTH || FORBIDDEN_STRUCTURE_CHARS.test(value)) {
    return { kind: 'invalid' };
  }

  const upper = value.toUpperCase();

  if (ORDER_NUMBER_PATTERN.test(upper)) {
    return { kind: 'order_number', value: upper };
  }

  if (emailSchema.safeParse(value).success) {
    // `orders.customer_email` is stored lowercased (database-design §2.3).
    return { kind: 'customer_email', value: value.toLowerCase() };
  }

  return { kind: 'invalid' };
}
