import { test, expect } from '@playwright/test';
import { admin, login, seed, trackPageErrors } from './helpers';

// The local super admin created by scripts/e2e/up.sh ships SmartTags to paid
// orders; the pages it needs for that must open.
const ADMIN_PAGES = ['/fr/dashboard/admin', '/fr/dashboard/admin/orders', '/fr/dashboard/admin/smarttags'];

test('super admin reaches the fulfilment pages', async ({ page }) => {
  const errors = trackPageErrors(page);
  await login(page, 'admin@tiplink.dev');
  for (const path of ADMIN_PAGES) {
    await test.step(path, async () => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} status`).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/') + '$'));
      await expect(page.getByText('Une erreur est survenue')).toHaveCount(0);
    });
  }
  expect(errors, 'uncaught page errors').toEqual([]);
});

test('the status override follows the order after it ships', async ({ page }) => {
  const { group_id } = seed();
  const [order] = await admin<{ id: string }[]>('/rest/v1/smarttag_orders', {
    method: 'POST',
    body: { group_id, pack: 'solo', quantity: 1, status: 'ready_to_ship', tags_encoded_count: 1 },
  });

  await login(page, 'admin@tiplink.dev');
  await page.goto(`/fr/dashboard/admin/orders/${order.id}`);
  const override = page.locator('select').last();
  await expect(override).toHaveValue('ready_to_ship');

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Marquer comme expédiée' }).click();
  await expect(override).toHaveValue('shipped');
});

test('an order cannot ship before its tags are programmed', async ({ page }) => {
  const { group_id } = seed();
  const [order] = await admin<{ id: string }[]>('/rest/v1/smarttag_orders', {
    method: 'POST',
    body: { group_id, pack: 'solo', quantity: 1, status: 'ready_to_ship', tags_encoded_count: 0 },
  });

  await login(page, 'admin@tiplink.dev');
  await page.goto(`/fr/dashboard/admin/orders/${order.id}`);
  // Declining the confirmation changes nothing…
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Marquer comme expédiée' }).click();
  await expect(page.locator('select').last()).toHaveValue('ready_to_ship');
  // …and confirming is refused while 0/1 tag is programmed.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Marquer comme expédiée' }).click();
  await expect(page.getByText('Encodez d’abord les tags : 0/1 prêts.')).toBeVisible();
});

test('a free message to the customer carries the attached files', async ({ page }) => {
  const { group_id } = seed();
  const [order] = await admin<{ id: string }[]>('/rest/v1/smarttag_orders', {
    method: 'POST',
    body: { group_id, pack: 'solo', quantity: 1, status: 'shipped' },
  });

  await login(page, 'admin@tiplink.dev');
  await page.goto(`/fr/dashboard/admin/orders/${order.id}`);
  await page.getByPlaceholder(/Bonjour, on a pris/).fill('Voici votre facture corrigée.');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Joindre des fichiers' }).click();
  await (await chooser).setFiles([
    { name: 'Invoice-0002.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 facture') },
    { name: 'Avoir-01.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 avoir') },
  ]);
  await expect(page.getByText('📎 Invoice-0002.pdf')).toBeVisible();
  await page.getByRole('button', { name: 'Retirer Avoir-01.pdf' }).click();

  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page.getByText(/Email envoyé à .* \(1 pièce jointe\)/)).toBeVisible();

  // The server action logs what it actually received.
  const logs = await admin<{ metadata: { attachments?: string[] } }[]>(
    `/rest/v1/admin_audit_log?action=eq.orders.custom_email&metadata->>orderId=eq.${order.id}&select=metadata`
  );
  expect(logs.map((l) => l.metadata.attachments)).toEqual([['Invoice-0002.pdf']]);
});

test('the VAT return page opens and offers the CSV journal', async ({ page }) => {
  const errors = trackPageErrors(page);
  await login(page, 'admin@tiplink.dev');
  await page.goto('/fr/dashboard/admin/tva');
  await expect(page.getByRole('heading', { name: 'TVA à déclarer' })).toBeVisible();
  // Without Stripe keys the report cannot read invoices and says so rather
  // than showing a partial total.
  await expect(
    page.getByText('TVA collectée ' + new Date().getUTCFullYear()).or(page.getByText('Impossible de calculer le rapport')),
  ).toBeVisible();
  const csv = page.getByRole('link', { name: /Télécharger le détail/ });
  await expect(csv).toHaveAttribute('href', /\/api\/admin\/vat-report\?year=\d{4}/);
  expect(errors, 'uncaught page errors').toEqual([]);
});

test('admin transactions show French statuses and a refund action', async ({ page }) => {
  await login(page, 'admin@tiplink.dev');
  await page.goto('/fr/dashboard/admin/transactions?status=succeeded');
  await expect(page.getByText(/succeeded/)).toHaveCount(0);
  await expect(page.locator('tbody').getByText('Reçu', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rembourser' }).first()).toBeVisible();
});
