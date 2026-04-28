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

const stripe = new Stripe(key, { apiVersion: '2025-04-30' as Stripe.LatestApiVersion });

const PACKS = [
  { id: 'pack_s', name: 'SmartTag Pack S — 15 tags', amount: 19900, env: 'STRIPE_PRICE_PACK_S_HARDWARE' },
  { id: 'pack_m', name: 'SmartTag Pack M — 30 tags', amount: 34900, env: 'STRIPE_PRICE_PACK_M_HARDWARE' },
  { id: 'pack_l', name: 'SmartTag Pack L — 60 tags', amount: 49900, env: 'STRIPE_PRICE_PACK_L_HARDWARE' },
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

    const line = `${pack.env}=${price.id}`;
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
