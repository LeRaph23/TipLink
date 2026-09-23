import { test, expect } from '@playwright/test';
import { login, trackPageErrors } from './helpers';

// The local super admin created by scripts/e2e/up.sh ships SmartTags to paid
// orders; the pages it needs for that must open.
const ADMIN_PAGES = ['/fr/dashboard/admin', '/fr/dashboard/admin/orders', '/fr/dashboard/admin/smarttags'];

test('super admin reaches the fulfilment pages', async ({ page }) => {
  const errors = trackPageErrors(page);
  await login(page, 'admin@tiplink.dev');
  for (const path of ADMIN_PAGES) {
    await test.step(path, async () => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} status`).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/') + '$'));
      await expect(page.getByText('Une erreur est survenue')).toHaveCount(0);
    });
  }
  expect(errors, 'uncaught page errors').toEqual([]);
});
