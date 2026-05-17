import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { recomputeReferralAfterSaleChange } from '@/lib/referrals';

type ServiceClient = SupabaseClient<Database>;

/**
 * Voids the ambassador commission tied to a SmartTag pack order so it can no
 * longer be counted toward commissions, weekly/monthly bonuses, or withdrawn.
 *
 * Called when the underlying order produced no kept revenue — a refund, a lost
 * chargeback, or an admin cancellation. Idempotent (a re-delivered webhook or a
 * double-cancel is a no-op) and best-effort: it never throws so it can't break
 * the Stripe webhook or an admin action.
 *
 * After voiding it recomputes the seller's referral state, since dropping a
 * sale can pull them back below the referral validation threshold.
 */
export async function voidAmbassadorSaleForOrder(
  service: ServiceClient,
  orderId: string,
  reason: string
): Promise<void> {
  try {
    const { data: sale } = await service
      .from('ambassador_sales')
      .select('id, ambassador_id, voided_at')
      .eq('smarttag_order_id', orderId)
      .maybeSingle();

    if (!sale || sale.voided_at) return;

    const { error } = await service
      .from('ambassador_sales')
      .update({ voided_at: new Date().toISOString(), void_reason: reason })
      .eq('id', sale.id)
      .is('voided_at', null);

    if (error) return;

    await recomputeReferralAfterSaleChange(service, sale.ambassador_id);
  } catch (err) {
    console.error('voidAmbassadorSaleForOrder failed', { orderId, err });
  }
}

/**
 * Reverses {@link voidAmbassadorSaleForOrder} — used when a disputed pack
 * purchase is won and the funds are reinstated, so the commission becomes
 * legitimately earned again. Idempotent and best-effort.
 */
export async function restoreAmbassadorSaleForOrder(
  service: ServiceClient,
  orderId: string
): Promise<void> {
  try {
    const { data: sale } = await service
      .from('ambassador_sales')
      .select('id, ambassador_id, voided_at')
      .eq('smarttag_order_id', orderId)
      .maybeSingle();

    if (!sale || !sale.voided_at) return;

    const { error } = await service
      .from('ambassador_sales')
      .update({ voided_at: null, void_reason: null })
      .eq('id', sale.id);

    if (error) return;

    await recomputeReferralAfterSaleChange(service, sale.ambassador_id);
  } catch (err) {
    console.error('restoreAmbassadorSaleForOrder failed', { orderId, err });
  }
}
