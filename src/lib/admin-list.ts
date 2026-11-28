/**
 * Admin list primitives: page size, range presets, Asia/Jakarta day boundary, and the
 * opaque keyset cursor. Pure functions only — no Supabase, no request context — so they are
 * unit-testable and cannot smuggle a value into a filter by accident.
 *
 * Contract: docs/api-contract.md §1 (keyset `(createdAt, id)` descending, page size 10),
 * §5.4 (`range` = 24h | 7d | 30d, default 7d), NFR3, AC-A5, AC-A7.
 *
 * Deviation recorded in WORK_TRACKER: the cursor is base64**url** rather than plain base64,
 * because `+` and `/` are unsafe inside a query parameter.
 */

export const PAGE_SIZE = 10;

export type RangePreset = '24h' | '7d' | '30d';

export const RANGE_PRESETS: readonly RangePreset[] = ['24h', '7d', '30d'];
export const DEFAULT_RANGE: RangePreset = '7d';

const RANGE_MS: Record<RangePreset, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function isRangePreset(value: unknown): value is RangePreset {
  return typeof value === 'string' && (RANGE_PRESETS as readonly string[]).includes(value);
}

/** Explicit but unrecognised values are a client error; the caller returns 422. */
export function parseRangePreset(raw: string | null | undefined): RangePreset | null {
  if (raw === null || raw === undefined || raw === '') {
    return DEFAULT_RANGE;
  }

  return isRangePreset(raw) ? raw : null;
}

/** Start of the range as an ISO-8601 UTC instant. */
export function rangeStartIso(preset: RangePreset, now: Date = new Date()): string {
  return new Date(now.getTime() - RANGE_MS[preset]).toISOString();
}

/** WIB is UTC+07:00 all year; there is no DST to account for. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * The UTC instant that corresponds to 00:00 Asia/Jakarta on the WIB day containing `now`.
 *
 * `toISOString().slice(0, 10)` would return the UTC day, which is wrong for the 7 hours
 * between 00:00 and 07:00 WIB (FR-A3 "orders today", AC-A7).
 */
export function startOfWibDay(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );

  return new Date(midnightUtc - WIB_OFFSET_MS);
}

export interface KeysetCursor {
  createdAt: string;
  id: string;
}

const ISO_INSTANT_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)(Z|[+-]\d{2}:\d{2})$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalises a shape-valid instant to a UTC `…Z` literal and keeps microsecond precision.
 *
 * A zero offset is rewritten textually (`+00:00` -> `Z`), so the fractional seconds Postgres
 * emitted survive untouched. A non-zero offset — which this database never returns, since
 * `timestamptz` is serialised in UTC — falls back to `Date`, which can only carry
 * milliseconds. Either way the result is a single valid UTC instant; an impossible date such
 * as `2026-13-45T99:99:99Z` is rejected instead of being forwarded to PostgREST.
 */
export function toUtcInstant(value: string): string | null {
  const match = ISO_INSTANT_PATTERN.exec(value);

  if (match === null) {
    return null;
  }

  const [, base, offset] = match;
  const normalized = offset === 'Z' || offset === '+00:00' || offset === '-00:00'
    ? `${base}Z`
    : new Date(value).toISOString();

  // Shape alone is not enough: `2026-13-45T99:99:99Z` matches the pattern. Reject anything JS
  // would silently roll over, so an impossible instant never reaches PostgREST.
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const [datePart = '', timePart = ''] = normalized.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, secondPart = '0'] = timePart.replace('Z', '').split(':');
  const second = Math.floor(Number(secondPart));

  const roundTrips =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === Number(hour) &&
    parsed.getUTCMinutes() === Number(minute) &&
    parsed.getUTCSeconds() === second;

  return roundTrips ? normalized : null;
}

/**
 * A cursor is decodable by anyone (it is a URL parameter), so both halves are re-validated
 * against fixed charsets before they reach a filter. The timestamp is additionally normalised
 * to a UTC `…Z` literal with no `+`, so it can never be misread as a space in a query string.
 * A rejected cursor returns `null` and the caller answers 422 instead of silently starting
 * from page one.
 */
export function decodeCursor(raw: string | null | undefined): KeysetCursor | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  let decoded: string;

  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const separator = decoded.indexOf('|');

  if (separator <= 0 || decoded.indexOf('|', separator + 1) !== -1) {
    return null;
  }

  const createdAt = toUtcInstant(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);

  if (createdAt === null || !UUID_PATTERN.test(id)) {
    return null;
  }

  return { createdAt, id };
}

/**
 * PostgREST keyset predicate for `(created_at, id)` descending.
 *
 * Both values are double-quoted: PostgREST treats a quoted value inside `or=(…)` as opaque, so
 * no character of an instant can ever be read as filter syntax. The timestamp is normalised
 * again here (`+00:00` -> `Z`) because this function is the single place that builds the
 * expression — even a cursor that skipped `decodeCursor()` cannot smuggle a `+` that a query
 * string would read as a space.
 */
export function keysetFilter(cursor: KeysetCursor): string {
  const createdAt = toUtcInstant(cursor.createdAt);

  if (createdAt === null || !UUID_PATTERN.test(cursor.id)) {
    // Unreachable through the API: decodeCursor() already proved both halves.
    throw new TypeError('keysetFilter expects a decoded cursor');
  }

  return `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt."${cursor.id}")`;
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, 'utf8').toString('base64url');
}

/**
 * `nextCursor` is only issued when a full page was returned, so the last page never links
 * to an empty page.
 */
export function nextCursorOf<T extends { createdAt: string; id: string }>(
  rows: readonly T[],
): string | null {
  if (rows.length < PAGE_SIZE) {
    return null;
  }

  const last = rows[rows.length - 1];

  return last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;
}
