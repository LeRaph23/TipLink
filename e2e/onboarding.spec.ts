import { test, expect } from '@playwright/test';
import { admin, createUser, login } from './helpers';

test('the Google review step refuses a link that would never be saved', async ({ page }) => {
  // A freshly paid pack leaves a group_admin whose group is not onboarded yet
  // (what the Stripe webhook creates); start from that state.
  const stamp = Date.now();
  const email = `gerant.${stamp}@exemple.fr`;
  const userId = await createUser(email);
  const [group] = await admin<{ id: string }[]>('/rest/v1/groups', {
    method: 'POST',
    body: { name: `Café Test ${stamp}`, settings: {} },
  });
  await admin('/rest/v1/user_roles', {
    method: 'POST',
    body: { user_id: userId, role: 'group_admin', group_id: group.id },
  });
  await admin('/rest/v1/establishments', {
    method: 'POST',
    body: { group_id: group.id, name: `Café Test ${stamp}`, address: '10 rue de Test, 75001 Paris', business_type: 'restaurant', slug: `cafe-test-${stamp}` },
  });
  await login(page, email);
  await page.goto('/fr/onboarding');

  // Without a Places API key the automatic search fails and the picker drops
  // into manual entry by itself; only click through if it has not.
  const input = page.getByPlaceholder('https://g.page/r/…/review');
  const manual = page.getByRole('button', { name: 'Saisir le lien manuellement' });
  await expect(input.or(manual).first()).toBeVisible();
  if (!(await input.isVisible())) {
    await manual.click({ timeout: 5_000 }).catch(() => {});
    await expect(input).toBeVisible();
  }
  await input.fill('pas un lien');
  await page.getByRole('button', { name: 'Enregistrer le lien' }).click();
  await expect(page.getByText('Saisissez un lien d’avis Google valide.')).toBeVisible();

  await input.fill('https://g.page/r/CafeTestJulie');
  await page.getByRole('button', { name: 'Enregistrer le lien' }).click();
  await expect(page.getByText('Saisissez un lien d’avis Google valide.')).toHaveCount(0);
});
