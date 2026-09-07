import 'server-only';
import { unstable_cache } from 'next/cache';
import { stripe } from '@/lib/stripe/client';
import { serverEnv } from '@/lib/env';

/**
 * What Digitip Pro costs, read from Stripe.
 *
 * The amount used to live in two translated strings ("19 € HT/mois") while the
 * charge came from `STRIPE_PRICE_PRO_MONTHLY`. Nothing tied the two together,
 * so raising the price in Stripe would have left the dashboard advertising the
 * old one and debiting the new one. This reads the same price object the
 * checkout session bills against, which makes that class of mismatch
 * impossible rather than merely unlikely.
 *
 * The yearly price had a worse problem: the button said "2 mois offerts" and
 * the amount appeared nowhere at all, in any language.
 */
export type ProPrice = {
  /** Cents, excluding VAT. Stripe adds it at checkout via automatic_tax. */
  unitAmount: number;
  currency: string;
};

export type ProPricing = {
  monthly: ProPrice | null;
  yearly: ProPrice | null;
  /**
   * Whole months saved by paying yearly, or null when that is not a round
   * number of months or either price is missing. Deliberately not rounded from
   * something like 1.6: "2 mois offerts" next to an amount that only saves one
   * and a half is the kind of claim a customer can check.
   */
  yearlyMonthsFree: number | null;
};

async function fetchPrice(priceId: string | undefined): Promise<ProPrice | null> {
  if (!priceId) return null;
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.unit_amount == null) {
      console.error(`[pro-pricing] price ${priceId} is inactive or has no unit_amount`);
      return null;
    }
    return { unitAmount: price.unit_amount, currency: price.currency };
  } catch (err) {
    // A missing price must not take the billing page down with it: the page
    // still has to render for someone who is already subscribed.
    console.error('[pro-pricing]', err instanceof Error ? err.message : err);
    return null;
  }
}

export function deriveMonthsFree(
  monthly: ProPrice | null,
  yearly: ProPrice | null,
): number | null {
  if (!monthly || !yearly) return null;
  if (monthly.currency !== yearly.currency) return null;
  if (monthly.unitAmount <= 0) return null;
  const paidMonths = yearly.unitAmount / monthly.unitAmount;
  const free = 12 - paidMonths;
  // Within a cent of a whole number of months, and actually a saving.
  const rounded = Math.round(free);
  return rounded >= 1 && Math.abs(free - rounded) < 0.01 ? rounded : null;
}

async function fetchProPricing(): Promise<ProPricing> {
  const env = serverEnv();
  const [monthly, yearly] = await Promise.all([
    fetchPrice(env.STRIPE_PRICE_PRO_MONTHLY),
    fetchPrice(env.STRIPE_PRICE_PRO_YEARLY),
  ]);
  return { monthly, yearly, yearlyMonthsFree: deriveMonthsFree(monthly, yearly) };
}

/**
 * Same sixty-second window as the hardware packs, and the same escape hatch:
 * `revalidateTag('stripe-pricing')` refreshes both at once.
 */
export async function getProPricing(): Promise<ProPricing> {
  const key = `${process.env.STRIPE_PRICE_PRO_MONTHLY ?? 'none'}:${process.env.STRIPE_PRICE_PRO_YEARLY ?? 'none'}`;
  return unstable_cache(fetchProPricing, ['stripe-pro-pricing', key], {
    revalidate: 60,
    tags: ['stripe-pricing'],
  })();
}
