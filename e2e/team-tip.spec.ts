import { test, expect } from '@playwright/test';
import { admin, seed, trackPageErrors } from './helpers';

// Found by the fifth QA run: a verified establishment whose staff had only been
// invited showed "Aucun membre de l'équipe n'est encore prêt" on its tag page,
// so its first customers could not tip at all.
test('a payable establishment takes team tips before anyone has joined', async ({ page }) => {
  const errors = trackPageErrors(page);
  const { group_id } = seed();
  const suffix = Date.now().toString(36);
  const [estab] = await admin<{ id: string }[]>('/rest/v1/establishments', {
    method: 'POST',
    body: {
      group_id, name: `Bistro Invités ${suffix}`, slug: `bistro-invites-${suffix}`, business_type: 'restaurant',
      country: 'FR', currency: 'eur', stripe_account_id: 'acct_e2e_invited',
      stripe_charges_enabled: true, stripe_payouts_enabled: true,
    },
  });
  // Two members added by the manager, invitation not accepted (inactive, no account).
  await admin('/rest/v1/staff_profiles', {
    method: 'POST',
    body: [
      { establishment_id: estab.id, full_name: 'Marc Invité', is_active: false },
      { establishment_id: estab.id, full_name: 'Sophie Invitée', is_active: false },
    ],
  });

  await page.goto(`/fr/pay/group/${estab.id}`);
  await expect(page.getByText("Aucun membre de l'équipe n'est encore prêt")).toHaveCount(0);
  // Invited people are not listed by name on a public page…
  await expect(page.getByText('Marc Invité')).toHaveCount(0);
  // …but the whole team can be tipped.
  await page.getByRole('link', { name: /Toute l'équipe/ }).click();
  await expect(page).toHaveURL(new RegExp(`/pay/group/${estab.id}/team`));
  await expect(page.getByText('2 membres')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an establishment with nobody on the team still says so', async ({ page }) => {
  const { group_id } = seed();
  const suffix = Date.now().toString(36);
  const [estab] = await admin<{ id: string }[]>('/rest/v1/establishments', {
    method: 'POST',
    body: {
      group_id, name: `Bistro Vide ${suffix}`, slug: `bistro-vide-${suffix}`, business_type: 'restaurant',
      country: 'FR', currency: 'eur', stripe_account_id: 'acct_e2e_empty',
      stripe_charges_enabled: true, stripe_payouts_enabled: true,
    },
  });
  await page.goto(`/fr/pay/group/${estab.id}`);
  await expect(page.getByText("Aucun membre de l'équipe n'est encore prêt")).toBeVisible();
  expect((await page.goto(`/fr/pay/group/${estab.id}/team`))?.status()).toBe(404);
});
