'use server';

import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { actionError, classifyDbError } from '@/lib/errors/action-error';
import {
  createStandardAccount,
  createOnboardingLink,
  staffBankingReturnUrls,
} from '@/lib/stripe/connect';

// Staff & ambassadors are paid through Stripe **Standard** connected accounts:
// no per-account monthly fee, no per-payout fee, and Stripe pays them out
// automatically. Onboarding (identity, bank details, terms) is fully handled
// by Stripe's hosted flow — the staff member is redirected to an Account Link.

// Returns a Stripe-hosted onboarding URL for the signed-in staff member,
// creating the Standard connected account on first call. The account.updated
// webhook promotes onboarding_status 'pending' -> 'complete'.
export async function getStripeOnboardingLink(): Promise<
  { ok: true; url: string } | { error: string }
> {
  // Everything is wrapped so a transient auth/DB hiccup returns a clean
  // {error} the form can show inline — it must never throw to the route error
  // boundary (the generic "Réessayer" screen) while the user waits for the
  // slow Stripe call.
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return actionError('forbidden');

    const service = createServiceClient();
    let { data: profile } = await service
      .from('staff_profiles')
      .select('id, stripe_account_id, onboarding_status')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    // A group admin who opted into receiving tips may not have a staff profile
    // yet — bootstrap one against their first establishment.
    if (!profile) {
      profile = await bootstrapAdminStaffProfile(service, user.id, user.email, user.user_metadata);
      if (!profile) return actionError('notFound');
    }

    let accountId = profile.stripe_account_id;
    if (!accountId) {
      accountId = await createStandardAccount({
        email: user.email ?? undefined,
        businessType: 'individual',
        metadata: { staff_profile_id: profile.id },
      });
      const { error: dbErr } = await service
        .from('staff_profiles')
        .update({ stripe_account_id: accountId, onboarding_status: 'pending' })
        .eq('id', profile.id);
      if (dbErr) return actionError(classifyDbError(dbErr), dbErr, 'getStripeOnboardingLink.db');
    }
    const url = await createOnboardingLink(
      accountId,
      staffBankingReturnUrls(await getLocale()),
      profile.onboarding_status === 'complete' ? 'account_update' : 'account_onboarding',
    );
    // No revalidatePath here: we immediately redirect the browser to Stripe
    // (an external URL), so refreshing the page we're leaving is wasteful and
    // can flash the route error boundary mid-redirect.
    return { ok: true, url };
  } catch (err) {
    return actionError('unknown', err, 'getStripeOnboardingLink');
  }
}

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
async function bootstrapAdminStaffProfile(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  userEmail: string | undefined,
  userMetadata: Record<string, unknown> | undefined,
) {
  const { data: roleRow } = await service
    .from('user_roles')
    .select('group_id')
    .eq('user_id', userId)
    .in('role', ['group_admin', 'super_admin'])
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!roleRow?.group_id) return null;

  const { data: est } = await service
    .from('establishments')
    .select('id')
    .eq('group_id', roleRow.group_id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (!est) return null;

  const fullName =
    (userMetadata?.full_name as string | undefined)?.trim() ||
    userEmail?.split('@')[0] ||
    'Admin';

  const { data: created } = await service
    .from('staff_profiles')
    .insert({
      user_id: userId,
      establishment_id: est.id,
      full_name: fullName,
      is_active: true,
      onboarding_status: 'not_started',
    })
    .select('id, stripe_account_id, onboarding_status')
    .single();
  if (!created) return null;

  const { data: existingRole } = await service
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('establishment_id', est.id)
    .maybeSingle();
  if (!existingRole) {
    await service.from('user_roles').insert({
      user_id: userId,
      role: 'staff',
      establishment_id: est.id,
    });
  }

  return created;
}
