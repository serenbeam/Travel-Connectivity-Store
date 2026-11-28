import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminSession } from '../support/auth';
import { createPendingOrder } from '../support/factories';
import { psql } from '../support/psql';

/**
 * Admin catalog constraint preconditions (AC-A6, FR-A5).
 *
 * The route handlers map PostgREST/Postgres error codes by operation:
 *   `23505` -> 409 UNIQUE_VIOLATION
 *   `23503` on delete destination -> 409 DESTINATION_IN_USE
 *   `23503` on delete package     -> 409 PACKAGE_IN_USE
 * Only the database half is asserted here; the HTTP mapping is unit-tested through
 * `adminGuard`/handlers. RLS role behaviour is already covered by `rls.test.ts`.
 *
 * R-3 (fixture isolation):
 * - the seeded catalog (`japan-5gb-15d` and the other 14 packages) is never referenced or
 *   deleted, so a constraint regression cannot remove data other test files depend on;
 * - the ordered fixture pair uses FIXED slugs, so repeated runs reuse two rows instead of
 *   accumulating one pair per run;
 * - fixture rows are `is_active = false` in their resting state, because other files assert
 *   the public catalog is exactly 5 destinations / 15 active packages.
 *
 * Cleanup note: the fixture ORDER itself cannot be removed. `orders_i2_consistency` and
 * `payments_i2_consistency` are DEFERRABLE INITIALLY DEFERRED triggers re-checking the pair at
 * COMMIT, so deleting an order together with its payment raises "I2: dangling reference".
 * Orders are permanent by design (single-writer, terminal states, no delete path), and
 * `rls.test.ts` leaves its pending orders behind as well.
 */
const suffix = randomUUID().replaceAll('-', '').slice(0, 8);

/** Two uppercase letters derived from the uuid, to avoid the UNIQUE (country_code) clash. */
function countryCodeFromSuffix(offset: number): string {
  const first = String.fromCharCode(65 + Number.parseInt(suffix[offset] ?? 'a', 16));
  const second = String.fromCharCode(65 + Number.parseInt(suffix[offset + 1] ?? 'b', 16));

  return `${first}${second}`;
}

const orderedDestinationSlug = 'admin-fixture-order-dest';
const orderedPackageSlug = 'admin-fixture-order-pkg';
const orderedCountryCode = 'ZQ';

const looseDestinationSlug = `fixture-loose-${suffix}`;
const loosePackageSlug = `fixture-loose-pkg-${suffix}`;
const looseCountryCode = countryCodeFromSuffix(0);
const duplicateSlug = `fixture-dup-${suffix}`;
const duplicateCountryCode = countryCodeFromSuffix(2);
const duplicateSecondCountryCode = countryCodeFromSuffix(4);

