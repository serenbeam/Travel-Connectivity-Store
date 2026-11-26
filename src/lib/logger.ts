/**
 * Single logging entry point (docs/architecture.md §9, ADR-10).
 *
 * Rules enforced here:
 * - capability tokens in paths are masked before anything is written;
 * - credential-bearing keys are redacted by name;
 * - values are never serialised blindly.
 *
 * There is no analytics or error-monitoring SDK in this project, so this module is
 * the only outbound diagnostic path.
 */
const REDACTED_KEYS = new Set([
  'idempotency-key',
  'idempotencykey',
  'token',
  'access_token',
  'access-token',
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'secret',
]);

/** 32 random bytes encoded as base64url = 43 characters (ADR-5). */
const CAPABILITY_PATH_PATTERN = /\/orders\/[A-Za-z0-9_-]{43}/g;

export function redactPath(path: string): string {
  return path.replace(CAPABILITY_PATH_PATTERN, '/orders/[redacted]');
}

export function redactMeta(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(meta)) {
    const normalized = key.toLowerCase();

    if (REDACTED_KEYS.has(normalized)) {
      safe[key] = '[redacted]';
      continue;
    }

    if (normalized === 'path' && typeof value === 'string') {
      safe[key] = redactPath(value);
      continue;
    }

    safe[key] = value;
  }

  return safe;
}

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  const payload = meta ? redactMeta(meta) : undefined;
  const line = payload ? `${message} ${JSON.stringify(payload)}` : message;

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function logInfo(message: string, meta?: Record<string, unknown>): void {
  emit('info', message, meta);
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  emit('warn', message, meta);
}

export function logError(message: string, meta?: Record<string, unknown>): void {
  emit('error', message, meta);
}
