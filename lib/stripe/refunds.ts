import type Stripe from 'stripe';
import { stripe } from './client';
import { createServiceClient } from '@/lib/supabase/service';

type Supabase = ReturnType<typeof createServiceClient>;

// Reverse a single transfer if not already reversed. Idempotent — safe to
// call multiple times. Returns true if a reversal was performed.
export async function reverseTransferIfNeeded(transferId: string): Promise<boolean> {
  try {
    const transfer = await stripe.transfers.retrieve(transferId, { expand: ['reversals'] });
    const alreadyReversed = (transfer.amount_reversed ?? 0) >= transfer.amount;
    if (alreadyReversed) return false;
    await stripe.transfers.createReversal(transferId, {
      amount: transfer.amount - (transfer.amount_reversed ?? 0),
      metadata: { reason: 'platform_initiated' },
    });
    return true;
  } catch (err) {
    console.error('reverseTransferIfNeeded failed', { transferId, err });
    throw err;
  }
}

// Reverse every transfer attached to a transaction:
//  - solo tips: the single transfer stored on transactions.stripe_transfer_id
//  - group tips: every row in group_tip_transfers
// Updates DB to record reversal timestamps. Idempotent.
export async function reverseTransactionTransfers(
  transactionId: string,
  supabase: Supabase,
): Promise<void> {
  const { data: txn } = await supabase
    .from('transactions')
    .select('id, stripe_transfer_id, reversed_at')
    .eq('id', transactionId)
    .maybeSingle();

  if (txn?.stripe_transfer_id && !txn.reversed_at) {
    await reverseTransferIfNeeded(txn.stripe_transfer_id);
    await supabase
      .from('transactions')
      .update({ reversed_at: new Date().toISOString() })
      .eq('id', transactionId);
  }

  const { data: groupTransfers } = await supabase
    .from('group_tip_transfers')
    .select('id, stripe_transfer_id, reversed_at')
    .eq('transaction_id', transactionId)
    .is('reversed_at', null);

  for (const gt of groupTransfers ?? []) {
    if (!gt.stripe_transfer_id) continue;
    try {
      await reverseTransferIfNeeded(gt.stripe_transfer_id);
      await supabase
        .from('group_tip_transfers')
        .update({ reversed_at: new Date().toISOString() })
        .eq('id', gt.id);
    } catch (err) {
      console.error('group transfer reversal failed', { id: gt.id, err });
    }
  }
}

// Issue a full refund for a transaction and reverse every associated transfer.
// Used by admin tools and by the Early Fraud Warning auto-refund handler.
export async function refundTransactionFull(
  transactionId: string,
  supabase: Supabase,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: txn } = await supabase
    .from('transactions')
    .select('id, stripe_payment_intent_id, status, amount, refunded_amount')
    .eq('id', transactionId)
    .maybeSingle();

  if (!txn) return { ok: false, error: 'Transaction introuvable' };
  if (!txn.stripe_payment_intent_id) return { ok: false, error: 'PaymentIntent absent' };
  if (txn.status === 'refunded' || txn.status === 'reversed') return { ok: true };

  try {
    await stripe.refunds.create({
      payment_intent: txn.stripe_payment_intent_id,
      refund_application_fee: true,
      reverse_transfer: true,
      metadata: reason ? { reason } : undefined,
    } as Stripe.RefundCreateParams);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Refund failed';
    return { ok: false, error: msg };
  }

  // For group tips, reverse_transfer:true on a destination-charge refund
  // doesn't cover separately-created transfers — handle them explicitly.
  await reverseTransactionTransfers(transactionId, supabase);

  return { ok: true };
}
