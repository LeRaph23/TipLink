import { test, expect } from '@playwright/test';
import { admin, login, seed } from './helpers';

test('a group on the default three tip amounts keeps three, without a duplicate', async ({ page }) => {
  const { group_id } = seed();
  // The default every new group gets (webhook, checkout, createGroup).
  await admin(`/rest/v1/groups?id=eq.${group_id}`, {
    method: 'PATCH',
    body: { settings: { tip_thresholds: [5, 10, 20], default_currency: 'EUR' } },
  });

  await login(page);
  await page.goto('/fr/dashboard/settings');
  const amounts = page.locator('input[type="number"]');
  await expect(amounts).toHaveCount(4);
  await expect(amounts.nth(3)).toHaveValue('');

  // Saving untouched must not turn 5/10/20 into 5/10/20/20.
  await page.getByRole('button', { name: /enregistrer/i }).first().click();
  await expect.poll(async () => {
    const [g] = await admin<{ settings: { tip_thresholds: number[] } }[]>(
      `/rest/v1/groups?id=eq.${group_id}&select=settings`
    );
    return g.settings.tip_thresholds;
  }).toEqual([5, 10, 20]);

  // A repeated amount is refused.
  await amounts.nth(3).fill('20');
  await page.getByRole('button', { name: /enregistrer/i }).first().click();
  await expect(page.getByText('Chaque montant ne peut apparaître qu’une fois.')).toBeVisible();
});
