import { test, expect } from '@playwright/test';
import { STRIPE_OFFLINE, trackPageErrors } from './helpers';

// These pages read pack prices from Stripe and have no fallback when the API
// call fails, so they cannot render without real Stripe test keys.
const NEEDS_STRIPE = new Set(['/fr/pricing']);

// Pages anyone can reach without an account. Run on desktop and mobile.
const PAGES = ['/fr', '/fr/pricing', '/fr/login', '/fr/signup', '/fr/contact', '/en'];

for (const path of PAGES) {
  test(`${path} renders`, async ({ page }) => {
    test.skip(STRIPE_OFFLINE && NEEDS_STRIPE.has(path), 'needs E2E_STRIPE_SECRET_KEY (prices come from Stripe)');
    const errors = trackPageErrors(page);
    const res = await page.goto(path);
    expect(res?.status(), 'HTTP status').toBeLessThan(400);
    await expect(page.getByText('Une erreur est survenue')).toHaveCount(0);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(errors, 'uncaught page errors').toEqual([]);
  });
}

test('unknown NFC short id lands on not-found', async ({ page }) => {
  await page.goto('/s/zzzz9999');
  await expect(page).toHaveURL(/not-found/);
});
