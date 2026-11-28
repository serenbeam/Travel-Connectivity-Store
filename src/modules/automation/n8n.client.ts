import type { WirePayload } from './payload';

/**
 * n8n webhook client (ADR-9, FR-N2).
 *
 * Rules taken from the approved design:
 * - `X-Webhook-Secret` header, value from `N8N_WEBHOOK_SECRET` (server environment only);
 * - HTTP timeout 10 s, at most one retry for a *transient* failure, so one dispatch is
 *   bounded at 20 s inside a 120 s lease (AC-T14);
 * - `2xx` = the n8n workflow accepted the event;
 * - `4xx` = permanent (bad secret, malformed event): no retry;
 * - `5xx`, network error, timeout = transient: exactly one retry.
 *
 * `2xx` is NOT proof that an email reached an inbox — see docs/api-contract.md §7.
 */
export const N8N_TIMEOUT_MS = 10_000;
export const N8N_MAX_ATTEMPTS = 2;
export const MAX_ERROR_LENGTH = 120;

export type N8nFailureReason =
  | 'misconfigured'
  | 'http_4xx'
  | 'http_5xx'
  | 'timeout'
  | 'network';

export type N8nSendResult =
  | { ok: true; attempts: number; httpStatus: number }
  | {
      ok: false;
      attempts: number;
      reason: N8nFailureReason;
      httpStatus: number | null;
      /** Sanitised, bounded code stored in `notification_outbox.last_error`. */
      error: string;
    };

export interface N8nClient {
  send(payload: WirePayload): Promise<N8nSendResult>;
}

export interface N8nConfig {
  url: string;
  secret: string;
}

export interface N8nClientOptions {
  fetchImpl?: typeof fetch;
  /** Injectable so tests never read process environment. */
  resolveConfig?: () => N8nConfig | Promise<N8nConfig>;
  timeoutMs?: number;
}

/**
 * `last_error` is written into the database and may be shown to admins, so it is reduced to
 * a short token: no URLs, no header values, no payload fragments, no newlines.
 */
export function sanitizeErrorForOutbox(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9_.:\- ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (cleaned === '' ? 'unknown_error' : cleaned).slice(0, MAX_ERROR_LENGTH);
}

/** Lazy so importing this module never requires secrets (unit tests, `next build`). */
async function resolveConfigFromEnv(): Promise<N8nConfig> {
  const { getEnv } = await import('@/lib/env');
  const env = getEnv();

  return { url: env.N8N_WEBHOOK_URL, secret: env.N8N_WEBHOOK_SECRET };
}

function isTimeoutError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';

  return name === 'TimeoutError' || name === 'AbortError';
}

export function createN8nClient(options: N8nClientOptions = {}): N8nClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? N8N_TIMEOUT_MS;
  const resolveConfig = options.resolveConfig ?? resolveConfigFromEnv;

  return {
    async send(payload: WirePayload): Promise<N8nSendResult> {
      let config: N8nConfig;

      try {
        config = await resolveConfig();
      } catch {
        // Missing or invalid environment: fail without touching the network.
        return {
          ok: false,
          attempts: 0,
          reason: 'misconfigured',
          httpStatus: null,
          error: 'n8n_misconfigured',
        };
      }

      const body = JSON.stringify(payload);
      let lastReason: N8nFailureReason = 'network';
      let lastStatus: number | null = null;
      let lastError = 'n8n_network';
      let attempts = 0;

      for (let attempt = 1; attempt <= N8N_MAX_ATTEMPTS; attempt += 1) {
        attempts = attempt;

        try {
          const response = await fetchImpl(config.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-webhook-secret': config.secret,
            },
            body,
            cache: 'no-store',
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (response.ok) {
            return { ok: true, attempts, httpStatus: response.status };
          }

          if (response.status >= 400 && response.status < 500) {
            // Permanent: the same request will fail again (wrong secret, bad event shape).
            return {
              ok: false,
              attempts,
              reason: 'http_4xx',
              httpStatus: response.status,
              error: sanitizeErrorForOutbox(`n8n_http_${response.status}`),
            };
          }

          lastReason = 'http_5xx';
          lastStatus = response.status;
          lastError = `n8n_http_${response.status}`;
        } catch (error) {
          lastReason = isTimeoutError(error) ? 'timeout' : 'network';
          lastStatus = null;
          lastError = lastReason === 'timeout' ? 'n8n_timeout' : 'n8n_network';
        }
      }

      return {
        ok: false,
        attempts,
        reason: lastReason,
        httpStatus: lastStatus,
        error: sanitizeErrorForOutbox(lastError),
      };
    },
  };
}
