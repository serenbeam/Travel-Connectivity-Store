import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RANGE,
  PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetFilter,
  nextCursorOf,
  parseRangePreset,
  rangeStartIso,
  startOfWibDay,
  toUtcInstant,
} from '@/lib/admin-list';

/**
 * Admin list primitives (AC-A5, AC-A7).
 *
 * The cursor is a URL parameter that anyone can rewrite, so the interesting cases are the
 * rejected ones: a tampered cursor must never reach a filter expression.
 */
describe('page size', () => {
  it('is fixed at 10 for every admin list', () => {
    expect(PAGE_SIZE).toBe(10);
  });
});

describe('range presets', () => {
  it('accepts the three documented presets', () => {
    expect(parseRangePreset('24h')).toBe('24h');
    expect(parseRangePreset('7d')).toBe('7d');
    expect(parseRangePreset('30d')).toBe('30d');
  });

  it('defaults to 7d when the parameter is absent or empty', () => {
    expect(parseRangePreset(null)).toBe(DEFAULT_RANGE);
    expect(parseRangePreset(undefined)).toBe(DEFAULT_RANGE);
    expect(parseRangePreset('')).toBe(DEFAULT_RANGE);
  });

  it('rejects an unrecognised value instead of silently defaulting', () => {
    expect(parseRangePreset('48h')).toBeNull();
    expect(parseRangePreset('7D')).toBeNull();
    expect(parseRangePreset('../../etc')).toBeNull();
  });

  it('computes the start instant from a fixed now', () => {
    const now = new Date('2026-11-28T03:12:44.000Z');

    expect(rangeStartIso('24h', now)).toBe('2026-11-27T03:12:44.000Z');
    expect(rangeStartIso('7d', now)).toBe('2026-11-21T03:12:44.000Z');
    expect(rangeStartIso('30d', now)).toBe('2026-10-29T03:12:44.000Z');
  });
});

describe('startOfWibDay', () => {
  it('maps a WIB morning to the previous UTC day 17:00', () => {
    // 03:12 UTC = 10:12 WIB on 28 Nov -> WIB day starts 27 Nov 17:00 UTC.
    expect(startOfWibDay(new Date('2026-11-28T03:12:44.000Z')).toISOString()).toBe(
      '2026-11-27T17:00:00.000Z',
    );
  });

  it('treats the exact boundary as the start of the new WIB day', () => {
    expect(startOfWibDay(new Date('2026-11-27T17:00:00.000Z')).toISOString()).toBe(
      '2026-11-27T17:00:00.000Z',
    );
  });

  it('rolls back one day just before the WIB boundary', () => {
    expect(startOfWibDay(new Date('2026-11-27T16:59:59.999Z')).toISOString()).toBe(
      '2026-11-26T17:00:00.000Z',
    );
  });

  it('does not use the UTC date (07:00 WIB is still the same WIB day)', () => {
    // 16:59 UTC on 28 Nov = 23:59 WIB on 28 Nov -> start is 27 Nov 17:00 UTC.
    expect(startOfWibDay(new Date('2026-11-28T16:59:59.000Z')).toISOString()).toBe(
      '2026-11-27T17:00:00.000Z',
    );
  });
});

describe('keyset cursor', () => {
  const cursor = { createdAt: '2026-11-28T03:11:02.123456Z', id: '8d7c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b' };

  it('round-trips without URL-unsafe characters', () => {
    const encoded = encodeCursor(cursor);

    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it('rejects a tampered payload with filter structure', () => {
    const tampered = Buffer.from(
      '2026-11-28T03:11:02.000Z|8d7c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b),or(created_at.gt.1970-01-01',
      'utf8',
    ).toString('base64url');

    expect(decodeCursor(tampered)).toBeNull();
  });

  it('rejects a payload with an extra separator', () => {
    const encoded = Buffer.from('2026-11-28T03:11:02.000Z|abc|def', 'utf8').toString('base64url');

    expect(decodeCursor(encoded)).toBeNull();
  });

  it('rejects a non-ISO instant or non-UUID id', () => {
    const badDate = Buffer.from('yesterday|8d7c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b', 'utf8').toString(
      'base64url',
    );
    const badId = Buffer.from('2026-11-28T03:11:02.000Z|not-a-uuid', 'utf8').toString('base64url');

    expect(decodeCursor(badDate)).toBeNull();
    expect(decodeCursor(badId)).toBeNull();
  });

  it('treats an absent cursor as "first page"', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('issues a next cursor only for a full page', () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, index) => ({
      createdAt: `2026-11-28T03:1${index % 10}:02.000Z`,
      id: `8d7c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a${String(index).padStart(2, '0')}`,
    }));

    const next = nextCursorOf(rows);

    expect(next).not.toBeNull();
    expect(decodeCursor(next)).toEqual({
      createdAt: rows[PAGE_SIZE - 1]?.createdAt,
      id: rows[PAGE_SIZE - 1]?.id,
    });
    expect(nextCursorOf(rows.slice(0, PAGE_SIZE - 1))).toBeNull();
    expect(nextCursorOf([])).toBeNull();
  });
});

