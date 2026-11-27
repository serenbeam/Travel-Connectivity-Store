import { describe, expect, it } from 'vitest';

import {
  checkoutKeyStorageKey,
  forgetCheckoutKey,
  generateCheckoutKey,
  getOrCreateCheckoutKey,
  type CheckoutKeyStorage,
} from '@/modules/orders/checkout-key';

/**
 * The module keeps an in-memory mirror for the page load, so every test below uses its own
 * package slug. That keeps tests independent without adding a reset hook to production code.
 */
let slugSeq = 0;
function uniquePackage(): string {
  slugSeq += 1;

  return `pkg-${String(slugSeq).padStart(2, '0')}`;
}

interface TestStorage extends CheckoutKeyStorage {
  dump: () => Record<string, string>;
  breakStorage: () => void;
  repairStorage: () => void;
}

function memoryStorage(initial: Record<string, string> = {}): TestStorage {
  const data = new Map(Object.entries(initial));
  let broken = false;

  const guard = () => {
    if (broken) {
      throw new Error('storage unavailable');
    }
  };

  return {
    getItem: (key) => {
      guard();

      return data.get(key) ?? null;
    },
    setItem: (key, value) => {
      guard();
      data.set(key, value);
    },
    removeItem: (key) => {
      guard();
      data.delete(key);
    },
    dump: () => Object.fromEntries(data),
    breakStorage: () => {
      broken = true;
    },
    repairStorage: () => {
      broken = false;
    },
  };
}

const throwingStorage: CheckoutKeyStorage = {
  getItem: () => {
    throw new Error('storage disabled');
  },
  setItem: () => {
    throw new Error('storage disabled');
  },
  removeItem: () => {
    throw new Error('storage disabled');
  },
};

const DEST = 'malaysia';

describe('checkout key — generation', () => {
  it('produces a 43-character base64url key', () => {
    expect(generateCheckoutKey()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 50 }, generateCheckoutKey));

    expect(keys.size).toBe(50);
  });
});

describe('checkout key — storage namespace', () => {
  it('keeps the previous prefix per (destination, package)', () => {
    const pkg = uniquePackage();

    expect(checkoutKeyStorageKey(DEST, pkg)).toBe(`roamly:idempotency:${DEST}:${pkg}`);
  });
});

