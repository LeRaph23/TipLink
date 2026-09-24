import type { createServiceClient } from '@/lib/supabase/service';

// Promo codes for hardware packs, shared by the intent creation and by the
// in-place update of an existing intent (/api/billing/pack-promo).

export type PromoResolved = {
  code: string;
  promo_code_id: string;
  percentage_off: number;
  stripe_promo_code_id: string;
};

/** Returns the code when it exists, is active, unexpired and not used up. */
export async function resolvePromoCode(
  supabase: ReturnType<typeof createServiceClient>,
  rawCode: string
): Promise<PromoResolved | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const { data } = await supabase
    .from('promo_codes')
    .select('id, code, percentage_off, max_redemptions, times_redeemed, expires_at, is_active, stripe_promo_code_id')
    .eq('code', code)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  if (data.max_redemptions != null && data.times_redeemed >= data.max_redemptions) return null;
  return {
    code: data.code,
    promo_code_id: data.id,
    percentage_off: data.percentage_off,
    stripe_promo_code_id: data.stripe_promo_code_id,
  };
}


/** The discount a code gives on a pack price, in cents. */
export function promoDiscount(baseAmount: number, promo: PromoResolved | null): number {
  return promo ? Math.floor((baseAmount * promo.percentage_off) / 100) : 0;
}
