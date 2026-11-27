/**
 * Checkout idempotency-key lifecycle (ADR-6).
 *
 * One key represents **one checkout attempt**:
 *
 *  - retry of the same attempt  → the same key, so the server replays the same order;
 *  - a genuinely new attempt    → a fresh key, so a second order can be created.
 *
 * Storage is injected rather than read from `window`, so the rules are unit-testable and
 * this module can never touch browser storage during server rendering. Keys are secrets
 * (holding one is equivalent to holding the capability), so nothing here logs them.
 *
 * When `sessionStorage` is unavailable or throws (private mode, blocked storage, quota),
 * the key is mirrored in a module-level map for the lifetime of the page load. That keeps a
 * retry of the *same* attempt idempotent instead of silently creating a second order. The
 * map is keyed with {@link checkoutKeyStorageKey}, so packages can never share a key, and
 * it is cleared by {@link forgetCheckoutKey} together with the stored value.
 */

export interface CheckoutKeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Kept identical to the pre-extraction prefix so existing tabs keep working. */
const STORAGE_PREFIX = 'roamly:idempotency:';

const KEY_BYTES = 32;

/**
 * In-memory fallback for this page load.
 *
 * Client-only in practice: `getOrCreateCheckoutKey` is called from the checkout submit
 * handler in the browser and never during server rendering, so this map never becomes
 * shared server-side state.
 */
const memoryKeys = new Map<string, string>();

/** 32 random bytes base64url = 43 characters (`^[A-Za-z0-9_-]{22,64}$`). */
export function generateCheckoutKey(): string {
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);

  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function checkoutKeyStorageKey(destinationSlug: string, packageSlug: string): string {
  return `${STORAGE_PREFIX}${destinationSlug}:${packageSlug}`;
}

function persist(storage: CheckoutKeyStorage | null, storageKey: string, key: string): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(storageKey, key);
  } catch {
    // Best effort: the in-memory copy still keeps this attempt idempotent.
  }
}

/**
 * Returns the key for the current attempt of this package, creating one on first use.
 *
 * Read order: storage (persists across reloads) → in-memory mirror (survives a broken or
 * blocked storage) → generate a new key.
 */
export function getOrCreateCheckoutKey(
  storage: CheckoutKeyStorage | null,
  destinationSlug: string,
  packageSlug: string,
): string {
  const storageKey = checkoutKeyStorageKey(destinationSlug, packageSlug);

  if (storage !== null) {
    try {
      const stored = storage.getItem(storageKey);

      if (stored !== null && stored.length > 0) {
        memoryKeys.set(storageKey, stored);

        return stored;
      }
    } catch {
      // Storage is unavailable: fall through to the in-memory mirror.
    }
  }

  const cached = memoryKeys.get(storageKey);

  if (cached !== undefined) {
    // Storage may have come back; restore persistence without changing the key.
    persist(storage, storageKey, cached);

    return cached;
  }

  const created = generateCheckoutKey();
  memoryKeys.set(storageKey, created);
  persist(storage, storageKey, created);

  return created;
}

/**
 * Drops the key so the next explicit Pay action starts a new attempt.
 *
 * Called only when an attempt is definitively over (HTTP 409 conflict/expired, or once a
 * successful order's navigation has actually completed). Never called on network errors or
 * 5xx, where the outcome is unknown and a retry must stay idempotent.
 */
export function forgetCheckoutKey(
  storage: CheckoutKeyStorage | null,
  destinationSlug: string,
  packageSlug: string,
): void {
  const storageKey = checkoutKeyStorageKey(destinationSlug, packageSlug);

  memoryKeys.delete(storageKey);

  if (storage === null) {
    return;
  }

  try {
    storage.removeItem(storageKey);
  } catch {
    // Storage became unavailable between read and write; nothing to recover.
  }
}
