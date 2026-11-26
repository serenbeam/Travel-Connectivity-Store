import 'server-only';

import { z } from 'zod';

import { getPublicEnv, type PublicEnv } from './env.public';

/**
 * Server-only environment. `import 'server-only'` guarantees this module can never
 * be pulled into a client bundle: the package resolves to a throwing module when the
 * `react-server` condition is absent, which fails the build (documented in
 * docs/technical-decisions.md ADR-10 and AGENTS.md).
 *
 * Nothing here is evaluated at import time — getEnv() validates lazily so that
 * `next build` succeeds without any secrets present.
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  IDEMPOTENCY_TOKEN_KEY: z.string().min(32),
  N8N_WEBHOOK_URL: z.url(),
  N8N_WEBHOOK_SECRET: z.string().min(16),
  MOCK_GATEWAY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type Env = ServerEnv & PublicEnv;

export class ServerEnvError extends Error {
  /** Variable names only — values are never included in the message. */
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Missing or invalid server environment variables: ${variables.join(', ')}`);
    this.name = 'ServerEnvError';
    this.variables = variables;
  }
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) {
    return cached;
  }

  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    IDEMPOTENCY_TOKEN_KEY: process.env.IDEMPOTENCY_TOKEN_KEY,
    N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
    N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET,
    MOCK_GATEWAY_ENABLED: process.env.MOCK_GATEWAY_ENABLED ?? 'false',
  });

  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new ServerEnvError(variables);
  }

  cached = { ...parsed.data, ...getPublicEnv() };
  return cached;
}

/** True when the payment simulation routes may be served. Always false in production. */
export function isMockGatewayEnabled(): boolean {
  if (process.env.NODE_ENV === 'production' && process.env.MOCK_GATEWAY_ENABLED !== 'true') {
    return false;
  }
  try {
    return getEnv().MOCK_GATEWAY_ENABLED;
  } catch {
    return false;
  }
}

/** Test-only helper; keeps the lazy cache from leaking between test cases. */
export function resetEnvCache(): void {
  cached = null;
}
