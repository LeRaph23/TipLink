'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { getEstablishmentPayability } from '@/lib/stripe/establishment-account';
import { parsePayoutSchedule, toStripeSchedule } from '@/lib/stripe/payout-schedule';

// Lifetime net tips received by the signed-in staff member (succeeded tips,
// minus the platform commission and any refunds). Shown on the banking page.
export async function getStaffEarnings(): Promise<
  { ok: true; lifetimeNet: number } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!profile) return { error: 'Aucun profil staff trouvé.' };

  const { data: txns } = await service
    .from('transactions')
    .select('amount, application_fee_amount, refunded_amount')
    .eq('staff_id', profile.id)
    .eq('status', 'succeeded');

  const lifetimeNet = (txns ?? []).reduce((sum, t) => {
    const row = t as { amount: number; application_fee_amount: number | null; refunded_amount: number | null };
    const fee = row.application_fee_amount ?? 0;
    const refunded = row.refunded_amount ?? 0;
    return sum + Math.max(0, row.amount - fee - refunded);
  }, 0);

  return { ok: true, lifetimeNet };
}

// Bootstraps a staff profile for a group admin who opted into receiving tips
// but has none from the normal join flow. Returns null when the user is not a
// group admin with an establishment. Not a server action (no `export`).

/**
 * Changes when Stripe pays the establishment's balance into its bank account.
 *
 * Group admins only, like the payments page itself: the schedule decides when
 * the business's money arrives. Stripe is the source of truth; nothing is
 * stored on our side, so the page always shows what Stripe will actually do.
 */
export async function updatePayoutSchedule(
  raw: unknown,
): Promise<{ ok: true } | { error: string }> {
  const schedule = parsePayoutSchedule(raw);
  if (!schedule) return { error: 'Fréquence de virement invalide.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('group_id')
    .in('role', ['group_admin', 'super_admin'])
    .eq('user_id', user.id)
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!roleRow?.group_id) return { error: 'Forbidden' };

  const est = await getEstablishmentPayability(createServiceClient(), roleRow.group_id);
  if (!est?.accountId || !est.detailsSubmitted) {
    return { error: 'Activez d’abord les paiements de votre établissement.' };
  }

  try {
    await stripe.accounts.update(est.accountId, {
      settings: { payouts: { schedule: toStripeSchedule(schedule) } },
    });
  } catch (err) {
    console.error('[payout-schedule] update failed', err);
    return { error: 'Stripe n’a pas pu enregistrer ce changement. Réessayez dans un instant.' };
  }

  revalidatePath('/dashboard/paiements');
  return { ok: true };
}
