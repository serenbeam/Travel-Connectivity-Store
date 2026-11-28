import { ensureAdminUser } from './support/admin-fixture';

/**
 * Runs once per `playwright test` invocation, before any spec.
 *
 * It only prepares the admin fixture through the Auth Admin API; nothing here touches
 * migrations, catalog seed rows, or the schema. The local-stack guard inside
 * `tests/integration/support/env.ts` runs on import, so a `.env.test` pointing at a remote
 * project fails before a connection is attempted.
 *
 * If this throws, every test fails fast: there is nothing to assert without an admin.
 */
export default async function globalSetup(): Promise<void> {
  const adminId = await ensureAdminUser();

  // A user id is not a credential. No password, token, or service key is ever printed.
  console.log(`e2e: admin fixture ready (user ${adminId.slice(0, 8)}…)`);
}
