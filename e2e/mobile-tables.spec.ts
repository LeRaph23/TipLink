import { test, expect, devices } from '@playwright/test';
import { login } from './helpers';

// On a phone, dashboard tables scroll sideways inside their card when wide,
// and fill the card when narrow. They used to get `display: block`, which
// shrank a narrow table to its content and left half the card empty.
test.use({ ...devices['Pixel 7'] });

for (const path of ['/fr/dashboard/statements', '/fr/dashboard/staff', '/fr/dashboard']) {
  test(`tables fill their card on mobile: ${path}`, async ({ page }) => {
    await login(page);
    await page.goto(path);
    await page.screenshot({ path: `.e2e/test-results/mobile-tables${path.replace(/\//g, '_')}.png`, fullPage: true });

    const tables = page.locator('.dash-main-pad table');
    const n = await tables.count();
    test.skip(n === 0, 'no table on this page');
    for (let i = 0; i < n; i++) {
      const { table, parent } = await tables.nth(i).evaluate((el) => ({
        table: el.getBoundingClientRect().width,
        parent: el.parentElement!.clientWidth,
      }));
      expect(table).toBeGreaterThanOrEqual(parent - 1);
    }
    // A wide table scrolls in its own box, never the page.
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(pageOverflow).toBeLessThanOrEqual(0);
  });
}
