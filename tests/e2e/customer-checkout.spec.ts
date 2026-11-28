import { expect, test } from '@playwright/test';

import { fillGuestForm, openFirstPackageCheckout } from './support/storefront';

/**
 * E-8 customer flow (AC-P1, AC-C7): the storefront path a visitor actually takes.
 *
 * Destination listing → destination → package → guest checkout → simulated provider
 * success → server-side verification → order page says paid.
 *
 * Deliberate constraints:
 * - catalog data is used as-is (no price or package mutation);
 * - the browser never sends a settlement outcome: it clicks the simulated provider page,
 *   which records the choice, and `/api/payments/verify` re-reads that record;
 * - the capability token is never asserted, printed, or attached — only the order number,
 *   which is not an authorization secret.
 *
 * The order created here stays in the local database: `orders` has no delete path by
 * design (single-writer functions, no cleanup job in the MVP).
 */

test.describe('guest checkout', () => {
  test('destination → package → checkout → simulated success → order paid', async ({
    page,
  }, testInfo) => {
    await openFirstPackageCheckout(page);
    await fillGuestForm(page);

    // The submitted price is never assembled in the browser; only the quantity is chosen.
    const payButton = page.getByRole('button', { name: /^Pay / });
    await expect(payButton).toBeVisible();
    await payButton.click();

    // Simulated provider page (dev only, MOCK_GATEWAY_ENABLED=true).
    await expect(page).toHaveURL(/\/mock-gateway\/[A-Za-z0-9_]+/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Simulated payment page' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Simulate success' }).click();

    // Only after the server verified the provider record does the browser land here.
    await expect(page).toHaveURL(/\/orders\/[A-Za-z0-9_-]{43}$/);

    await expect(page.getByRole('heading', { level: 1, name: 'Payment confirmed' })).toBeVisible();
    await expect(page.getByText('Paid', { exact: true })).toBeVisible();
    await expect(page.locator('section[aria-label="Payment status"]')).toContainText('succeeded');
    await expect(page.locator('section[aria-label="Order details"]')).toContainText('Paid at');

    const orderNumber = await page
      .locator('section[aria-label="Order details"] dt', { hasText: 'Order number' })
      .locator('xpath=following-sibling::dd')
      .innerText();

    // Order number = evidence for the report. It is not the capability token.
    await testInfo.attach('order-number', { body: orderNumber, contentType: 'text/plain' });
    console.log(`e2e: order paid → ${orderNumber}`);
  });

  /**
   * Simple responsive check (NFR9, design §10): the guest form is the densest customer
   * screen, so the smallest supported viewport must not scroll sideways.
   */
  test.describe('mobile layout', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the guest checkout form does not overflow horizontally at 390×844', async ({ page }) => {
      await openFirstPackageCheckout(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      expect(overflow, 'horizontal overflow in CSS pixels').toBeLessThanOrEqual(0);

      // The primary action must still be a full-height touch target inside the viewport.
      const payButton = page.getByRole('button', { name: /^Pay / });
      await expect(payButton).toBeVisible();

      const box = await payButton.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    });
  });
});
