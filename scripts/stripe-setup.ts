#!/usr/bin/env npx tsx
/**
 * Creates Stripe products + one-time EUR prices for the 3 SmartTag hardware packs.
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

  console.log('\n─────────────────────────────────────────');
  console.log('Add these lines to your .env.local:\n');
  console.log(lines.join('\n'));
  console.log('─────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