describe('checkout key — attempt lifecycle with working storage', () => {
  it('creates and stores a key on first use', () => {
    const storage = memoryStorage();
    const pkg = uniquePackage();

    const key = getOrCreateCheckoutKey(storage, DEST, pkg);

    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storage.dump()[`roamly:idempotency:${DEST}:${pkg}`]).toBe(key);
  });

  it('returns the same key for a retry of the same attempt', () => {
    const storage = memoryStorage();
    const pkg = uniquePackage();

    const first = getOrCreateCheckoutKey(storage, DEST, pkg);
    const retry = getOrCreateCheckoutKey(storage, DEST, pkg);

    expect(retry).toBe(first);
  });

  it('returns a different key after the attempt is forgotten', () => {
    const storage = memoryStorage();
    const pkg = uniquePackage();

    const first = getOrCreateCheckoutKey(storage, DEST, pkg);
    forgetCheckoutKey(storage, DEST, pkg);
    const next = getOrCreateCheckoutKey(storage, DEST, pkg);

    expect(next).not.toBe(first);
    expect(storage.dump()[`roamly:idempotency:${DEST}:${pkg}`]).toBe(next);
  });

  it('keeps packages independent', () => {
    const storage = memoryStorage();
    const japanPkg = uniquePackage();
    const malaysiaPkg = uniquePackage();

    const japan = getOrCreateCheckoutKey(storage, 'japan', japanPkg);
    const malaysia = getOrCreateCheckoutKey(storage, DEST, malaysiaPkg);

    expect(japan).not.toBe(malaysia);
    expect(getOrCreateCheckoutKey(storage, 'japan', japanPkg)).toBe(japan);
  });

  it('ignores an empty stored value', () => {
    const pkg = uniquePackage();
    const storage = memoryStorage({ [`roamly:idempotency:${DEST}:${pkg}`]: '' });

    expect(getOrCreateCheckoutKey(storage, DEST, pkg)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('treats storage as the source of truth when it already holds a key', () => {
    const pkg = uniquePackage();
    const storageKey = `roamly:idempotency:${DEST}:${pkg}`;
    const stored = generateCheckoutKey();
    const storage = memoryStorage({ [storageKey]: stored });

    expect(getOrCreateCheckoutKey(storage, DEST, pkg)).toBe(stored);
    // The mirror is kept in sync with storage, not the other way around.
    expect(storage.dump()[storageKey]).toBe(stored);
  });
});

describe('checkout key — in-memory fallback (storage unavailable)', () => {
  it('returns the same key on retry when storage throws', () => {
    const pkg = uniquePackage();

    const first = getOrCreateCheckoutKey(throwingStorage, DEST, pkg);
    const retry = getOrCreateCheckoutKey(throwingStorage, DEST, pkg);

    expect(retry).toBe(first);
  });

  it('returns the same key on retry when storage is null (server render / blocked)', () => {
    const pkg = uniquePackage();

    const first = getOrCreateCheckoutKey(null, DEST, pkg);
    const retry = getOrCreateCheckoutKey(null, DEST, pkg);

    expect(retry).toBe(first);
  });

  it('returns a different key after forgetting a fallback attempt', () => {
    const pkg = uniquePackage();

    const first = getOrCreateCheckoutKey(throwingStorage, DEST, pkg);
    forgetCheckoutKey(throwingStorage, DEST, pkg);
    const next = getOrCreateCheckoutKey(throwingStorage, DEST, pkg);

    expect(next).not.toBe(first);
  });

  it('keeps packages independent in the fallback', () => {
    const pkgA = uniquePackage();
    const pkgB = uniquePackage();

    const a = getOrCreateCheckoutKey(null, DEST, pkgA);
    const b = getOrCreateCheckoutKey(null, DEST, pkgB);

    expect(a).not.toBe(b);
    expect(getOrCreateCheckoutKey(null, DEST, pkgA)).toBe(a);
  });

  it('does not clear another package when forgetting one fallback key', () => {
    const pkgA = uniquePackage();
    const pkgB = uniquePackage();

    const a = getOrCreateCheckoutKey(null, DEST, pkgA);
    const b = getOrCreateCheckoutKey(null, DEST, pkgB);

    forgetCheckoutKey(null, DEST, pkgA);

    expect(getOrCreateCheckoutKey(null, DEST, pkgB)).toBe(b);
    expect(getOrCreateCheckoutKey(null, DEST, pkgA)).not.toBe(a);
  });

  it('keeps the same key when storage breaks mid-attempt', () => {
    const storage = memoryStorage();
    const pkg = uniquePackage();

    const first = getOrCreateCheckoutKey(storage, DEST, pkg);
    storage.breakStorage();
    const afterBreak = getOrCreateCheckoutKey(storage, DEST, pkg);

    expect(afterBreak).toBe(first);
  });

  it('writes the fallback key back once storage recovers', () => {
    const storage = memoryStorage();
    const pkg = uniquePackage();
    const storageKey = `roamly:idempotency:${DEST}:${pkg}`;

    storage.breakStorage();
    const key = getOrCreateCheckoutKey(storage, DEST, pkg);
    expect(storage.dump()[storageKey]).toBeUndefined();

    storage.repairStorage();
    const recovered = getOrCreateCheckoutKey(storage, DEST, pkg);

    expect(recovered).toBe(key);
    expect(storage.dump()[storageKey]).toBe(key);
  });

  it('does not throw when forgetting with broken storage', () => {
    const pkg = uniquePackage();

    expect(() => forgetCheckoutKey(throwingStorage, DEST, pkg)).not.toThrow();
    expect(() => forgetCheckoutKey(null, DEST, pkg)).not.toThrow();
  });

  it('does not throw when forgetting a key that was never stored', () => {
    const storage = memoryStorage();
    const pkg = uniquePackage();

    expect(() => forgetCheckoutKey(storage, DEST, pkg)).not.toThrow();
    expect(storage.dump()).toEqual({});
  });
});
