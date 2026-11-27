import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

declare module 'vitest' {
  interface ProvidedContext {
    /** sha256(url|serviceKey) computed from the same .env.test in every process. */
    envDigest: string;
  }
}

export const ENV_PATH = fileURLToPath(new URL('../../../.env.test', import.meta.url));

/** Only the local Supabase API is ever acceptable for this suite. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const EXPECTED_API_PORT = '54421';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  IDEMPOTENCY_TOKEN_KEY: z.string().min(32),
  N8N_WEBHOOK_URL: z.url(),
  N8N_WEBHOOK_SECRET: z.string().min(16),
  MOCK_GATEWAY_ENABLED: z.enum(['true', 'false']),
});

export type TestEnv = z.infer<typeof envSchema>;

/**
 * Reads `.env.test` and applies it to `process.env`.
 *
 * `process.loadEnvFile` is deliberately NOT used: it does not overwrite variables that
 * already exist, so a shell or CI that exports NEXT_PUBLIC_SUPABASE_URL would silently
 * win over the file and point the suite at a different stack. Parsing explicitly and
 * refusing on conflict makes the effective environment unambiguous.
 */
function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Refuses anything that is not the local stack. Runs before any client is built, so a
 * misconfigured environment can never reach a remote database.
 */
export function assertLocalStack(rawUrl: string): URL {
  const url = new URL(rawUrl);

  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Integration tests refuse to run against a non-local Supabase (host "${url.hostname}"). ` +
        'This suite targets the local Docker stack only.',
    );
  }

  if (url.port !== EXPECTED_API_PORT) {
    throw new Error(
      `Integration tests expect the local API port ${EXPECTED_API_PORT}, got "${url.port}".`,
    );
  }

  return url;
}

function load(): TestEnv {
  let contents: string;

  try {
    contents = readFileSync(ENV_PATH, 'utf8');
  } catch {
    throw new Error(
      `Missing ${ENV_PATH}. Create it from .env.test.example and fill the values from ` +
        '`npx supabase status -o env` (local stack only).',
    );
  }

  const fileEnv = parseEnvFile(contents);
  const conflicts: string[] = [];

  for (const [key, fileValue] of Object.entries(fileEnv)) {
    const ambient = process.env[key];

    if (ambient !== undefined && ambient !== fileValue) {
      conflicts.push(key);
    }
  }

  if (conflicts.length > 0) {
    throw new Error(
      `ENV_CONFLICT: ${conflicts.join(', ')} already set in the environment and differ ` +
        'from .env.test. Unset them before running the integration suite (there is no bypass).',
    );
  }

  Object.assign(process.env, fileEnv);

  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    IDEMPOTENCY_TOKEN_KEY: process.env.IDEMPOTENCY_TOKEN_KEY,
    N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
    N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET,
    MOCK_GATEWAY_ENABLED: process.env.MOCK_GATEWAY_ENABLED,
  });

  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid or missing variables in ${ENV_PATH}: ${names.join(', ')}`);
  }

  assertLocalStack(parsed.data.NEXT_PUBLIC_SUPABASE_URL);

  return parsed.data;
}

let cached: TestEnv | null = null;

export function loadTestEnv(): TestEnv {
  cached ??= load();
  return cached;
}

/**
 * Loaded at import time on purpose: the local-loopback guard must run before any
 * test body, and before any Supabase client is constructed.
 */
export const TEST_ENV: TestEnv = loadTestEnv();

export const ENV_DIGEST = createHash('sha256')
  .update(`${TEST_ENV.NEXT_PUBLIC_SUPABASE_URL}|${TEST_ENV.SUPABASE_SERVICE_ROLE_KEY}`)
  .digest('hex')
  .slice(0, 16);

export function apiUrl(path = ''): string {
  return `${TEST_ENV.NEXT_PUBLIC_SUPABASE_URL}${path}`;
}

export function restUrl(path = ''): string {
  return `${TEST_ENV.NEXT_PUBLIC_SUPABASE_URL}/rest/v1${path}`;
}

export function authUrl(path = ''): string {
  return `${TEST_ENV.NEXT_PUBLIC_SUPABASE_URL}/auth/v1${path}`;
}
