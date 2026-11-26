import { NextResponse } from 'next/server';

/**
 * HTTP response helpers implementing the error envelope and status mapping from
 * docs/api-contract.md §2. Every transactional response is `Cache-Control: no-store`.
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_EXPIRED'
  | 'IDEMPOTENCY_REPLAY_UNAVAILABLE'
  | 'PAYMENT_ALREADY_FINAL'
  | 'PACKAGE_INACTIVE'
  | 'DESTINATION_IN_USE'
  | 'NOTIFICATION_IN_FLIGHT'
  | 'NOTIFICATION_CLAIM_STALE'
  | 'NOTIFICATION_DELIVERY_FAILED'
  | 'ENRICHMENT_UNAVAILABLE'
  | 'INTERNAL';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENCY_EXPIRED: 409,
  IDEMPOTENCY_REPLAY_UNAVAILABLE: 409,
  PAYMENT_ALREADY_FINAL: 409,
  PACKAGE_INACTIVE: 409,
  DESTINATION_IN_USE: 409,
  NOTIFICATION_IN_FLIGHT: 409,
  NOTIFICATION_CLAIM_STALE: 409,
  NOTIFICATION_DELIVERY_FAILED: 502,
  ENRICHMENT_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers ?? {}) },
  });
}

export function jsonError(
  code: ErrorCode,
  message: string,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { error: details === undefined ? { code, message } : { code, message, details } },
    { status: ERROR_STATUS[code], headers: NO_STORE },
  );
}

/** Uniform 404 for capability-token routes: identical body for every miss. */
export function jsonNotFound(): NextResponse<ApiErrorBody> {
  return jsonError('NOT_FOUND', 'Not found.');
}

/** Default ceiling for Supabase calls made from route handlers / server modules. */
export const DEFAULT_FETCH_TIMEOUT_MS = 8_000;

/** Ceiling for the proxy session check; must stay well below the outbox lease (120 s). */
export const PROXY_FETCH_TIMEOUT_MS = 3_000;

/**
 * Builds a fetch implementation that actually cancels the request.
 *
 * A promise wrapper (Promise.race) would only stop *waiting* while the socket stays
 * open, so the deadline is injected as an AbortSignal into the fetch Supabase really
 * uses (`options.global.fetch`). Supabase's own signal is preserved via AbortSignal.any.
 */
export function createFetchWithTimeout(timeoutMs: number): typeof fetch {
  return function fetchWithTimeout(input, init) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;

    return fetch(input, { ...init, signal });
  };
}
