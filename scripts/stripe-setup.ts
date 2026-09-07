#!/usr/bin/env npx tsx
/**
 * Creates the Stripe catalogue: one-time EUR prices for the SmartTag hardware
 * packs, and the recurring prices for the Digitip Pro subscription.
 *
 * Run once after setting STRIPE_SECRET_KEY in your environment:
 *
 *   STRIPE_SECRET_KEY=sk_live_... npx tsx scripts/stripe-setup.ts
 *
 * Copy the output lines into your .env.local file.
 */

import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('❌  STRIPE_SECRET_KEY is not set');
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(key, { apiVersion: '2025-04-30' as any });

const PACKS = [
  { id: 'plaque_solo', name: 'Plaque époxy NFC — Solo (1 plaque)', amount: 6900, env: 'STRIPE_PRODUCT_PACK_SOLO' },
  { id: 'plaque_duo',  name: 'Plaque époxy NFC — Duo (2 plaques)', amount: 9900, env: 'STRIPE_PRODUCT_PACK_DUO' },
] as const;

// Digitip Pro. Amounts are excluding VAT; checkout adds it via automatic_tax.
// The yearly amount is ten months of the monthly one, which is what makes the
// "2 mois offerts" claim on the dashboard true. Change one and the dashboard
// follows, because it reads these prices rather than a translated string.
const PRO = {
  name: 'Digitip Pro',
  monthlyAmount: 1900,
  yearlyAmount: 19000,
} as const;

async function main() {
  console.log('Creating Stripe products and prices…\n');

  const lines: string[] = [];

  for (const pack of PACKS) {
    const product = await stripe.products.create({
      name: pack.name,
      metadata: { tiplink_pack: pack.id },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pack.amount,
      currency: 'eur',
      metadata: { tiplink_pack: pack.id },
    });

    // Make it the product's default price so the app (which reads
    // default_price) picks it up, and future tariff changes propagate.
    await stripe.products.update(product.id, { default_price: price.id });

    const line = `${pack.env}=${product.id}`;
    console.log(`✅  ${line}`);
    lines.push(line);
  }

  const proProduct = await stripe.products.create({
    name: PRO.name,
    metadata: { tiplink_plan: 'pro' },
  });

  for (const [interval, amount, env] of [
    ['month', PRO.monthlyAmount, 'STRIPE_PRICE_PRO_MONTHLY'],
    ['year', PRO.yearlyAmount, 'STRIPE_PRICE_PRO_YEARLY'],
  ] as const) {
    const price = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: amount,
      currency: 'eur',
      recurring: { interval },
      metadata: { tiplink_plan: 'pro' },
    });
    // Unlike the packs, the app holds the *price* ID here rather than the
    // product's default_price: a subscription has two prices on one product,
    // so there is no single default that could stand for both.
    const line = `${env}=${price.id}`;
    console.log(`✅  ${line}`);
    lines.push(line);
  }

  console.log('\n─────────────────────────────────────────');
  console.log('Add these lines to your .env.local:\n');
  console.log(lines.join('\n'));
  console.log('─────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
