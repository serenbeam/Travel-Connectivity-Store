import { expect, type Page } from '@playwright/test';

/**
 * Navigation helper shared by the two customer-side tests.
 *
 * It follows the real storefront route (listing → destination → package → checkout) instead
 * of hardcoding seed slugs: the customer flow must keep working when the catalog changes,
 * and the catalog is not owned by the test. Every selector is a role or an `href` prefix, so
 * the layout can be restyled without breaking the flow.
 */
export interface CheckoutRoute {
  destinationSlug: string;
  packageSlug: string;
}

export async function openFirstPackageCheckout(page: Page): Promise<CheckoutRoute> {
  await page.goto('/destinations');

  await expect(page.getByRole('heading', { level: 1, name: 'Destinations' })).toBeVisible();

  // First destination card (the region chips link to `/destinations?region=…`, so an
  // `/destinations/<slug>` prefix selects cards only).
  const firstDestination = page.locator('main a[href^="/destinations/"]').first();
  await expect(firstDestination).toBeVisible();
  await firstDestination.click();

  await expect(page).toHaveURL(/\/destinations\/[a-z0-9-]+$/);

  await page.getByRole('link', { name: 'View details' }).first().click();

  await expect(page).toHaveURL(/\/destinations\/[a-z0-9-]+\/packages\/[a-z0-9-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('link', { name: 'Continue to checkout' }).click();

  await expect(page).toHaveURL(/\/checkout\?destination=/);
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();

  const url = new URL(page.url());

  return {
    destinationSlug: url.searchParams.get('destination') ?? '',
    packageSlug: url.searchParams.get('package') ?? '',
  };
}

/** Fills the guest form with values the shared Zod schema accepts. */
export async function fillGuestForm(page: Page): Promise<void> {
  // The name schema is letters, marks, spaces, periods, apostrophes and hyphens only —
  // a digit here would be rejected client-side exactly as the API would reject it.
  await page.getByLabel('Full name').fill('Guest Traveller');
  await page.getByLabel('Email').fill('e2e-guest@roamly.test');
  await page.getByLabel('Phone (international format)').fill('6281234567890');
}
