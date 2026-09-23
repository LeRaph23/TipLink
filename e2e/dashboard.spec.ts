import { test, expect } from '@playwright/test';
import { login, trackPageErrors } from './helpers';

// The seeded demo manager (see app/api/dev/seed-demo) walks the dashboard.
const MANAGER_PAGES = [
  '/fr/dashboard',
  '/fr/dashboard/staff',
  '/fr/dashboard/establishments',
  '/fr/dashboard/analytics',
  '/fr/dashboard/paiements',
  '/fr/dashboard/statements',
  '/fr/dashboard/stickers',
  '/fr/dashboard/settings',
  '/fr/dashboard/billing',
];

test.describe.configure({ mode: 'serial' });

test('manager logs in with an email code and browses every dashboard page', async ({ page }) => {
  const errors = trackPageErrors(page);
  await login(page);

  for (const path of MANAGER_PAGES) {
    await test.step(path, async () => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} status`).toBeLessThan(400);
      await expect(page, `${path} kept the session`).toHaveURL(new RegExp(path.replace(/\//g, '\\/')));
      await expect(page.getByText('Une erreur est survenue')).toHaveCount(0);
      await page.screenshot({ path: `.e2e/screens${path.replace(/\//g, '_')}.png`, fullPage: true });
    });
  }
  expect(errors, 'uncaught page errors').toEqual([]);
});

test('seeded staff appear and their public tip page opens', async ({ page }) => {
  await login(page);
  await page.goto('/fr/dashboard/staff');
  await expect(page.getByText('Alice Martin').first()).toBeVisible();

  // Open the first staff detail page, then that person's public /pay page.
  await page.locator('a[href*="/dashboard/staff/"]:not([href$="/new"])').first().click();
  await expect(page).toHaveURL(/\/dashboard\/staff\/[0-9a-f-]{36}/);
  const staffId = page.url().match(/staff\/([0-9a-f-]{36})/)![1];
  await expect(page.getByText('Une erreur est survenue')).toHaveCount(0);

  const errors = trackPageErrors(page);
  const res = await page.goto(`/fr/pay/${staffId}`);
  expect(res?.status()).toBeLessThan(400);
  await expect(page.getByText('Une erreur est survenue')).toHaveCount(0);
  // The demo establishment has no real Stripe account, so its staff show the
  // "not active yet" card; with Stripe keys and a connected account they show
  // the tip form under their name.
  await expect(page.getByText(/Pas encore actif|Alice|Benoît|Clara|David/).first()).toBeVisible();
  await page.screenshot({ path: '.e2e/screens_pay.png', fullPage: true });
  expect(errors, 'uncaught page errors').toEqual([]);
});