describe('admin catalog — constraint mapping preconditions', () => {
  let admin: SupabaseClient;
  let looseDestinationId = '';
  let orderedDestinationId = '';
  let orderedPackageId = '';

  async function findDestinationId(slug: string): Promise<string | null> {
    const { data, error } = await admin
      .from('destinations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      throw new Error(`fixture lookup failed: ${error.message}`);
    }

    return data === null ? null : String((data as { id: unknown }).id);
  }

  async function insertDestination(
    slug: string,
    countryCode: string,
    isActive: boolean,
  ): Promise<string> {
    const { data, error } = await admin
      .from('destinations')
      .insert({
        slug,
        country_code: countryCode,
        name: `Fixture ${slug}`,
        region: 'Antarctica',
        currency_code: 'ZZZ',
        summary: 'Fixture row created by the admin catalog integration test.',
        hero_image_url: 'https://upload.wikimedia.org/wikipedia/commons/fixture.jpg',
        hero_image_attribution: 'Fixture · test only',
        is_active: isActive,
        sort_order: 999,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`fixture destination insert failed: ${error?.message ?? 'no row'}`);
    }

    return String((data as { id: unknown }).id);
  }

  async function insertPackage(
    destinationId: string,
    slug: string,
    priceIdr: number,
    isActive: boolean,
  ): Promise<string> {
    const { data, error } = await admin
      .from('packages')
      .insert({
        destination_id: destinationId,
        slug,
        name: `Fixture ${slug}`,
        data_mb: 1024,
        is_unlimited: false,
        validity_days: 7,
        price_idr: priceIdr,
        is_active: isActive,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`fixture package insert failed: ${error?.message ?? 'no row'}`);
    }

    return String((data as { id: unknown }).id);
  }

  beforeAll(async () => {
    admin = await adminSession();

    // 1) Ordered fixture pair — fixed slugs, reused across runs, inactive at rest.
    const existingOrderedDestination = await findDestinationId(orderedDestinationSlug);

    orderedDestinationId =
      existingOrderedDestination ??
      (await insertDestination(orderedDestinationSlug, orderedCountryCode, false));
    await admin.from('destinations').update({ is_active: false }).eq('id', orderedDestinationId);

    const { data: existingOrderedPackage } = await admin
      .from('packages')
      .select('id')
      .eq('slug', orderedPackageSlug)
      .maybeSingle();

    if (existingOrderedPackage === null) {
      orderedPackageId = await insertPackage(orderedDestinationId, orderedPackageSlug, 60000, false);
    } else {
      orderedPackageId = String((existingOrderedPackage as { id: unknown }).id);
    }

    await admin.from('packages').update({ is_active: false }).eq('id', orderedPackageId);

    // 2) Loose fixture pair (no order) — deleted in afterAll.
    looseDestinationId = await insertDestination(looseDestinationSlug, looseCountryCode, false);
    await insertPackage(looseDestinationId, loosePackageSlug, 50000, false);
  });

  afterAll(async () => {
    // Only rows with no order behind them; the ordered pair stays (inactive) because orders
    // cannot be deleted (deferred I2 triggers + ON DELETE RESTRICT).
    psql(`
      delete from public.packages where slug = '${loosePackageSlug}';
      delete from public.destinations where slug in ('${looseDestinationSlug}', '${duplicateSlug}');
    `);
  });

  it('AC-A6: deleting a destination that still has packages fails with 23503', async () => {
    const { error } = await admin.from('destinations').delete().eq('id', looseDestinationId);

    expect(error?.code).toBe('23503');
  });

  it('FR-A5: deleting a package referenced by an order fails with 23503', async () => {
    // The RPC refuses an inactive package, so the pair is activated just for order creation.
    await admin.from('destinations').update({ is_active: true }).eq('id', orderedDestinationId);
    await admin.from('packages').update({ is_active: true }).eq('id', orderedPackageId);

    let orderNumber = '';

    try {
      const order = await createPendingOrder({ packageSlug: orderedPackageSlug });
      orderNumber = order.orderNumber;
    } finally {
      await admin.from('destinations').update({ is_active: false }).eq('id', orderedDestinationId);
      await admin.from('packages').update({ is_active: false }).eq('id', orderedPackageId);
    }

    expect(orderNumber).toMatch(/^RML-[A-Z0-9]{6}$/);

    const { error } = await admin.from('packages').delete().eq('id', orderedPackageId);

    expect(error?.code).toBe('23503');
  });

  it('duplicate slug fails with 23505', async () => {
    await insertDestination(duplicateSlug, duplicateCountryCode, false);

    const { error } = await admin.from('destinations').insert({
      slug: duplicateSlug,
      country_code: duplicateSecondCountryCode,
      name: 'Fixture duplicate',
      region: 'Antarctica',
      currency_code: 'ZZY',
      summary: 'Fixture duplicate row created by the admin catalog integration test.',
      hero_image_url: 'https://upload.wikimedia.org/wikipedia/commons/fixture.jpg',
      hero_image_attribution: 'Fixture · test only',
      is_active: false,
      sort_order: 999,
    });

    expect(error?.code).toBe('23505');
  });
});
