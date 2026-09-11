import 'server-only';
import { stripe } from '@/lib/stripe/client';

/**
 * Works out what actually happened to a payout transfer whose create() threw.
 *
 * Both payout routes assumed a throw meant no money moved, and marked the row
 * `failed` with no `stripe_transfer_id`. The balance calculation frees a failed
 * payout that carries no transfer id, so the amount went straight back into the
 * withdrawable balance.
 *
 * That assumption only holds for a definitive rejection. A socket timeout, a
 * 502 from Stripe's edge or a lambda killed mid-flight all look identical from
 * here, and in every one of them Stripe may well have created the transfer and
 * simply failed to tell us. The second attempt then wrote a NEW payout row,
 * which produced a NEW idempotency key (they were derived from the row id), so
 * Stripe had no reason to deduplicate and moved the money a second time.
 *
 * So instead of assuming, ask. The transfer carries `payout_id` in its
 * metadata, which is enough to find it.
 */

export type PayoutSettlement =
  /** Stripe has the transfer: the money did leave. Record it as paid. */
  | { outcome: 'paid'; transferId: string }
  /** Stripe definitively does not have it: safe to release the balance. */
  | { outcome: 'failed'; message: string }
  /**
   * Could not find out — the lookup failed too, most likely the same outage.
   * The caller must NOT release the balance on this: leave the row pending so
   * the amount stays committed and a human resolves it.
   */
  | { outcome: 'indeterminate'; message: string };

export async function settlePayoutTransferError(
  err: unknown,
  { destination, payoutId }: { destination: string; payoutId: string },
): Promise<PayoutSettlement> {
  const message = err instanceof Error ? err.message : 'Stripe error';

  try {
    // Scoped to the destination account and recent transfers, so this is a
    // small list even for a busy platform.
    const list = await stripe.transfers.list({ destination, limit: 100 });
    const match = list.data.find((t) => t.metadata?.payout_id === payoutId);
    if (match) return { outcome: 'paid', transferId: match.id };
    return { outcome: 'failed', message };
  } catch (lookupErr) {
    console.error('[payout] could not confirm transfer state', { payoutId, lookupErr });
    return {
      outcome: 'indeterminate',
      message: `${message} (état du virement non confirmé)`,
    };
  }
}
