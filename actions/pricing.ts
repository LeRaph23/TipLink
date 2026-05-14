'use server';

import { getAllPackPricing, type PackPricing } from '@/lib/stripe/pricing';
import type { PackId } from '@/lib/env';

export async function fetchPackPricingAction(): Promise<Record<PackId, PackPricing>> {
  return getAllPackPricing();
}
