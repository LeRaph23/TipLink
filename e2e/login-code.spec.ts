import { test, expect } from '@playwright/test';
import { DEMO_EMAIL, readOtp } from './helpers';

// The six-digit field submits itself on the last digit, and the "Valider"
// button is still on screen. Pressing it anyway (or a late autofill event)
// while the dashboard loads used to spend the code a second time: Supabase
// answered "token expired or invalid", the form flashed "Ce code n'est pas bon"
// and the first call's redirect landed half a second later.
test('a code typed then confirmed signs in without a spurious "invalid code"', async ({ page }) => {
  const verifyCalls: number[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/auth/v1/verify')) verifyCalls.push(res.status());
  });

  const since = new Date(Date.now() - 2000);
  await page.goto('/fr/login');
  await page.locator('#otp-email').fill(DEMO_EMAIL);
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  const code = await readOtp(DEMO_EMAIL, since);

  await page.locator('#otp-code').fill(code);
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });

  // One exchange, and it succeeded: a second one is the code spent twice.
  expect(verifyCalls).toEqual([200]);
});
