import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal environment loader for the E2E suite.
 *
 * Why not reuse `tests/integration/support/env.ts`:
 * that module is written for Vitest's ESM pipeline and resolves its file with
 * `import.meta.url`. Playwright transpiles specs and setup files to CommonJS for this
 * project (package.json has no `"type": "module"`), so importing it fails with
 * "Cannot use 'import.meta' outside a module". A one-line tsconfig switch would change how
 * the application itself is built, which is outside the E-8 scope.
 *
 * What IS preserved from the integration loader:
 * - the same `.env.test` file (the browser gets `.env.local` from the Next.js dev server,
 *   and both files point at the same local stack);
 * - the same local-only guard: loopback host and API port 54421. A `.env.test` that points
 *   at a hosted project fails before a connection is attempted;
 * - no ambient override: an exported variable that disagrees with the file is an error,
 *   not a silent winner.
 */

export interface E2EEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const ENV_PATH = resolve(process.cwd(), '.env.test');
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const EXPECTED_API_PORT = '54421';

function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');

    if (separator <= 0) {
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

function load(): E2EEnv {
  let contents: string;

  try {
    contents = readFileSync(ENV_PATH, 'utf8');
  } catch {
    throw new Error(
      `E2E: missing ${ENV_PATH}. Create it from .env.test.example and fill the values from ` +
        '`npx supabase status -o env` (local stack only).',
    );
  }

  const fileEnv = parseEnvFile(contents);
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const missing = required.filter((key) => (fileEnv[key] ?? '') === '');

  if (missing.length > 0) {
    throw new Error(`E2E: missing variables in ${ENV_PATH}: ${missing.join(', ')}`);
  }

  const conflicts = required.filter(
    (key) => process.env[key] !== undefined && process.env[key] !== fileEnv[key],
  );

  if (conflicts.length > 0) {
    throw new Error(
      `E2E: ${conflicts.join(', ')} already set in the environment and differs from .env.test.`,
    );
  }

  const url = new URL(String(fileEnv.NEXT_PUBLIC_SUPABASE_URL));

  if (!LOCAL_HOSTS.has(url.hostname) || url.port !== EXPECTED_API_PORT) {
    throw new Error(
      `E2E refuses to touch a non-local Supabase (host "${url.hostname}", port "${url.port}"). ` +
        `Expected a loopback host on port ${EXPECTED_API_PORT}.`,
    );
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: url.origin,
    SUPABASE_SERVICE_ROLE_KEY: String(fileEnv.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export const E2E_ENV: E2EEnv = load();
