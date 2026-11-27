import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { assertLocalStack, TEST_ENV } from './env';

/**
 * Administrative SQL path (E-3 decision P2-B: no `pg` dependency).
 *
 * Every statement runs through `docker exec` into *this project's* local database
 * container. This module accepts no host, port, user, password or connection string,
 * so there is no code path that can address a remote database.
 */

const CONFIG_PATH = fileURLToPath(new URL('../../../supabase/config.jsonc', import.meta.url));
const CONTAINER_PREFIX = 'supabase_db_';

/**
 * Reads a required column from a psql row.
 * Fails loudly instead of silently yielding `undefined` when column counts drift.
 */
export function at(values: readonly unknown[] | undefined, index: number): string {
  const value = values?.[index];

  if (typeof value !== 'string') {
    throw new Error(
      `Row does not contain column ${index} (received ${values?.length ?? 0} column(s)).`,
    );
  }

  return value;
}

function projectId(): string {
  const config = readFileSync(CONFIG_PATH, 'utf8');
  const match = /"project_id"\s*:\s*"([^"]+)"/.exec(config);

  if (!match) {
    throw new Error(`Could not read "project_id" from ${CONFIG_PATH}`);
  }

  return at(match, 1);
}

/**
 * Resolves the database container from `docker ps` rather than assuming a name.
 * Anchoring on `config.jsonc#project_id` also keeps sibling projects (for example
 * another Supabase stack running on the same Docker host) out of reach.
 */
export function resolveDbContainer(): string {
  assertLocalStack(TEST_ENV.NEXT_PUBLIC_SUPABASE_URL);

  const expected = `${CONTAINER_PREFIX}${projectId()}`;
  const stdout = execFileSync(
    'docker',
    ['ps', '--filter', `name=${CONTAINER_PREFIX}`, '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );

  const running = stdout
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);

  if (!running.includes(expected)) {
    throw new Error(
      `Local database container "${expected}" is not running. Found: ` +
        `${running.length > 0 ? running.join(', ') : '<none>'}. Start the stack with ` +
        '`npx supabase start` (Docker Desktop must be running).',
    );
  }

  return expected;
}

function execPsql(sql: string, container: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-q',
      '-A',
      '-t',
      '-F',
      '\t',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=verbose',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
}

/** Runs SQL and returns stdout (trailing newlines removed, trailing tabs preserved). */
export function psql(sql: string): string {
  return execPsql(sql, resolveDbContainer()).replace(/(?:\r?\n)+$/, '');
}

/**
 * Async variant used to run two sessions concurrently (race tests).
 * Resolves with stdout even when the statement fails, so invariants can be asserted.
 */
export function psqlAsync(sql: string): Promise<string> {
  const container = resolveDbContainer();

  return new Promise((resolve, reject) => {
    const child = execFile(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-X',
        '-q',
        '-A',
        '-t',
        '-F',
        '\t',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        '-',
      ],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`psqlAsync failed:\n${stderr}`));
          return;
        }
        resolve(String(stdout).replace(/(?:\r?\n)+$/, ''));
      },
    );

    child.stdin?.end(sql);
  });
}

/** Runs SQL expected to succeed and returns the single scalar it selects. */
export function scalar(sql: string): string {
  const output = psql(sql);
  const [first] = output.split('\n');
  return (first ?? '').trim();
}

/** Runs SQL expected to succeed and returns rows of tab-separated columns. */
export function rows(sql: string): string[][] {
  return psql(sql)
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\t'));
}

/**
 * Runs `sql` inside an explicit transaction and returns its SQLSTATE.
 *
 * `begin/commit` is always used so that DEFERRED constraint triggers (I2, I5) are
 * validated inside this call: they fire at COMMIT, not at statement end.
 * Returns `no_error` when the transaction commits cleanly.
 */
export function sqlState(sql: string): string {
  const script = `begin;\n${sql}\ncommit;\n`;

  try {
    execPsql(script, resolveDbContainer());
    return 'no_error';
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '');
    const match = /ERROR:\s+([0-9A-Z]{5}):/.exec(stderr);

    if (!match) {
      throw new Error(`psql failed without a parsable SQLSTATE.\n${stderr}`);
    }

    return at(match, 1);
  }
}

/** Returns the full server error text (message + detail + context), if it failed. */
export function sqlError(sql: string): string {
  const script = `begin;\n${sql}\ncommit;\n`;

  try {
    execPsql(script, resolveDbContainer());
    return '';
  } catch (error) {
    return String((error as { stderr?: unknown }).stderr ?? '');
  }
}
