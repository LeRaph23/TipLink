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
import { parseFrenchAddress } from '@/lib/address';
import { getPlaceContactDetails, resolveGooglePlaceId } from '@/lib/google-places';

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
  /**
   * Company or sole trader, asked in our own UI just before the embedded form
   * mounts. Only read on the call that actually creates the account — after
   * that the account holder owns the answer and edits it through Stripe.
   */
  legalForm?: 'company' | 'individual' | null,
): Promise<{ accountId: string } | { error: 'not_found' | 'stripe_failed' }> {
  const { data: estab } = await supabase
    .from('establishments')
    .select(
      'id, name, address, country, business_type, google_place_id, google_review_url, stripe_account_id, group_id',
    )
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!estab) return { error: 'not_found' };
  if (estab.stripe_account_id) return { accountId: estab.stripe_account_id };

  // Prefill the manager's name and email so Stripe doesn't ask for what we
  // already know. For a sole trader these are the account holder's own details;
  // for a company they are only the contact.
  let email: string | undefined;
  let fullName: string | undefined;
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
      const name = data.user?.user_metadata?.full_name;
      fullName = typeof name === 'string' && name.trim() ? name.trim() : undefined;
    } catch {
      /* prefill only — never block account creation on this */
    }
  }

  // The establishment's own website and phone, straight from the Google listing
  // the manager already picked during onboarding. Stripe's business website
  // field wants the connected account's own presence, and this is the only
  // place we know it — asking again would be asking twice.
  const placeId = resolveGooglePlaceId(estab.google_place_id, estab.google_review_url);
  const contact = placeId ? await getPlaceContactDetails(placeId) : null;

  let accountId: string;
  try {
    accountId = await createEstablishmentAccount({
      establishmentId: estab.id,
      name: estab.name,
      country: estab.country ?? 'FR',
      businessType: estab.business_type,
      legalForm,
      address: parseFrenchAddress(estab.address),
      websiteUrl: contact?.websiteUri ?? null,
      phone: contact?.phoneNumber ?? null,
      email,
      fullName,
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

/**
 * Where the establishment stands on being able to receive tips, in the four
 * states the manager needs told apart.
 *
 * There was no shared reader for this: the payments page ran its own inline
 * query and collapsed everything into one boolean, which cannot say whether
 * the manager has something to do or merely something to wait for. That
 * distinction is the whole point of the dashboard banner.
 */
export type PayabilityState =
  /** No Stripe account at all: the manager has not started. */
  | 'not_started'
  /** An account exists but its form was never submitted. Their move. */
  | 'incomplete'
  /** Submitted, and Stripe has not finished checking. Nothing to do but wait. */
  | 'verifying'
  /** Charges and payouts are both live. */
  | 'ready';

/**
 * The state machine on its own, so it can be pinned by a test without standing
 * up a fake PostgREST client.
 *
 * Order matters. `details_submitted` stays true once the form is sent, so it
 * cannot be the first question: an account that submitted everything and then
 * had payouts turned back off would read as 'verifying' for ever. Live charges
 * and payouts are checked first, and they are checked together because either
 * one missing closes the tip page.
 */
export function derivePayabilityState(account: {
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}): PayabilityState {
  if (!account.accountId) return 'not_started';
  if (account.chargesEnabled && account.payoutsEnabled) return 'ready';
  return account.detailsSubmitted ? 'verifying' : 'incomplete';
}

export type EstablishmentPayability = {
  establishmentId: string;
  establishmentName: string;
  state: PayabilityState;
  /** A Connect account exists, so the legal form has already been answered. */
  hasAccount: boolean;
  /** Stripe has the KYC form. Decides which embedded component to mount. */
  detailsSubmitted: boolean;
  /** Verbatim from Stripe: `company.verification.document` and friends. */
  currentlyDue: string[];
  /**
   * Tips already collected whose transfer to the establishment has not gone
   * through, in cents.
   *
   * Read from `transactions`, not `tip_allocations`: allocations record who
   * earned a tip, which stays true whether or not the money moved. A row that
   * succeeded but still has no `stripe_transfer_id` is money sitting on the
   * platform balance, which is exactly what an unverified account causes.
   */
  heldCents: number;
};

export async function getEstablishmentPayability(
  supabase: Service,
  groupId: string,
): Promise<EstablishmentPayability | null> {
  const { data: est } = await supabase
    .from('establishments')
    .select(
      'id, name, stripe_account_id, stripe_details_submitted, stripe_charges_enabled, stripe_payouts_enabled, stripe_requirements',
    )
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!est) return null;

  const state = derivePayabilityState({
    accountId: est.stripe_account_id,
    detailsSubmitted: est.stripe_details_submitted,
    chargesEnabled: est.stripe_charges_enabled,
    payoutsEnabled: est.stripe_payouts_enabled,
  });

  const requirements = (est.stripe_requirements ?? null) as { currently_due?: unknown } | null;
  const currentlyDue = Array.isArray(requirements?.currently_due)
    ? (requirements.currently_due as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  // Only worth a second query when something is actually stuck. A ready
  // establishment is the common case and pays nothing for this.
  let heldCents = 0;
  if (state !== 'ready') {
    const { data: stuck } = await supabase
      .from('transactions')
      .select('metadata')
      .eq('establishment_id', est.id)
      .eq('status', 'succeeded')
      .in('transfer_status', ['pending', 'failed'])
      .is('stripe_transfer_id', null)
      .limit(500);

    for (const row of stuck ?? []) {
      const amount = Number((row.metadata as { tip_amount?: unknown } | null)?.tip_amount);
      if (Number.isFinite(amount) && amount > 0) heldCents += amount;
    }
  }

  return {
    establishmentId: est.id,
    establishmentName: est.name ?? '',
    state,
    hasAccount: !!est.stripe_account_id,
    detailsSubmitted: est.stripe_details_submitted,
    currentlyDue,
    heldCents,
  };
}
