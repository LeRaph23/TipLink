// Single source of truth for hardware pack pricing.
// Mangopay has no product/price catalog, so the in-app PACKS catalog
// (lib/env.ts) is authoritative. These helpers keep the async signature the
// rest of the app already expects.

import 'server-only';
import { PACKS, type PackId } from '@/lib/env';

export type PackPricing = {
  pack: PackId;
  unitAmount: number; // what we actually charge, in cents (excl. VAT)
  currency: string;
  productName: string;
  quantity: number;
  listAmount: number | null; // struck-through "regular" price
  savingsPercent: number | null;
};

function computeSavings(unit: number, list: number | null): number | null {
  if (list == null || list <= 0 || list <= unit) return null;
  return Math.round(((list - unit) / list) * 100);
}

function buildPricing(pack: PackId): PackPricing {
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

export async function getPackPricing(pack: PackId): Promise<PackPricing> {
  return buildPricing(pack);
}

export async function getAllPackPricing(): Promise<Record<PackId, PackPricing>> {
  return { solo: buildPricing('solo'), duo: buildPricing('duo') };
}
