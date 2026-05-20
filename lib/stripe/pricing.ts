// Single source of truth for hardware pack pricing.
// We retrieve the Price (and its Product) directly from Stripe so the
// dashboard remains the only place to change prices, names, or savings.
//
// `PACKS.hardwareAmount` in lib/env.ts only acts as a fallback for local
// development when the STRIPE_PRICE_PACK_*_HARDWARE env vars are not set.

import 'server-only';
import { unstable_cache } from 'next/cache';
import type Stripe from 'stripe';
import { stripe } from './client';
import { PACKS, type PackId } from '@/lib/env';

export type PackPricing = {
  pack: PackId;
  unitAmount: number;        // what we actually charge, in cents
  currency: string;
  productName: string;
  quantity: number;
  listAmount: number | null; // strikethrough — always unitAmount + 30€
  savingsPercent: number | null;
};

function computeSavings(unit: number, list: number | null): number | null {
  if (list == null || list <= 0 || list <= unit) return null;
  return Math.round(((list - unit) / list) * 100);
}

async function fetchPackPricing(pack: PackId): Promise<PackPricing> {
  const priceId = process.env[`STRIPE_PRICE_PACK_${pack.toUpperCase()}_HARDWARE`];

  // Fallback: lib/env.ts PACKS amounts (dev/local without Stripe IDs configured).
  // Logged loudly — a missing var in production means prices are NOT linked to
  // Stripe, so the failure must never be silent.
  if (!priceId) {
    console.error(
      `[pricing] STRIPE_PRICE_PACK_${pack.toUpperCase()}_HARDWARE not set — ` +
        'falling back to the hardcoded lib/env.ts amount; prices are not linked to Stripe.'
    );
    const def = PACKS[pack];
    const listAmount = def.hardwareAmount + 3000;
    return {
      pack,
      unitAmount: def.hardwareAmount,
      currency: def.currency,
      productName: `Digitip — Pack ${pack === 'solo' ? 'Solo' : 'Duo'}`,
      quantity: def.quantity,
      listAmount,
      savingsPercent: computeSavings(def.hardwareAmount, listAmount),
    };
  }

  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const product = price.product as Stripe.Product;

  const unitAmount = price.unit_amount ?? PACKS[pack].hardwareAmount;
  const listAmount = unitAmount + 3000;

  return {
    pack,
    unitAmount,
    currency: price.currency,
    productName: product.name || `Digitip — Pack ${pack === 'solo' ? 'Solo' : 'Duo'}`,
    quantity: PACKS[pack].quantity,
    listAmount,
    savingsPercent: computeSavings(unitAmount, listAmount),
  };
}

// 1-hour cache so landing page hits don't fan out to Stripe on every paint.
// The cache key includes the price ID so rotating STRIPE_PRICE_PACK_*_HARDWARE
// auto-invalidates instead of serving the previous price for up to an hour.
// Invalidate manually by calling revalidateTag('stripe-pricing').
function getCached(pack: PackId) {
  const priceId = process.env[`STRIPE_PRICE_PACK_${pack.toUpperCase()}_HARDWARE`] ?? 'fallback';
  return unstable_cache(fetchPackPricing, ['stripe-pack-pricing', pack, priceId], {
    revalidate: 3600,
    tags: ['stripe-pricing'],
  })(pack);
}

export async function getPackPricing(pack: PackId): Promise<PackPricing> {
  return getCached(pack);
}

export async function getAllPackPricing(): Promise<Record<PackId, PackPricing>> {
  const [solo, duo] = await Promise.all([getCached('solo'), getCached('duo')]);
  return { solo, duo };
}
