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

// Reverse the transfer attached to a transaction and cancel its attribution.
//
// There is exactly one transfer per tip now — to the establishment — so this
// no longer walks a per-employee ledger. The `tip_allocations` rows still have
// to be flipped to `reversed`, otherwise the payroll export would keep
// crediting employees for money that went back to the customer.
//
// Idempotent: safe to call on a re-delivered webhook.
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

  await supabase
    .from('tip_allocations')
    .update({ status: 'reversed', reversed_at: new Date().toISOString() } as never)
    .eq('transaction_id', transactionId)
    .is('reversed_at', null);
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
    await stripe.refunds.create(
      {
        payment_intent: txn.stripe_payment_intent_id,
        refund_application_fee: true,
        reverse_transfer: true,
        metadata: reason ? { reason } : undefined,
      } as Stripe.RefundCreateParams,
      // One full refund per transaction — guards against a concurrent EFW
      // auto-refund and a manual admin refund both passing the status check
      // above and issuing two refunds.
      { idempotencyKey: `refund:${transactionId}` },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Refund failed';
    return { ok: false, error: msg };
  }

  // `reverse_transfer: true` only covers destination charges; tips are
  // separate charges, so the transfer to the establishment is reversed
  // explicitly here — as are the employees' attributions.
  await reverseTransactionTransfers(transactionId, supabase);

  return { ok: true };
}
