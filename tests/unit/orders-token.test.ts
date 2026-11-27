import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { newOrderNumber, newProviderReference } from '@/modules/orders/ids';
import {
  SealedTokenError,
  generateCapabilityToken,
  hashCapabilityToken,
  sealCapabilityToken,
  sealingKeyFromBase64,
  unsealCapabilityToken,
} from '@/modules/orders/token';

const KEY = randomBytes(32);

describe('capability token — generation and hashing', () => {
  it('generates a 43-character base64url token', () => {
    const token = generateCapabilityToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(Array.from({ length: 50 }, generateCapabilityToken)).size).toBe(50);
  });

  it('hashes to 64 lowercase hex characters, deterministically', () => {
    const token = generateCapabilityToken();

    expect(hashCapabilityToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCapabilityToken(token)).toBe(hashCapabilityToken(token));
    expect(hashCapabilityToken(token)).not.toBe(hashCapabilityToken(generateCapabilityToken()));
  });
});

describe('capability token — AES-256-GCM sealing', () => {
  it('round-trips the token', () => {
    const token = generateCapabilityToken();
    const sealed = sealCapabilityToken(token, KEY);

    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(unsealCapabilityToken(sealed, KEY)).toBe(token);
  });

  it('uses a fresh IV per row, so the same token seals differently', () => {
    const token = generateCapabilityToken();

    expect(sealCapabilityToken(token, KEY)).not.toBe(sealCapabilityToken(token, KEY));
  });

  it('rejects a different key (rotation) instead of returning garbage', () => {
    const sealed = sealCapabilityToken(generateCapabilityToken(), KEY);

    expect(() => unsealCapabilityToken(sealed, randomBytes(32))).toThrow(SealedTokenError);
  });

  it('rejects tampered ciphertext', () => {
    const token = generateCapabilityToken();
    const sealedParts = sealCapabilityToken(token, KEY).split('.');
    const [version, iv, tag, ciphertext] = sealedParts;

    if (!version || !iv || !tag || !ciphertext) {
      throw new Error('unexpected seal shape');
    }

    const flipped = ciphertext.startsWith('A') ? 'B' : 'A';
    const tampered = [version, iv, tag, flipped + ciphertext.slice(1)].join('.');

    expect(() => unsealCapabilityToken(tampered, KEY)).toThrow(SealedTokenError);
  });

  it('rejects malformed blobs', () => {
    for (const value of ['', 'v1', 'v2.a.b.c', 'v1.a.b', 'v1.!!.!!.!!']) {
      expect(() => unsealCapabilityToken(value, KEY), value).toThrow(SealedTokenError);
    }
  });
});

describe('sealing key', () => {
  it('accepts a base64 value that decodes to 32 bytes', () => {
    expect(sealingKeyFromBase64(KEY.toString('base64')).byteLength).toBe(32);
  });

  it('rejects a key of the wrong length', () => {
    expect(() => sealingKeyFromBase64(randomBytes(16).toString('base64'))).toThrow(
      SealedTokenError,
    );
  });
});

describe('order identifiers', () => {
  it('builds RML-XXXXXX order numbers', () => {
    const numbers = Array.from({ length: 50 }, newOrderNumber);

    for (const number of numbers) {
      expect(number).toMatch(/^RML-[A-Z0-9]{6}$/);
    }
    expect(new Set(numbers).size).toBe(50);
  });

  it('builds mock_ + 24 hex provider references', () => {
    const references = Array.from({ length: 20 }, newProviderReference);

    for (const reference of references) {
      expect(reference).toMatch(/^mock_[0-9a-f]{24}$/);
      expect(reference.length).toBeGreaterThanOrEqual(8);
      expect(reference.length).toBeLessThanOrEqual(64);
    }
    expect(new Set(references).size).toBe(20);
  });
});
