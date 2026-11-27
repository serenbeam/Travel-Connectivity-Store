import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Guest capability token helpers (ADR-5, ADR-6).
 *
 * Pure functions on purpose: the sealing key is passed in, so this module never imports
 * the server environment and can be unit-tested without `server-only` / env fixtures.
 * The plaintext token exists only in the checkout response and in the customer's browser;
 * the database stores the SHA-256 hash plus the sealed copy used for idempotent replay.
 */

const SEAL_VERSION = 'v1';
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256

export class SealedTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SealedTokenError';
  }
}

/** Decodes `IDEMPOTENCY_TOKEN_KEY` (base64 of exactly 32 bytes). */
export function sealingKeyFromBase64(value: string): Buffer {
  const key = Buffer.from(value, 'base64');

  if (key.byteLength !== KEY_BYTES) {
    throw new SealedTokenError(
      `IDEMPOTENCY_TOKEN_KEY must decode to ${KEY_BYTES} bytes (got ${key.byteLength}).`,
    );
  }

  return key;
}

/** 32 random bytes base64url = 43 characters — the capability token shape. */
export function generateCapabilityToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex (64 chars) — the only form of the token that is stored. */
export function hashCapabilityToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** `v1.<iv>.<tag>.<ct>` with base64url parts, per ADR-6. */
export function sealCapabilityToken(token: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    SEAL_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Reverses {@link sealCapabilityToken}. Throws `SealedTokenError` when the blob is
 * malformed, tampered with, or was sealed under a different key (key rotation).
 * Callers map that to `409 IDEMPOTENCY_REPLAY_UNAVAILABLE`.
 */
export function unsealCapabilityToken(sealed: string, key: Buffer): string {
  const parts = sealed.split('.');
  const [version, ivPart, tagPart, ciphertextPart] = parts;

  if (parts.length !== 4 || version !== SEAL_VERSION || !ivPart || !tagPart || !ciphertextPart) {
    throw new SealedTokenError('Unsupported sealed token format.');
  }

  try {
    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    const ciphertext = Buffer.from(ciphertextPart, 'base64url');

    if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES) {
      throw new SealedTokenError('Sealed token has an invalid IV or tag length.');
    }

    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof SealedTokenError) {
      throw error;
    }

    throw new SealedTokenError('Sealed token could not be opened with the current key.');
  }
}
