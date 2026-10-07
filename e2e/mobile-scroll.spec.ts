import { test, expect, devices, type Page } from '@playwright/test';
import { login } from './helpers';

// A phone, touch and all. The dashboard used to scroll an inner <main> under
// a 100dvh frame; on a phone that left pages you could scroll down and not
// back up. The page itself must scroll now, both ways, with a finger.
test.use({ ...devices['Pixel 7'] });

/** A finger swipe: positive `dy` moves the finger up, scrolling the page down. */
async function swipe(page: Page, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  const x = 200;
  const from = dy > 0 ? 700 : 150;
  const steps = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from - (dy * i) / steps }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('the dashboard scrolls down and back up with a finger', async ({ page }) => {
  await login(page);
  await page.goto('/fr/dashboard');
  await expect(page.locator('.mob-bar')).toBeVisible();

  // The document scrolls, not a box inside it.
  const overflow = await page.locator('main.dash-main').evaluate((el) => getComputedStyle(el).overflowY);
  expect(overflow).toBe('visible');
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
  test.skip(!scrollable, 'dashboard shorter than the screen');

  for (let i = 0; i < 3; i++) await swipe(page, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  for (let i = 0; i < 6; i++) await swipe(page, -500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  // The top bar stays reachable.
  await expect(page.locator('.mob-bar')).toBeInViewport();
});

test('a help video opens full size and gives the page its scroll back', async ({ page }) => {
  await page.goto('/fr/aide');
  await page.getByRole('button', { name: /Activer ma plaque.*ouvrir en grand/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('video[controls]')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer la vidéo' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
});
