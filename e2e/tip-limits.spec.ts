import { test, expect } from '@playwright/test';
import { admin } from './helpers';

// A slip of the thumb (1000 for 10) used to go straight to the card: the page
// accepted up to 100 000 €. The customer is now stopped at 500 € before paying.
test('a custom tip above 500 € is refused on the tip page', async ({ page }) => {
  const stamp = Date.now();
  const [group] = await admin<{ id: string }[]>('/rest/v1/groups', {
    method: 'POST',
    body: { name: `Plafond ${stamp}`, settings: { tip_thresholds: [5, 10, 20] } },
  });
  // Demo mode makes the page payable without a Stripe account.
  const [est] = await admin<{ id: string }[]>('/rest/v1/establishments', {
    method: 'POST',
    body: { group_id: group.id, name: `Plafond ${stamp}`, business_type: 'restaurant', slug: `plafond-${stamp}`, is_demo: true },
  });
  const [staff] = await admin<{ id: string }[]>('/rest/v1/staff_profiles', {
    method: 'POST',
    body: { establishment_id: est.id, full_name: 'Marc Serveur', is_active: true, onboarding_status: 'complete' },
  });

  await page.goto(`/fr/pay/${staff.id}`);
  await page.getByRole('button', { name: 'Montant personnalisé' }).click();
  const input = page.getByLabel('Montant personnalisé');

  await input.fill('600');
  await expect(page.getByText('Montant maximum 500,00 €')).toBeVisible();

  await input.fill('500');
  await expect(page.getByText('Montant maximum 500,00 €')).toHaveCount(0);
});
