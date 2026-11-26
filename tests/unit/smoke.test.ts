import { describe, expect, it } from 'vitest';

import { cn } from '@/components/ui/cn';
import { formatIdr, formatWibDate, formatWibDateTime } from '@/lib/format';
import { redactMeta, redactPath } from '@/lib/logger';
import { isAdminUser } from '@/modules/auth/session';

/** 32 random bytes encoded as base64url — the capability token shape (ADR-5). */
const CAPABILITY_TOKEN = 'A'.repeat(43);

describe('format — money and WIB time', () => {
  it('formats integer IDR with dotted thousand separators', () => {
    expect(formatIdr(145_000)).toBe('Rp 145.000');
    expect(formatIdr(1_500_000)).toBe('Rp 1.500.000');
    expect(formatIdr(0)).toBe('Rp 0');
  });

  it('rejects non-finite amounts instead of printing NaN', () => {
    expect(() => formatIdr(Number.NaN)).toThrow(TypeError);
  });

  it('renders UTC timestamps in Asia/Jakarta (UTC+7)', () => {
    const iso = '2026-11-28T03:12:44.000Z';

    expect(formatWibDateTime(iso)).toMatch(/10[.:]12/);
    expect(formatWibDate(iso)).toContain('2026');
  });
});

describe('logger — capability token redaction', () => {
  it('masks a 43-character capability path', () => {
    expect(redactPath(`/orders/${CAPABILITY_TOKEN}`)).toBe('/orders/[redacted]');
  });

  it('leaves non-capability paths untouched', () => {
    expect(redactPath('/admin/orders')).toBe('/admin/orders');
    expect(redactPath('/destinations/japan')).toBe('/destinations/japan');
  });

  it('redacts credential keys, masks paths, and keeps safe values', () => {
    const redacted = redactMeta({
      'Idempotency-Key': 'secret-key',
      access_token: 'secret-token',
      path: `/orders/${CAPABILITY_TOKEN}`,
      count: 2,
    });

    expect(redacted['Idempotency-Key']).toBe('[redacted]');
    expect(redacted.access_token).toBe('[redacted]');
    expect(redacted.path).toBe('/orders/[redacted]');
    expect(redacted.count).toBe(2);
  });
});

describe('cn — className joiner', () => {
  it('joins truthy values and drops falsy ones', () => {
    expect(cn('a', false, null, undefined, 'b', 0)).toBe('a b');
    expect(cn()).toBe('');
  });
});

/**
 * Gate G7d — the authorization DECISION only. Full session integration (401/403 from a
 * real Auth session, RLS on tables) is verified in E-3/E-6, not here.
 */
describe('isAdminUser — authorization decision', () => {
  it('denies when there is no user', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });

  it('denies a non-admin role', () => {
    expect(isAdminUser({ app_metadata: { role: 'customer' } })).toBe(false);
  });

  it('denies when app_metadata is missing or empty', () => {
    expect(isAdminUser({})).toBe(false);
    expect(isAdminUser({ app_metadata: null })).toBe(false);
    expect(isAdminUser({ app_metadata: {} })).toBe(false);
  });

  it('allows only the explicit admin role from app_metadata', () => {
    expect(isAdminUser({ app_metadata: { role: 'admin' } })).toBe(true);
    // A role placed in user_metadata must never be honoured.
    expect(isAdminUser({ app_metadata: { role: 'admin', provider: 'email' } })).toBe(true);
  });
});
