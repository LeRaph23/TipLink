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

test('a cancelled Pro subscription says when it ends instead of announcing a charge', async ({ page }) => {
  const { group_id } = seed();
  const inTwoWeeks = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  await admin(`/rest/v1/groups?id=eq.${group_id}`, {
    method: 'PATCH',
    body: { plan: 'pro', subscription_status: 'trialing', trial_ends_at: inTwoWeeks, subscription_cancel_at: inTwoWeeks },
  });
  try {
    await login(page);
    await page.goto('/fr/dashboard/billing');
    await expect(page.getByText('Abonnement résilié')).toBeVisible();
    await expect(page.getByText(/l'abonnement démarre/)).toHaveCount(0);
  } finally {
    await admin(`/rest/v1/groups?id=eq.${group_id}`, {
      method: 'PATCH',
      body: { plan: 'free', subscription_status: null, trial_ends_at: null, subscription_cancel_at: null },
    });
  }
});
