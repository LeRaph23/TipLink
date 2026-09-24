'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import { refundTransactionFull } from '@/lib/stripe/refunds';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Refund a tip in full (tip and service fee) and take the money back from the
 * establishment: its transfer is reversed and the employees' attributions are
 * cancelled, so dashboards, statements and the VAT report all drop it.
 */
export async function refundTip(transactionId: string, reason: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Non connecté' };
  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
  if (!(roles ?? []).some((r) => r.role === 'super_admin')) return { ok: false, error: 'Accès refusé' };

  const cleanReason = reason.trim().slice(0, 500);
  if (cleanReason.length < 3) return { ok: false, error: 'Indiquez la raison du remboursement' };

  const service = createServiceClient();
  const { data: txn } = await service
    .from('transactions')
    .select('id, status, amount')
    .eq('id', transactionId)
    .maybeSingle();
  if (!txn) return { ok: false, error: 'Transaction introuvable' };
  if (txn.status !== 'succeeded') return { ok: false, error: 'Seul un paiement reçu peut être remboursé' };

  const res = await refundTransactionFull(transactionId, service, `admin: ${cleanReason}`);
  if (!res.ok) return { ok: false, error: res.error };

  // The charge.refunded webhook confirms this; setting it now keeps the admin
  // screen and the dashboards right even before it arrives.
  await service
    .from('transactions')
    .update({ status: 'refunded', refunded_amount: txn.amount })
    .eq('id', transactionId)
    .eq('status', 'succeeded');

  await logAdminAction('transactions.refund', { transactionId, amount: txn.amount, reason: cleanReason });
  revalidatePath('/[locale]/dashboard/admin/transactions', 'page');
  return { ok: true };
}
