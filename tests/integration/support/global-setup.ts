import { authUrl, ENV_DIGEST, restUrl, TEST_ENV } from './env';
import { at, resolveDbContainer, scalar } from './psql';

/**
 * Fail-fast environment probe. Nothing here mutates the stack.
 *
 * NOTE (E-3 review item 2): the PostgREST openapi root (`GET /rest/v1/`) answers 200
 * *without* any key on this stack, so it proves nothing about credentials. Every
 * assertion below validates authenticated access instead.
 */

function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) {
    return null; // New-style sb_publishable_/sb_secret_ keys are not JWTs.
  }

  const payload = JSON.parse(Buffer.from(at(parts, 1), 'base64url').toString('utf8')) as {
    role?: string;
  };
  return payload.role ?? null;
}

async function expectStatus(url: string, headers: Record<string, string>, label: string) {
  const response = await fetch(url, { headers });
  if (response.status !== 200) {
    throw new Error(
      `${label} returned HTTP ${response.status}. Expected 200 from the local stack ` +
        `(${TEST_ENV.NEXT_PUBLIC_SUPABASE_URL}). Run \`npx supabase start\` and retry.`,
    );
  }
  return response;
}

export default async function globalSetup({ provide }: { provide(key: 'envDigest', value: string): void }) {
  const container = resolveDbContainer();

  // 1. Key integrity: swapped keys would silently turn the RLS tests into nothing.
  const anonRole = jwtRole(TEST_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRole = jwtRole(TEST_ENV.SUPABASE_SERVICE_ROLE_KEY);

  if (anonRole !== null && anonRole !== 'anon') {
    throw new Error(`NEXT_PUBLIC_SUPABASE_ANON_KEY carries role "${anonRole}", expected "anon".`);
  }
  if (serviceRole !== null && serviceRole !== 'service_role') {
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY carries role "${serviceRole}", expected "service_role".`);
  }

  // 2. anon (public) read through PostgREST + RLS.
  const anonResponse = await fetch(restUrl('/destinations?select=slug&limit=1'), {
    headers: {
      apikey: TEST_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${TEST_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  });

  if (anonResponse.status !== 200) {
    throw new Error(
      `Anonymous read of public.destinations returned HTTP ${anonResponse.status}. ` +
        'Migrations and seed must be applied: `npx supabase db reset`.',
    );
  }

  const destinationRows = (await anonResponse.json()) as unknown[];
  if (!Array.isArray(destinationRows) || destinationRows.length !== 1) {
    throw new Error('Anonymous read of public.destinations did not return exactly one row.');
  }

  // 3. Auth service reachable.
  await expectStatus(authUrl('/health'), {}, 'GET /auth/v1/health');

  // 4. service_role connectivity (grant check, not just key validity).
  await expectStatus(
    restUrl('/orders?select=id&limit=1'),
    {
      apikey: TEST_ENV.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${TEST_ENV.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    'GET /rest/v1/orders as service_role',
  );

  // 5. Administrative SQL path.
  if (scalar('select 1;') !== '1') {
    throw new Error(`psql through docker container "${container}" did not return 1.`);
  }

  const containerCheck = scalar(
    "select count(*) from pg_tables where schemaname = 'public' and tablename = 'orders';",
  );
  if (containerCheck !== '1') {
    throw new Error(`Container "${container}" does not hold the Roamly schema.`);
  }

  provide('envDigest', ENV_DIGEST);
}
