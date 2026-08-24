import 'server-only';
import { revalidateTag } from 'next/cache';
import { stripe } from './client';
import {
  createEstablishmentAccount,
  readAccountStatus,
  type EstablishmentAccountStatus,
} from './connect';
import type { createServiceClient } from '@/lib/supabase/service';
import { establishmentTipTag, staffTipTag } from '@/lib/cache/pay-tags';

type Service = ReturnType<typeof createServiceClient>;

/**
 * Returns the establishment's Connect account id, creating the account on
 * first call.
 *
 * Called from the account-session route, which the onboarding wizard hits as
 * soon as the manager reaches the Connect step — so this is the only place an
 * establishment account comes into existence.
 */
export async function ensureEstablishmentAccount(
  supabase: Service,
  establishmentId: string,
): Promise<{ accountId: string } | { error: 'not_found' | 'stripe_failed' }> {
  const { data: estab } = await supabase
    .from('establishments')
    .select('id, name, country, stripe_account_id, group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!estab) return { error: 'not_found' };
  if (estab.stripe_account_id) return { accountId: estab.stripe_account_id };

  // Prefill the manager's email so Stripe doesn't ask for what we already know.
  let email: string | undefined;
  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('group_id', estab.group_id)
    .eq('role', 'group_admin')
    .limit(1)
    .maybeSingle();
  if (adminRole?.user_id) {
    try {
      const { data } = await supabase.auth.admin.getUserById(adminRole.user_id);
      email = data.user?.email ?? undefined;
    } catch {
      /* prefill only — never block account creation on this */
    }
  }

  let accountId: string;
  try {
    accountId = await createEstablishmentAccount({
      establishmentId: estab.id,
      name: estab.name,
      country: estab.country ?? 'FR',
      email,
    });
  } catch (err) {
    console.error('[connect] establishment account creation failed', { establishmentId, err });
    return { error: 'stripe_failed' };
  }

  // Only claim the account if the row is still unclaimed. Two concurrent
  // requests both get the same account back from Stripe (the create call is
  // keyed on the establishment id), so the loser of this race simply re-reads
  // the winner's value rather than overwriting it.
  const { data: claimed } = await supabase
    .from('establishments')
    .update({ stripe_account_id: accountId })
    .eq('id', estab.id)
    .is('stripe_account_id', null)
    .select('stripe_account_id')
    .maybeSingle();

  if (claimed?.stripe_account_id) return { accountId: claimed.stripe_account_id };

  const { data: current } = await supabase
    .from('establishments')
    .select('stripe_account_id')
    .eq('id', estab.id)
    .maybeSingle();

  return current?.stripe_account_id
    ? { accountId: current.stripe_account_id }
    : { error: 'stripe_failed' };
}

/**
 * Writes a Stripe account snapshot onto the establishment row and invalidates
 * the public tip pages when payability changes.
 *
 * Called from the account.updated webhook and, as a self-healing fallback,
 * whenever the app needs a fresh answer (the wizard's final check, the
 * dashboard). Returns null when no establishment matches the account.
 */
export async function syncEstablishmentAccountStatus(
  supabase: Service,
  opts: { accountId: string; establishmentId?: string },
): Promise<EstablishmentAccountStatus | null> {
  const account = await stripe.accounts.retrieve(opts.accountId);
  const status = readAccountStatus(account);

  const { data: updated } = await supabase
    .from('establishments')
    .update({
      stripe_details_submitted: status.detailsSubmitted,
      stripe_charges_enabled: status.chargesEnabled,
      stripe_payouts_enabled: status.payoutsEnabled,
      stripe_requirements: status.requirements as never,
      stripe_synced_at: new Date().toISOString(),
    } as never)
    .eq('stripe_account_id', opts.accountId)
    .select('id')
    .maybeSingle();

  if (!updated) return null;

  await revalidateEstablishmentTipPages(supabase, updated.id);
  return status;
}

/**
 * Purges the cached public tip pages for an establishment and every one of its
 * staff members. Payability is now an establishment-level property, so a single
 * `account.updated` flips every tip page in the place at once.
 */
export async function revalidateEstablishmentTipPages(
  supabase: Service,
  establishmentId: string,
): Promise<void> {
  revalidateTag(establishmentTipTag(establishmentId), 'max');

  const { data: staff } = await supabase
    .from('staff_profiles')
    .select('id')
    .eq('establishment_id', establishmentId)
    .is('deleted_at', null);

  for (const s of staff ?? []) revalidateTag(staffTipTag(s.id), 'max');
}
