#!/usr/bin/env node
/**
 * Seed (or repair) the single admin account used by the MVP (E-6).
 *
 * Security rules:
 * - credentials come from the environment (ADMIN_EMAIL, ADMIN_PASSWORD); there is no
 *   committed default password;
 * - the admin role is written to `app_metadata` only, which a user cannot edit
 *   (public.is_admin() reads app_metadata, see tests/integration/jwt-spoof.test.ts);
 * - the service-role key is read from the process environment and never printed, and this
 *   script is never imported by application code or shipped to the browser;
 * - idempotent: an existing account only gets its app_metadata repaired, its password is
 *   left untouched;
 * - refuses to touch a non-loopback Supabase URL unless `--allow-remote` is passed.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@roamly.test ADMIN_PASSWORD='…' npm run db:seed-admin
 */
import { readFile } from 'node:fs/promises';

import { createClient } from '@supabase/supabase-js';

const ENV_FILE = '.env.local';
const MIN_PASSWORD_LENGTH = 12;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message) {
  console.error(`seed-admin: ${message}`);
  process.exit(1);
}

function parseEnvFile(contents) {
  const values = {};

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

    values[key] = value;
  }

  return values;
}

/**
 * `.env.local` fills the gaps; an explicitly exported variable always wins, so a one-off
 * run can override a stale file without editing it.
 */
async function loadEnv() {
  let fromFile = {};

  try {
    fromFile = parseEnvFile(await readFile(ENV_FILE, 'utf8'));
  } catch {
    // No .env.local: rely on the process environment only.
  }

  const merged = { ...fromFile };

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value !== '') {
      merged[key] = value;
    }
  }

  return merged;
}

async function findUserByEmail(client, email) {
  const perPage = 200;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });

    if (error) {
      fail(`could not list auth users (${error.message})`);
    }

    const match = data.users.find(
      (user) => typeof user.email === 'string' && user.email.toLowerCase() === email,
    );

    if (match) {
      return match;
    }

    if (data.users.length < perPage) {
      return null;
    }
  }

  return null;
}

async function main() {
  const allowRemote = process.argv.includes('--allow-remote');
  const env = await loadEnv();

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const rawEmail = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;

  if (!url || !serviceRoleKey) {
    fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  if (!rawEmail || !EMAIL_PATTERN.test(rawEmail.trim())) {
    fail('ADMIN_EMAIL is required and must be a valid email address.');
  }

  let hostname;

  try {
    hostname = new URL(url).hostname;
  } catch {
    fail('NEXT_PUBLIC_SUPABASE_URL is not a valid URL.');
  }

  if (!LOOPBACK_HOSTS.has(hostname) && !allowRemote) {
    fail(
      `refusing to seed an admin on a non-loopback host (${hostname}). Re-run with --allow-remote if this is intentional.`,
    );
  }

  const email = rawEmail.trim().toLowerCase();
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const existing = await findUserByEmail(client, email);

  if (existing) {
    const { error } = await client.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      app_metadata: { ...existing.app_metadata, role: 'admin' },
    });

    if (error) {
      fail(`could not repair the existing admin (${error.message})`);
    }

    console.log(`seed-admin: admin ensured (updated) for ${email}; password unchanged.`);
    return;
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    fail(`ADMIN_PASSWORD is required for a new admin and must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const { error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'admin' },
  });

  if (error) {
    fail(`could not create the admin (${error.message})`);
  }

  console.log(`seed-admin: admin created for ${email}; role=admin.`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : 'unexpected failure');
});
