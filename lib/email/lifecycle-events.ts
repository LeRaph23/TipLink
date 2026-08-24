import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBaseUrl } from '@/lib/env';
import {
  LIFECYCLE,
  dispatchLifecycleEmail,
  resolveGroupAdmin,
  resolveStaffRecipient,
  firstNameFrom,
  lifecycleUnsubUrl,
} from '@/lib/email/lifecycle';
import {
  sendFirstTipCelebration,
  sendEarningsMilestone,
  sendStaffBankingComplete,
} from '@/lib/email';

// Event-triggered lifecycle emails dispatched inline from the Stripe webhook.
// Every entry point goes through the shared engine, so a redelivered webhook
// can never double-send.

type Db = SupabaseClient;

// Cumulative-earnings milestones, in cents (€100, €500).
const MILESTONES = [10_000, 50_000];

/** After a tip transaction flips to 'succeeded': first-tip + earnings milestone. */
export async function onTipSucceeded(service: Db, transactionId: string): Promise<void> {
  const { data: txn } = await service
    .from('transactions')
    .select('amount, currency, establishment_id, staff_id, establishments(name, group_id)')
    .eq('id', transactionId)
    .single();
  if (!txn) return;
  const est = txn.establishments as { name?: string; group_id?: string } | null;
  const groupId = est?.group_id ?? null;
  const establishmentId: string | null = txn.establishment_id ?? null;

  // First succeeded tip for the establishment → celebrate with the group admin.
  if (establishmentId && groupId) {
    const { count } = await service
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', establishmentId)
      .eq('status', 'succeeded');
    if ((count ?? 0) === 1) {
      const recipient = await resolveGroupAdmin(service, groupId);
      if (recipient) {
        await dispatchLifecycleEmail(service, {
          def: LIFECYCLE.first_tip_celebration,
          groupId,
          establishmentId,
          to: recipient.email,
          locale: recipient.locale,
          send: () =>
            sendFirstTipCelebration({
              to: recipient.email,
              firstName: firstNameFrom(recipient.name, 'Bonjour'),
              amount: txn.amount,
              currency: txn.currency,
              establishmentName: est?.name ?? 'votre établissement',
              dashboardUrl: `${getBaseUrl()}/dashboard`,
              unsubscribeUrl: lifecycleUnsubUrl('group_admin', groupId),
            }),
        });
      }
    }
  }

  // Cumulative earnings milestone for an individual staff member (solo tips).
  if (txn.staff_id) {
    const { data: rows } = await service
      .from('transactions')
      .select('amount')
      .eq('staff_id', txn.staff_id)
      .eq('status', 'succeeded');
    const newTotal = (rows ?? []).reduce((a, r) => a + (r.amount ?? 0), 0);
    const prevTotal = newTotal - txn.amount;
    for (const threshold of MILESTONES) {
      if (prevTotal < threshold && newTotal >= threshold) {
        const recipient = await resolveStaffRecipient(service, txn.staff_id);
        if (!recipient) break;
        await dispatchLifecycleEmail(service, {
          def: LIFECYCLE.earnings_milestone,
          staffId: txn.staff_id,
          establishmentId: txn.establishment_id,
          to: recipient.email,
          locale: recipient.locale,
          occurrenceSalt: String(threshold),
          send: () =>
            sendEarningsMilestone({
              to: recipient.email,
              firstName: firstNameFrom(recipient.fullName, 'Bravo'),
              milestoneAmount: threshold,
              currency: txn.currency,
              dashboardUrl: `${getBaseUrl()}/dashboard`,
              unsubscribeUrl: lifecycleUnsubUrl('staff', txn.staff_id),
            }),
        });
      }
    }
  }
}

/** Staff Stripe Connect onboarding just transitioned to 'complete'. */
export async function onStaffBankingComplete(service: Db, staffId: string): Promise<void> {
  const recipient = await resolveStaffRecipient(service, staffId);
  if (!recipient) return;
  await dispatchLifecycleEmail(service, {
    def: LIFECYCLE.staff_banking_complete,
    staffId,
    to: recipient.email,
    locale: recipient.locale,
    send: () =>
      sendStaffBankingComplete({
        to: recipient.email,
        firstName: firstNameFrom(recipient.fullName, 'Bonjour'),
      }),
  });
}

