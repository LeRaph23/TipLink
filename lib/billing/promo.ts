import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';

export type ResolvedPromo = {
  code: string;
  promoCodeId: string;
  percentageOff: number;
};

// Resolves a checkout promo code to its percentage discount, or null when the
// code is unknown, inactive, expired, or fully redeemed. Shared by the pack
// quote (pack-tax) and the two pack PayIn routes so the discount stays
// consistent across the price shown and the price charged.
export async function resolvePromoCode(
  supabase: ReturnType<typeof createServiceClient>,
  rawCode: string | null | undefined
): Promise<ResolvedPromo | null> {
  const code = (rawCode ?? '').trim().toUpperCase();
  if (!code) return null;

  const { data } = await supabase
    .from('promo_codes')
    .select('id, code, percentage_off, max_redemptions, times_redeemed, expires_at, is_active')
    .eq('code', code)
    .maybeSingle();

  if (!data || !data.is_active) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  if (data.max_redemptions != null && data.times_redeemed >= data.max_redemptions) return null;

  return { code: data.code, promoCodeId: data.id, percentageOff: data.percentage_off };
}

// Discount in cents applied to a pre-discount base amount.
export function discountFor(baseAmount: number, percentageOff: number): number {
  return Math.max(0, Math.floor((baseAmount * percentageOff) / 100));
}
