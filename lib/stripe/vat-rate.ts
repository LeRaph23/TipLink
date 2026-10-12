import 'server-only';
import { unstable_cache } from 'next/cache';
import { computePackTax } from './tax';

// The VAT rate a pack buyer in `country` is charged before any VAT number or
// postcode is known, as Stripe Tax answers it (with the French floor
// computePackTax applies under the EU distance-selling threshold). Shown on
// /checkout from the moment the page opens; the real figure for the full
// address still comes from /api/billing/pack-tax before the buyer can pay.
//
// Cached a week per country: a rate only changes with the law or with
// Digitip's tax registrations, and every Stripe Tax calculation is billed, so
// this keeps it to a handful of calls a week instead of one per visitor.
// Force a refresh with revalidateTag('stripe-vat-rate').
const REFERENCE_HT = 10_000;

async function lookup(country: string): Promise<number | null> {
  const tax = await computePackTax({ htAmount: REFERENCE_HT, currency: 'eur', country });
  return tax.taxRatePercent;
}

export function countryVatRatePercent(country: string): Promise<number | null> {
  const cc = country.toUpperCase();
  return unstable_cache(lookup, ['stripe-vat-rate', cc], {
    revalidate: 7 * 24 * 3600,
    tags: ['stripe-vat-rate'],
  })(cc);
}
