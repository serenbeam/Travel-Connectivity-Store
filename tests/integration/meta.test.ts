import { inject } from 'vitest';
import { describe, expect, it } from 'vitest';

import { ENV_DIGEST, ENV_PATH, loadTestEnv, TEST_ENV } from './support/env';

/**
 * Architecture guards. These are cheap, and they keep the harness honest:
 * environment parity between the global-setup process and the test worker, the
 * two-path separation (client vs administrative SQL), and service-key containment.
 */
describe('meta — environment parity and harness boundaries', () => {
  it('loads .env.test from the repository root', () => {
    expect(ENV_PATH.endsWith('.env.test')).toBe(true);
    expect(loadTestEnv()).toBe(TEST_ENV);
  });

  it('pins the suite to the local stack', () => {
    const url = new URL(TEST_ENV.NEXT_PUBLIC_SUPABASE_URL);

    expect(url.hostname).toBe('127.0.0.1');
    expect(url.port).toBe('54421');
  });

  it('worker process sees the same environment as global setup', () => {
    // Provided by tests/integration/support/global-setup.ts in the main process.
    // A mismatch means the worker did not load the same .env.test.
    expect(inject('envDigest')).toBe(ENV_DIGEST);
  });

  it('exposes the service role key only through server-side modules', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join, relative } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const srcRoot = fileURLToPath(new URL('../../src', import.meta.url));
    const allowed = new Set(['lib/env.ts', 'lib/supabase/admin.ts']);
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!full.endsWith('.ts') && !full.endsWith('.tsx')) {
          continue;
        }
        if (readFileSync(full, 'utf8').includes('SUPABASE_SERVICE_ROLE_KEY')) {
          const rel = relative(srcRoot, full).replaceAll('\\', '/');
          if (!allowed.has(rel)) {
            offenders.push(rel);
          }
        }
      }
    };

    walk(srcRoot);

    expect(offenders).toEqual([]);
    expect(TEST_ENV.SUPABASE_SERVICE_ROLE_KEY.startsWith('NEXT_PUBLIC_')).toBe(false);
  });

  it('never builds a remote database target', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join, relative } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const root = fileURLToPath(new URL('../..', import.meta.url));
    const files: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (full.endsWith('.ts')) {
          files.push(full);
        }
      }
    };

    walk(join(root, 'tests/integration'));

    // Built from parts so this file's own source does not match the pattern.
    const childProcessModule = ['node', 'child_process'].join(':');
    const childProcessPattern = new RegExp(`from '${childProcessModule}'`);

    const childProcessImporters = files
      .filter((file) => childProcessPattern.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file).replaceAll('\\', '/'))
      .sort();

    // Administrative SQL is confined to the psql helper (and only reachable through it).
    expect(childProcessImporters).toEqual(['tests/integration/support/psql.ts']);

    const psqlSource = readFileSync(join(root, 'tests/integration/support/psql.ts'), 'utf8');
    expect(/postgres(ql)?:\/\//.test(psqlSource)).toBe(false);

    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      expect(contents).not.toMatch(/supabase\s+(link|db\s+push|db\s+pull)\b/);
    }
  });

  it('derives the database container name from the project config', async () => {
    const { resolveDbContainer } = await import('./support/psql');
    const { readFileSync } = await import('node:fs');

    const config = readFileSync(
      new URL('../../supabase/config.jsonc', import.meta.url),
      'utf8',
    );
    const projectId = /"project_id"\s*:\s*"([^"]+)"/.exec(config)?.[1];

    expect(projectId).toBeTruthy();
    expect(resolveDbContainer()).toBe(`supabase_db_${projectId}`);
  });
});
