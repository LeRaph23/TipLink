import { test, expect } from '@playwright/test';
import { admin, login, seed } from './helpers';

// Paid-ads measurement: which campaign brought each order, and the Meta pixel
// behind an opt-in banner. See lib/marketing and components/marketing.

test('a tagged visit is remembered for 30 days, without any identifier', async ({ page, context }) => {
  await page.goto('/fr/solutions/tatoueur?utm_source=meta&utm_campaign=e2e&fbclid=IwAR_e2e');
  const cookie = (await context.cookies()).find((c) => c.name === 'dt_attr');
  expect(cookie, 'attribution cookie').toBeTruthy();
  expect(cookie!.httpOnly).toBe(true);
  const value = JSON.parse(decodeURIComponent(cookie!.value));
  expect(value).toMatchObject({ source: 'meta', campaign: 'e2e', landing: '/solutions/tatoueur' });
  expect(cookie!.value).not.toContain('IwAR_e2e');
});

test('admin sees paid orders per campaign', async ({ page }) => {
  const { group_id } = seed();
  const campaign = `e2e-${Date.now()}`;
  await admin('/rest/v1/smarttag_orders', {
    method: 'POST',
    body: {
      group_id, pack: 'solo', quantity: 1, status: 'pending_fulfillment',
      attribution: { source: 'meta', campaign, at: new Date().toISOString() },
    },
  });

  await login(page, 'admin@tiplink.dev');
  await page.goto('/fr/dashboard/admin/orders');
  await expect(page.getByRole('heading', { name: 'Acquisition, 30 derniers jours' })).toBeVisible();
  await expect(page.getByRole('cell', { name: campaign, exact: true })).toBeVisible();
  await expect(page.getByText(`meta · ${campaign}`)).toBeVisible();
});

// Needs a pixel id: set E2E_META_PIXEL_ID in .env.e2e and in the shell that
// runs Playwright. Without one the site shows no banner at all, by design.
test.describe('Meta pixel consent', () => {
  test.skip(!process.env.E2E_META_PIXEL_ID, 'E2E_META_PIXEL_ID not set');

  test('nothing loads before consent, and refusing is as easy as accepting', async ({ page }) => {
    await page.goto('/fr/solutions/tatoueur');
    const banner = page.getByRole('dialog', { name: 'Gérer les cookies' });
    await expect(banner).toBeVisible();
    expect(await page.evaluate(() => typeof window.fbq)).toBe('undefined');

    await banner.getByRole('button', { name: 'Refuser' }).click({ force: true });
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => typeof window.fbq)).toBe('undefined');
  });

  test('accepting starts the pixel with the page events', async ({ page }) => {
    await page.goto('/fr/solutions/tatoueur');
    await page.getByRole('button', { name: 'Accepter' }).click({ force: true });
    const queued = await page.evaluate(() =>
      ((window.fbq as unknown as { queue?: unknown[] })?.queue ?? []).map((a) => JSON.stringify(a)),
    );
    expect(queued).toContain(JSON.stringify(['track', 'PageView']));
    expect(queued.some((e) => e.includes('ViewContent') && e.includes('tatoueur'))).toBe(true);
  });

  test('never asks on the tipping page', async ({ page }) => {
    const { establishment_id } = seed();
    await page.goto(`/fr/pay/group/${establishment_id}`);
    await expect(page.getByText('Envie de dire merci ?')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Gérer les cookies' })).toHaveCount(0);
  });
});
