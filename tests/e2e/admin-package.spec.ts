import { expect, test, type Page } from '@playwright/test';

import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from './support/admin-fixture';

/**
 * E-8 admin flow (AC-A1, AC-A5, and the KI-39 interaction gap): login, then catalog write
 * through the real UI.
 *
 * Safety rules for the fixture:
 * - the slug is unique per run, so it can never collide with, or overwrite, a seed package;
 * - only the row created by this run is deleted, by its own name, at the end;
 * - when the flow fails before cleanup, nothing is deleted: an unidentified leftover must
 *   be inspected manually instead of guessing (it is reported in the log/attachment).
 *
 * The password comes from the local test fixture, is typed into the form only, and is
 * never written to a report.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)
  .toString(36)
  .padStart(3, '0')}`;
const FIXTURE_NAME = `E2E Fixture ${RUN_ID}`;
const FIXTURE_SLUG = `e2e-fixture-${RUN_ID}`;
const INITIAL_PRICE_IDR = 123_000;
const UPDATED_PRICE_IDR = 130_000;

function idr(amount: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID').format(amount)}`;
}

async function signIn(page: Page, password: string): Promise<void> {
  await page.getByLabel('Email').fill(E2E_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('admin package management', () => {
  test('login, create a package, edit its price, then delete only that package', async ({
    page,
  }, testInfo) => {
    await testInfo.attach('fixture', {
      body: `name=${FIXTURE_NAME}\nslug=${FIXTURE_SLUG}`,
      contentType: 'text/plain',
    });

    // 1) Wrong credentials first: one generic message, no account probing.
    //    Scoped to <main>: Next.js renders its own route-announcer with role="alert".
    await page.goto('/admin/login');
    await signIn(page, 'not-the-admin-password');
    await expect(page.locator('main').getByRole('alert')).toHaveText('Wrong email or password.');
    await expect(page).toHaveURL(/\/admin\/login$/);

    // 2) The fixture admin from global-setup.
    await signIn(page, E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

    // 3) Package management.
    await page.getByRole('link', { name: 'Paket' }).click();
    await expect(page).toHaveURL(/\/admin\/packages$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Packages' })).toBeVisible();

    // 4) Create the fixture package.
    await page.getByRole('link', { name: 'New package' }).click();
    await expect(page).toHaveURL(/\/admin\/packages\/new$/);

    await page.getByLabel('Name').fill(FIXTURE_NAME);
    await page.getByLabel('Slug').fill(FIXTURE_SLUG);
    await page.getByLabel('Data volume (MB)').fill('5000');
    await page.getByLabel('Validity (days)').fill('30');
    await page.getByLabel('Price (IDR, integer)').fill(String(INITIAL_PRICE_IDR));
    await page.getByRole('button', { name: 'Create package' }).click();

    // 5) It is saved and visible in the list.
    await expect(page).toHaveURL(/\/admin\/packages$/);
    const fixtureRow = page.getByRole('row').filter({ hasText: FIXTURE_SLUG });
    await expect(fixtureRow).toHaveCount(1);
    await expect(fixtureRow).toContainText(FIXTURE_NAME);
    await expect(fixtureRow).toContainText(idr(INITIAL_PRICE_IDR));

    // 6) Edit the price.
    await fixtureRow.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/admin\/packages\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(FIXTURE_NAME);

    await page.getByLabel('Price (IDR, integer)').fill(String(UPDATED_PRICE_IDR));
    await page.getByRole('button', { name: 'Save changes' }).click();

    // 7) The new price is what the list shows (nothing is cached: the page is dynamic).
    await expect(page).toHaveURL(/\/admin\/packages$/);
    await expect(fixtureRow).toContainText(idr(UPDATED_PRICE_IDR));

    // 8) Cleanup: only this run's fixture, by its own name.
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain(FIXTURE_NAME);
      void dialog.accept();
    });
    await fixtureRow.getByRole('button', { name: `Delete ${FIXTURE_NAME}` }).click();
    await expect(page.getByRole('row').filter({ hasText: FIXTURE_SLUG })).toHaveCount(0);
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) {
    return;
  }

  // A failed run may leave the fixture behind. It is NOT deleted automatically: ownership
  // is only provable from the happy path. Report it for a manual decision.
  console.warn(
    `e2e: possible leftover fixture (manual cleanup required): name="${FIXTURE_NAME}" slug="${FIXTURE_SLUG}"`,
  );
});
