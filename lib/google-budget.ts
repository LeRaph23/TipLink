import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Daily ceilings on Google Places calls, counted in the database
 * (migration 00092) so they hold across every serverless instance.
 *
 * The defaults keep a month inside Google's free allowance for each SKU
 * (Places API New: Text Search Pro and Place Details Enterprise), with room
 * to spare: about 4,800 text searches and 900 detail lookups at most. Each can
 * be raised with an environment variable without a deploy of new code.
 *
 * Google Cloud quotas, set in the console, remain the first line of defence;
 * this is what still holds if they are missing or too generous.
 */
export type GoogleSku = 'onboarding_search' | 'salon_match' | 'place_contact';

const DEFAULTS: Record<GoogleSku, { env: string; perDay: number }> = {
  // A manager looking for their own listing at sign-up. Text Search Pro.
  onboarding_search: { env: 'GOOGLE_DAILY_LIMIT_ONBOARDING_SEARCH', perDay: 100 },
  // Matching prospect salons from the terrain admin, up to two searches each.
  // Text Search Pro, the same SKU as above: together they stay near 160 a day.
  salon_match: { env: 'GOOGLE_DAILY_LIMIT_SALON_MATCH', perDay: 60 },
  // Website and phone, once per Stripe onboarding. Place Details Enterprise.
  place_contact: { env: 'GOOGLE_DAILY_LIMIT_PLACE_CONTACT', perDay: 30 },
};

export function dailyLimit(sku: GoogleSku): number {
  const { env, perDay } = DEFAULTS[sku];
  const raw = process.env[env];
  if (raw === undefined || raw.trim() === '') return perDay;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : perDay;
}

/** Thrown when the day's budget for a kind of call is spent. */
export class GoogleBudgetExceeded extends Error {
  constructor(public readonly sku: GoogleSku) {
    super(`Quota Google du jour atteint (${sku}, ${dailyLimit(sku)} appels). Reprise demain, ou relever ${DEFAULTS[sku].env}.`);
    this.name = 'GoogleBudgetExceeded';
  }
}

/**
 * Takes one call from today's budget, or throws GoogleBudgetExceeded.
 *
 * Fails closed: if the count cannot be read, the call is refused. A Google
 * bill is the outcome this exists to prevent, so "cannot tell" means no.
 */
export async function spendGoogleCall(sku: GoogleSku): Promise<void> {
  const { data, error } = await createServiceClient().rpc(
    'consume_google_budget' as never,
    { p_sku: sku, p_daily_limit: dailyLimit(sku) } as never,
  );
  if (error) {
    console.error('[google-budget] count failed, refusing the call', sku, error.message);
    throw new GoogleBudgetExceeded(sku);
  }
  if (data !== true) throw new GoogleBudgetExceeded(sku);
}
