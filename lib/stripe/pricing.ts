// Single source of truth for hardware pack pricing.
// The env vars hold a Stripe *product* ID; we read the product's
// `default_price` so that changing the tariff in the Stripe dashboard (which
// creates a new Price and sets it as default) propagates automatically — no
// env change or redeploy needed.
//
// `PACKS.hardwareAmount` in lib/env.ts only acts as a fallback for local
// development when the STRIPE_PRODUCT_PACK_* env vars are not set.

import 'server-only';
import { unstable_cache } from 'next/cache';
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

// Fallback to the hardcoded lib/env.ts amount. Used (and logged loudly) when the
// product ID is missing or its default_price can't be read — a missing/broken
// link in production means prices are NOT driven by Stripe.
function fallbackPricing(pack: PackId): PackPricing {
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

async function fetchPackPricing(pack: PackId): Promise<PackPricing> {
  const productId = process.env[`STRIPE_PRODUCT_PACK_${pack.toUpperCase()}`];

  if (!productId) {
    console.error(
      `[pricing] STRIPE_PRODUCT_PACK_${pack.toUpperCase()} not set — ` +
        'falling back to the hardcoded lib/env.ts amount; prices are not linked to Stripe.'
    );
    return fallbackPricing(pack);
  }

  const product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
  const price = product.default_price;

  // `default_price` is null (none set) or a string (not expanded) — either way
  // we can't read an amount, so fail loud and fall back rather than crash.
  if (!price || typeof price === 'string' || price.unit_amount == null) {
    console.error(
      `[pricing] product ${productId} has no usable default_price — ` +
        'falling back to the hardcoded lib/env.ts amount.'
    );
    return fallbackPricing(pack);
  }

  const unitAmount = price.unit_amount;
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

// Short cache so landing page hits don't fan out to Stripe on every paint while
// still reflecting a tariff change within ~a minute. Because the product ID is
// stable across price changes, the cache no longer auto-invalidates on a new
// price — the TTL handles it. Force an instant refresh with
// revalidateTag('stripe-pricing').
function getCached(pack: PackId) {
  const productId = process.env[`STRIPE_PRODUCT_PACK_${pack.toUpperCase()}`] ?? 'fallback';
  return unstable_cache(fetchPackPricing, ['stripe-pack-pricing', pack, productId], {
    revalidate: 60,
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
