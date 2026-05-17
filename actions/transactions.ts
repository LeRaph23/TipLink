'use server';

import type Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { getManageScope } from '@/lib/auth/ownership';

type Result = { ok: true; receiptUrl: string } | { ok: false; error: string };

// Resolves the Stripe-hosted receipt URL for a tip transaction.
//
// Authorized for: the staff member who received the tip, a group_admin /
// super_admin over the transaction's establishment. Tips are donations, so
// the document is a payment receipt (reçu) rather than a commercial invoice.
export async function getTransactionReceipt(transactionId: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: txn } = await service
    .from('transactions')
    .select('id, staff_id, status, stripe_charge_id, stripe_payment_intent_id, establishments(group_id)')
    .eq('id', transactionId)
    .single();
  if (!txn) return { ok: false, error: 'Transaction introuvable' };

  // Authorization — owning staff, or group_admin / super_admin of the group.
  let authorized = false;
  if (txn.staff_id) {
    const { data: staff } = await service
      .from('staff_profiles')
      .select('id')
      .eq('id', txn.staff_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (staff) authorized = true;
  }
  if (!authorized) {
    const scope = await getManageScope();
    const groupId = (txn.establishments as unknown as { group_id: string } | null)?.group_id ?? null;
    if (scope && (scope.isSuperAdmin || (groupId !== null && scope.groupIds.includes(groupId)))) {
      authorized = true;
    }
  }
  if (!authorized) return { ok: false, error: 'Forbidden' };

  if (txn.status !== 'succeeded') return { ok: false, error: 'Aucun reçu disponible' };

  try {
    let chargeId = txn.stripe_charge_id;
    if (!chargeId && txn.stripe_payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(txn.stripe_payment_intent_id, {
        expand: ['latest_charge'],
      });
      const ch = pi.latest_charge as Stripe.Charge | null;
      if (ch?.receipt_url) return { ok: true, receiptUrl: ch.receipt_url };
      chargeId = ch?.id ?? null;
    }
    if (!chargeId) return { ok: false, error: 'Aucun reçu disponible' };

    const charge = await stripe.charges.retrieve(chargeId);
    if (!charge.receipt_url) return { ok: false, error: 'Reçu en cours de génération' };
    return { ok: true, receiptUrl: charge.receipt_url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur Stripe' };
  }
}
