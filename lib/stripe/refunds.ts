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
        metadata: reason ? { reason } : undefined,
      } satisfies Stripe.RefundCreateParams,
      // One full refund per transaction — guards against a concurrent EFW
      // auto-refund and a manual admin refund both passing the status check
      // above and issuing two refunds. `v2`: Stripe stores the response of a
      // failed request under its key too, and every earlier attempt failed
      // (see below), so the old key would replay that failure forever.
      { idempotencyKey: `refund:v2:${transactionId}` },
    );
  } catch (err) {
    console.error('[refund] stripe refund failed', { transactionId, err });
    return { ok: false, error: refundErrorMessage(err) };
  }

  // Tips are separate charges: the charge is the platform's and the money
  // reaches the establishment through a transfer of its own. The refund
  // therefore takes no `reverse_transfer` / `refund_application_fee` — Stripe
  // rejects both on a charge that is not a destination charge, which is why
  // every refund from the admin failed (sixth QA run) — and the transfer is
  // reversed explicitly here, with the employees' attributions.
  try {
    await reverseTransactionTransfers(transactionId, supabase);
  } catch (err) {
    // The customer has their money back; only recovering it from the
    // establishment failed (typically an empty Connect balance). Say so
    // rather than report the whole refund as failed.
    console.error('[refund] transfer reversal failed', { transactionId, err });
    return {
      ok: false,
      error: 'Client remboursé, mais le virement à l’établissement n’a pas pu être annulé (solde insuffisant ?). À régulariser dans Stripe.',
    };
  }

  return { ok: true };
}

/** A French message for the admin instead of Stripe's English one. */
export function refundErrorMessage(err: unknown): string {
  const e = err as { code?: string; type?: string; message?: string } | null;
  switch (e?.code) {
    case 'charge_already_refunded':
      return 'Ce paiement a déjà été remboursé.';
    case 'charge_disputed':
      return 'Ce paiement fait l’objet d’un litige : remboursement impossible, répondez au litige dans Stripe.';
    case 'insufficient_funds':
    case 'balance_insufficient':
      return 'Solde Digitip insuffisant pour rembourser maintenant. Réessayez après le prochain encaissement.';
    default:
      return 'Le remboursement a échoué. Réessayez, ou remboursez depuis le tableau de bord Stripe.';
  }
}
