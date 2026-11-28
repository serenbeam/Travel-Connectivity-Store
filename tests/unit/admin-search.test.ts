import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseOrdersSearch } from '@/modules/orders/admin-search';

/**
 * Admin order search (G-16, AC-A5).
 *
 * The parser is the only place where `q` is interpreted. Its output is a fixed column plus a
 * value, so the query builder never concatenates user text into a PostgREST filter
 * expression. These cases pin that contract, including the injection payloads that would
 * break an `or=(…)` built by string interpolation.
 */
describe('parseOrdersSearch — accepted shapes', () => {
  it('accepts an order number and uppercases it', () => {
    expect(parseOrdersSearch('RML-4KQ9ZT')).toEqual({ kind: 'order_number', value: 'RML-4KQ9ZT' });
    expect(parseOrdersSearch('rml-4kq9zt')).toEqual({ kind: 'order_number', value: 'RML-4KQ9ZT' });
    expect(parseOrdersSearch('  RML-4KQ9ZT  ')).toEqual({
      kind: 'order_number',
      value: 'RML-4KQ9ZT',
    });
  });

  it('accepts an email address and lowercases it', () => {
    expect(parseOrdersSearch('Budi@Example.com')).toEqual({
      kind: 'customer_email',
      value: 'budi@example.com',
    });
  });

  it('treats a missing or blank value as "no search"', () => {
    expect(parseOrdersSearch(null)).toEqual({ kind: 'none' });
    expect(parseOrdersSearch(undefined)).toEqual({ kind: 'none' });
    expect(parseOrdersSearch('   ')).toEqual({ kind: 'none' });
  });
});

describe('parseOrdersSearch — rejected input', () => {
  it.each([
    'x,customer_email.eq.attacker@example.com',
    'RML-4KQ9ZT)',
    '(RML-4KQ9ZT',
    'RML-4KQ9ZT,or(1.eq.1)',
    '*',
    '%',
    'RML*',
    'budi@example.com%',
    'drop table orders',
    'not-an-order-or-email',
    'a'.repeat(65),
  ])('rejects %j', (payload) => {
    expect(parseOrdersSearch(payload)).toEqual({ kind: 'invalid' });
  });

  it('never returns a value that could carry filter structure', () => {
    const candidates = [
      'RML-4KQ9ZT',
      'budi@example.com',
      'budi+tag@example.co.id',
      "o'brien@example.com",
    ];

    for (const candidate of candidates) {
      const parsed = parseOrdersSearch(candidate);

      expect(parsed.kind).not.toBe('invalid');
      if (parsed.kind === 'order_number' || parsed.kind === 'customer_email') {
        expect(parsed.value).not.toMatch(/[(),"*%\\\s]/);
      }
    }
  });
});

describe('module contract', () => {
  it('does not build a PostgREST or() expression', () => {
    const source = readFileSync(
      new URL('../../src/modules/orders/admin-search.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('.or(');
  });
});
