import { test, expect } from '@playwright/test';
import { STRIPE_OFFLINE, trackPageErrors } from './helpers';

// Found by the fifth QA run on /order: after a reload the fields looked empty
// until the saved order came back, and text typed meanwhile was appended to
// it ("12 rue de la Paix12 rue de la Paix"); and Back after paying reopened
// the review step of an order that had just been cleared.

// The order pages read the pack prices from Stripe.
test.skip(STRIPE_OFFLINE, 'needs Stripe test keys in .env.e2e');

test('a reload shows the saved address, never empty fields to type into', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto('/fr/order/solo?step=shipping');
  await page.locator('#order-line1').fill('12 rue de la Paix');
  await page.locator('#order-city').fill('Paris');

  await page.reload();
  // The first thing on screen is either the loading line or the filled field,
  // never an empty field.
  await expect(page.locator('#order-line1')).toHaveValue('12 rue de la Paix');
  expect(errors).toEqual([]);
});

test('a step past what the order allows sends back to the first step to fill', async ({ page }) => {
  // What Back after paying opens: the review step, with the order cleared.
  await page.goto('/fr/order/solo?step=review');
  await expect(page.locator('#order-line1')).toBeVisible();
  await expect(page.getByRole('button', { name: /Procéder au paiement/ })).toHaveCount(0);
});
