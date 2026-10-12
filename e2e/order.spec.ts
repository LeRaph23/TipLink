import { test, expect } from '@playwright/test';
import { DEMO_EMAIL, STRIPE_OFFLINE, login } from './helpers';

// Ordering is one page, /checkout, for everyone: the former five-step wizard
// at /order/[pack] made a visitor create and verify an account before paying.

// The checkout reads the pack prices from Stripe.
test.skip(STRIPE_OFFLINE, 'needs Stripe test keys in .env.e2e');

test('an old order link lands on the one-page checkout', async ({ page }) => {
  await page.goto('/fr/order/solo?step=account');
  await expect(page).toHaveURL(/\/fr\/checkout\?pack=solo$/);
  await expect(page.locator('#checkout-email')).toBeVisible();
});

test('signed in, the checkout is filled in with the account', async ({ page }) => {
  await login(page);
  await page.goto('/fr/order/duo');
  await expect(page).toHaveURL(/\/fr\/checkout\?pack=duo$/);
  await expect(page.getByText(`Connecté en tant que ${DEMO_EMAIL}`)).toBeVisible();
  await expect(page.locator('#checkout-email')).toHaveCount(0);
});
