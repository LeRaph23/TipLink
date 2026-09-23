import { test, expect, type Page } from '@playwright/test';
import { admin, createUser, login } from './helpers';

// Reproduces the second QA run: tips paid with the service fee on top, a
// manager with no staff profile, an employee signed in. Every figure must be
// the tips themselves (10,00 + 7,50 = 17,50 €), never 0 € and never the gross
// amounts the customers paid (10,75 + 8,13 = 18,88 €).

test('manager and employee dashboards show the tips, not 0 € nor the fees', async ({ page }) => {
  const stamp = Date.now();

  // A fresh group, so other specs' data cannot change the totals.
  const [group] = await admin<{ id: string }[]>('/rest/v1/groups', {
    method: 'POST',
    body: { name: `Bistro Tips ${stamp}`, settings: {}, onboarding_completed_at: new Date().toISOString() },
  });
  const [est] = await admin<{ id: string }[]>('/rest/v1/establishments', {
    method: 'POST',
    body: { group_id: group.id, name: `Bistro Tips ${stamp}`, business_type: 'restaurant', slug: `bistro-tips-${stamp}` },
  });
  const managerEmail = `gerante.tips.${stamp}@exemple.fr`;
  const managerId = await createUser(managerEmail);
  await admin('/rest/v1/user_roles', { method: 'POST', body: { user_id: managerId, role: 'group_admin', group_id: group.id } });

  const staffEmail = `serveur.tips.${stamp}@exemple.fr`;
  const staffUserId = await createUser(staffEmail);
  const [staff] = await admin<{ id: string }[]>('/rest/v1/staff_profiles', {
    method: 'POST',
    body: { establishment_id: est.id, user_id: staffUserId, full_name: 'Marc Serveur', is_active: true, onboarding_status: 'complete' },
  });
  await admin('/rest/v1/user_roles', { method: 'POST', body: { user_id: staffUserId, role: 'staff', establishment_id: est.id } });

  // What the webhook writes for two paid tips: the transaction carries what
  // the customer paid, the allocation carries the tip.
  const txnIds: string[] = [];
  for (const [gross, tip] of [[1075, 1000], [813, 750]]) {
    const [txn] = await admin<{ id: string }[]>('/rest/v1/transactions', {
      method: 'POST',
      body: {
        amount: gross, currency: 'EUR', establishment_id: est.id, staff_id: staff.id, status: 'succeeded',
        idempotency_key: `tips-dash-${stamp}-${gross}`, metadata: { tip_amount: tip, service_fee: gross - tip },
      },
    });
    txnIds.push(txn.id);
    await admin('/rest/v1/tip_allocations', {
      method: 'POST',
      body: { transaction_id: txn.id, staff_id: staff.id, amount: tip, status: 'allocated', allocated_at: new Date().toISOString() },
    });
  }

  // Manager, no staff profile: the team's tips.
  await login(page, managerEmail);
  await page.goto('/fr/dashboard');
  await expect(totalCard(page)).toContainText('17,50');
  await expect(totalCard(page)).toContainText("toute l'équipe");
  await page.goto('/fr/dashboard/transactions');
  await expect(page.getByText('Total reçu: 17,50 €')).toBeVisible();
  await page.goto(`/fr/dashboard/staff/${staff.id}`);
  await expect(page.getByText('10,00 €')).toBeVisible();
  await expect(page.getByText('10,75 €')).toHaveCount(0);

  // The receipt splits what the card was charged into tip and service fee.
  await page.goto(`/fr/receipt/${txnIds[0]}`);
  await expect(page.getByRole('row', { name: /Pourboire\s+10,00/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Frais de service\s+0,75/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Total débité\s+10,75/ })).toBeVisible();

  // Without an account, a made-up payment secret opens nothing.
  await page.context().clearCookies();
  const res = await page.goto(`/fr/receipt/${txnIds[0]}?pi=pi_fake&cs=pi_fake_secret_x`);
  expect(res?.status()).toBe(404);

  // Employee: their own share, the same figure.
  await page.context().clearCookies();
  await login(page, staffEmail);
  await page.goto('/fr/dashboard');
  await expect(totalCard(page)).toContainText('17,50');
  await page.goto('/fr/dashboard/transactions');
  await expect(page.getByText('Total reçu: 17,50 €')).toBeVisible();
  await expect(page.getByText('18,88 €')).toHaveCount(0);
});

/** The "Total perçu" stat card (not the payout banner, which can show the same sum). */
function totalCard(page: Page) {
  return page.getByText('Total perçu', { exact: true }).locator('xpath=..');
}
