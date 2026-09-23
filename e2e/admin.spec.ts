import { test, expect } from '@playwright/test';
import { admin, login, seed, trackPageErrors } from './helpers';

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

test('the status override follows the order after it ships', async ({ page }) => {
  const { group_id } = seed();
  const [order] = await admin<{ id: string }[]>('/rest/v1/smarttag_orders', {
    method: 'POST',
    body: { group_id, pack: 'solo', quantity: 1, status: 'ready_to_ship' },
  });

  await login(page, 'admin@tiplink.dev');
  await page.goto(`/fr/dashboard/admin/orders/${order.id}`);
  const override = page.locator('select').last();
  await expect(override).toHaveValue('ready_to_ship');

  await page.getByRole('button', { name: 'Marquer comme expédiée' }).click();
  await expect(override).toHaveValue('shipped');
});
