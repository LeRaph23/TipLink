import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type ServiceClient = SupabaseClient<Database>;

/**
 * Void / restore for Commerciaux Pros commissions.
 *
 * The mirror of lib/ambassadeur/sales.ts, which did not exist. `commercial_sales`
 * was written once, by attributeCommercialSale in the Stripe webhook, and never
 * touched again — nothing in the repository ever set `voided_at`, even though
 * migration 00056 added the column and the admin screen already renders a
 * voided state that could therefore never occur.
 *
 * The consequence was a standing money leak. A commercial sells a Pack Duo with
 * their promo code (65 €), the buyer charges back, and the platform loses the
 * hardware revenue while the commission stays live and withdrawable. Refunds,
 * disputes and admin cancellations all voided the ambassador's commission and
 * left the commercial's alone, so the whole stated purpose of migration 00047
 * ("close the commission/bonus money leak") had only ever applied to half the
 * sales force.
 *
 * Both functions are idempotent and best-effort, like their ambassador
 * counterparts: they must never throw, because they run inside the Stripe
 * webhook, where an exception means a 500 and an endless redelivery loop.
 *
 * No referral recomputation here, unlike the ambassador side: the commercial
 * programme has no referral tree to pull back below a threshold.
 */

export async function voidCommercialSaleForOrder(
  service: ServiceClient,
  orderId: string,
  reason: string,
): Promise<void> {
  try {
    const { data: sale } = await service
      .from('commercial_sales')
      .select('id, voided_at')
      .eq('smarttag_order_id', orderId)
      .maybeSingle();

    if (!sale || sale.voided_at) return;

    await service
      .from('commercial_sales')
      .update({ voided_at: new Date().toISOString(), void_reason: reason } as never)
      .eq('id', sale.id)
      // Re-checked in the WHERE clause so two concurrent deliveries of the same
      // webhook cannot both claim to have voided it.
      .is('voided_at', null);
  } catch (err) {
    console.error('voidCommercialSaleForOrder failed', { orderId, err });
  }
}

/**
 * Reverses {@link voidCommercialSaleForOrder} when a disputed pack purchase is
 * won and the funds are reinstated, so the commission is legitimately earned
 * again.
 *
 * Deliberately does NOT unfreeze the commercial's payouts: as on the ambassador
 * side, the freeze is lifted by a super-admin after review, not automatically
 * by a webhook.
 */
export async function restoreCommercialSaleForOrder(
  service: ServiceClient,
  orderId: string,
): Promise<void> {
  try {
    const { data: sale } = await service
      .from('commercial_sales')
      .select('id, voided_at')
      .eq('smarttag_order_id', orderId)
      .maybeSingle();

    if (!sale || !sale.voided_at) return;

    await service
      .from('commercial_sales')
      .update({ voided_at: null, void_reason: null } as never)
      .eq('id', sale.id);
  } catch (err) {
    console.error('restoreCommercialSaleForOrder failed', { orderId, err });
  }
}

/**
 * Freezes a commercial's withdrawals when a pack they sold is disputed, so a
 * payout cannot drain funds while the money is at risk. Mirrors what
 * handlePackDisputeOpened already did for ambassadors and skipped for them.
 */
export async function freezeCommercialForOrder(
  service: ServiceClient,
  orderId: string,
): Promise<void> {
  try {
    const { data: sale } = await service
      .from('commercial_sales')
      .select('commercial_id')
      .eq('smarttag_order_id', orderId)
      .maybeSingle();

    const commercialId = (sale as { commercial_id?: string } | null)?.commercial_id;
    if (!commercialId) return;

    await service
      .from('commerciaux')
      .update({ payouts_frozen: true } as never)
      .eq('id', commercialId);
  } catch (err) {
    console.error('freezeCommercialForOrder failed', { orderId, err });
  }
}
