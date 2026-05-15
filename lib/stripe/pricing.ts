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
  listAmount: number | null; // strikethrough — read from product.metadata.list_price_cents
  savingsPercent: number | null;
};

function computeSavings(unit: number, list: number | null): number | null {
  if (list == null || list <= 0 || list <= unit) return null;
  return Math.round(((list - unit) / list) * 100);
}

async function fetchPackPricing(pack: PackId): Promise<PackPricing> {
  const priceId = process.env[`STRIPE_PRICE_PACK_${pack.toUpperCase()}_HARDWARE`];

  // Fallback: lib/env.ts PACKS amounts (dev/local without Stripe IDs configured)
  if (!priceId) {
    const def = PACKS[pack];
    return {
      pack,
      unitAmount: def.hardwareAmount,
      currency: def.currency,
      productName: `Digitip — Pack ${pack === 'solo' ? 'Solo' : 'Duo'}`,
      quantity: def.quantity,
      listAmount: def.listAmount,
      savingsPercent: computeSavings(def.hardwareAmount, def.listAmount),
    };
  }

  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const product = price.product as Stripe.Product;

  const unitAmount = price.unit_amount ?? PACKS[pack].hardwareAmount;
  // Prefer the Stripe product's `list_price_cents` metadata; fall back to the
  // catalog list price so the strikethrough always renders.
  const listRaw = product.metadata?.list_price_cents;
  const list = listRaw ? parseInt(listRaw, 10) : NaN;
  const listAmount = Number.isFinite(list) ? list : PACKS[pack].listAmount;

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
// Invalidate by deploying or by calling revalidateTag('stripe-pricing').
const cached = unstable_cache(fetchPackPricing, ['stripe-pack-pricing'], {
  revalidate: 3600,
  tags: ['stripe-pricing'],
});

export async function getPackPricing(pack: PackId): Promise<PackPricing> {
  return cached(pack);
}

export async function getAllPackPricing(): Promise<Record<PackId, PackPricing>> {
  const [solo, duo] = await Promise.all([cached('solo'), cached('duo')]);
  return { solo, duo };
}