/**
 * KI-35 regression: PostgREST serialises `timestamptz` with a numeric offset
 * (`2026-11-28T04:39:30.63532+00:00`), so the cursor the server mints for itself contains
 * `+00:00`. Before the fix that cursor was rejected with 422 and page 2 was unreachable.
 */
describe('toUtcInstant', () => {
  it('keeps a Z instant untouched, including microseconds', () => {
    expect(toUtcInstant('2026-11-28T04:39:30.63532Z')).toBe('2026-11-28T04:39:30.63532Z');
  });

  it('normalises a zero offset to Z without losing precision', () => {
    expect(toUtcInstant('2026-11-28T04:39:30.63532+00:00')).toBe('2026-11-28T04:39:30.63532Z');
    expect(toUtcInstant('2026-11-28T04:39:30.63532-00:00')).toBe('2026-11-28T04:39:30.63532Z');
  });

  it('converts a non-zero offset to the same UTC instant', () => {
    expect(toUtcInstant('2026-11-28T11:39:30.500+07:00')).toBe('2026-11-28T04:39:30.500Z');
  });

  it('rejects an impossible calendar instant instead of forwarding it', () => {
    expect(toUtcInstant('2026-13-45T99:99:99Z')).toBeNull();
    expect(toUtcInstant('2026-02-30T00:00:00Z')).toBeNull();
    expect(toUtcInstant('2026-11-28T04:39:30')).toBeNull();
    expect(toUtcInstant('yesterday')).toBeNull();
  });
});

describe('decodeCursor — PostgREST offset cursors (KI-35)', () => {
  const id = '8d7c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

  function cursorFor(createdAt: string): string {
    return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
  }

  it('accepts the exact cursor shape the server mints from a list response', () => {
    const raw = cursorFor('2026-11-28T04:39:30.63532+00:00');

    expect(decodeCursor(raw)).toEqual({ createdAt: '2026-11-28T04:39:30.63532Z', id });
  });

  it('still rejects a tampered payload that carries an offset', () => {
    const tampered = cursorFor('2026-11-28T04:39:30.63532+00:00),or(created_at.gt.1970-01-01');

    expect(decodeCursor(tampered)).toBeNull();
  });

  it('still rejects an impossible instant, a bad uuid, or extra separators', () => {
    expect(decodeCursor(cursorFor('2026-13-45T99:99:99+00:00'))).toBeNull();
    expect(
      decodeCursor(Buffer.from('2026-11-28T04:39:30.63532Z|not-a-uuid', 'utf8').toString('base64url')),
    ).toBeNull();
    expect(
      decodeCursor(Buffer.from('2026-11-28T04:39:30Z|a|b', 'utf8').toString('base64url')),
    ).toBeNull();
  });
});

describe('keysetFilter', () => {
  it('quotes both values so no instant character can become filter syntax', () => {
    const filter = keysetFilter({
      createdAt: '2026-11-28T04:39:30.63532Z',
      id: '8d7c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
    });

    expect(filter).toBe(
      'created_at.lt."2026-11-28T04:39:30.63532Z",and(created_at.eq."2026-11-28T04:39:30.63532Z",id.lt."8d7c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b")',
    );
  });

  it('carries no bare + that a query string could read as a space', () => {
    const filter = keysetFilter({
      createdAt: '2026-11-28T04:39:30.63532+00:00',
      id: '8d7c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
    });

    expect(filter).not.toContain('+');
  });
});
