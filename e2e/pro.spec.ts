import { test, expect } from '@playwright/test';
import { admin, login, seed } from './helpers';

const reset = (group_id: string) =>
  admin(`/rest/v1/groups?id=eq.${group_id}`, {
    method: 'PATCH',
    body: { plan: 'free', subscription_status: null, trial_ends_at: null, pro_trial_started_at: null, pro_trial_ends_at: null },
  });

test('the Pro offer starts a trial without a card, and the tip page then asks for a compliment', async ({ page }) => {
  const { group_id } = seed();
  await reset(group_id);
  try {
    await login(page);
    await page.goto('/fr/dashboard/billing#pro');

    // What stays free is said before anything is sold.
    await expect(page.getByText('Relevés de paie, export et envoi au comptable')).toBeVisible();
    await page.getByRole('button', { name: 'Essayer 30 jours gratuitement' }).click();

    await expect(page.getByText('Essai gratuit en cours')).toBeVisible();
    await expect(page.getByText(/Aucune carte n'est enregistrée/)).toBeVisible();
    const [g] = await admin<{ pro_trial_ends_at: string | null }[]>(
      `/rest/v1/groups?id=eq.${group_id}&select=pro_trial_ends_at`,
    );
    expect(g.pro_trial_ends_at).not.toBeNull();

    // Pro now shows on the customer's side: the compliment form, in demo mode.
    const [staff] = await admin<{ id: string; full_name: string }[]>(
      `/rest/v1/staff_profiles?select=id,full_name&deleted_at=is.null&limit=1`,
    );
    await page.goto(`/fr/pay/success?demo=1&staff=${staff.id}&amt=500&cur=eur`);
    await page.getByRole('button', { name: 'Bons conseils' }).click();
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await expect(page.getByRole('status')).toContainText('recevra votre mot');

    // And the page that reads them opens on the manager's side.
    await page.goto('/fr/dashboard/compliments');
    await expect(page.getByRole('heading', { name: 'Compliments' })).toBeVisible();
  } finally {
    await reset(group_id);
  }
});

test('a free group sees an example, never real-looking data, on the compliments page', async ({ page }) => {
  const { group_id } = seed();
  await reset(group_id);
  await login(page);
  await page.goto('/fr/dashboard/compliments');
  await expect(page.getByText('Les compliments font partie de Digitip Pro')).toBeVisible();
  await expect(page.getByText('Exemple')).toBeVisible();
});
