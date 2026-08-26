import 'server-only';
import type Stripe from 'stripe';
import { stripe, CONNECT_BUSINESS_PROFILE, CONNECT_STATEMENT_DESCRIPTOR } from './client';

// Connected-account helpers.
//
// Two populations, two very different setups:
//
//  - Ambassadors and commerciaux keep **Standard** accounts with Stripe-hosted
//    onboarding (createStandardAccount / createOnboardingLink below). They are
//    paid commissions, they pick their own legal status, and there is no reason
//    to own their KYC.
//  - Establishments use white-label controller-based accounts with embedded
//    onboarding (createEstablishmentAccount). See the block comment there.

export type AccountLinkUrls = { refresh_url: string; return_url: string };

// Creates a Standard connected account and returns its id. The account holder
// fills in everything else through the hosted onboarding.
//
// `businessType: 'individual'` pre-sets the account as a private individual, so
// Stripe's hosted onboarding skips the "business type" question and the whole
// company section — used for salon staff, who receive tips as individuals and
// are not businesses. Ambassadors/commercials omit it (they pick their own
// status, e.g. micro-entreprise, since they're paid commissions).
export async function createStandardAccount(opts: {
  email?: string;
  metadata?: Record<string, string>;
  businessType?: 'individual' | 'company' | 'non_profit';
  fullName?: string;
}): Promise<string> {
  // Prefill the individual's name/email so Stripe's hosted onboarding doesn't
  // re-ask for what we already know (it skips fields we prefilled).
  let individual: { first_name?: string; last_name?: string; email?: string } | undefined;
  if (opts.businessType === 'individual') {
    const parts = (opts.fullName ?? '').trim().split(/\s+/).filter(Boolean);
    const draft: { first_name?: string; last_name?: string; email?: string } = {};
    if (parts.length) draft.first_name = parts[0];
    if (parts.length > 1) draft.last_name = parts.slice(1).join(' ');
    if (opts.email) draft.email = opts.email;
    if (Object.keys(draft).length > 0) individual = draft;
  }

  const base: Stripe.AccountCreateParams = {
    type: 'standard',
    country: 'FR',
    ...(opts.email ? { email: opts.email } : {}),
    ...(opts.businessType ? { business_type: opts.businessType } : {}),
    business_profile: { ...CONNECT_BUSINESS_PROFILE },
    ...(individual ? { individual } : {}),
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  };

  // Also prefill the statement descriptor. Some Standard configurations reject
  // a platform-set descriptor — fall back to creating without it rather than
  // ever blocking onboarding.
  try {
    const account = await stripe.accounts.create({
      ...base,
      settings: { payments: { statement_descriptor: CONNECT_STATEMENT_DESCRIPTOR } },
    });
    return account.id;
  } catch (err) {
    console.warn('createStandardAccount: retrying without statement_descriptor', err);
    const account = await stripe.accounts.create(base);
    return account.id;
  }
}

// ── Establishment accounts ───────────────────────────────────────────────────
//
// One connected account per establishment, holding every tip collected there.
// Deliberately NOT a Standard account: Standard accounts can only be onboarded
// through Stripe's hosted flow, and the whole point here is to keep the manager
// inside Digitip's own UI (see components/stripe/ConnectProvider.tsx).
//
// Controller properties, and why each one:
//   stripe_dashboard.type: 'none'       — fully white-label; the establishment
//                                         never sees a Stripe surface.
//   requirement_collection: 'stripe'    — Stripe owns KYC and chases missing
//                                         documents itself. Forced by the two
//                                         choices above; we set it explicitly
//                                         so the intent is readable.
//   losses.payments: 'stripe'           — Stripe carries negative balances on
//                                         connected accounts.
//   fees.payer: 'application'           — the platform pays Stripe's processing
//                                         fees, which is what lets the tipper's
//                                         service fee cover them.
//
// Two consequences of this configuration worth remembering:
//
//  1. `stripe_dashboard.type` is IMMUTABLE. Changing it later means creating a
//     new Account object and re-onboarding the establishment from scratch.
//  2. Because Stripe carries the losses, the platform cannot pause payouts on a
//     connected account. That is fine for our funds flow: tips are captured on
//     the platform and moved with an explicit transfer, so withholding a
//     transfer is the lever we actually use.
//
// Note also that tips are separate charges (an *indirect* charge in Stripe's
// vocabulary): the charge lives on the platform balance, so refunds and
// chargebacks on tips hit Digitip regardless of `losses.payments`.
// Stripe asks the account holder to confirm their line of business, and
// defaults to guessing from the MCC. We already asked — it is the wizard's
// second question — so answering with the generic "miscellaneous personal
// services" code puts the question back in front of them for no reason.
//
//   5812 — Eating Places, Restaurants
//   7230 — Beauty and Barber Shops
//
// The platform default stays for anything unrecognised: a wrong MCC is worse
// than a vague one, since it feeds the risk review.
const MCC_BY_BUSINESS_TYPE: Record<string, string> = {
  restaurant: '5812',
  beauty: '7230',
};

export async function createEstablishmentAccount(opts: {
  establishmentId: string;
  name: string;
  email?: string;
  country?: string;
  /** The wizard's restaurant/beauty answer, used to pick a precise MCC. */
  businessType?: string | null;
}): Promise<string> {
  const mcc = opts.businessType
    ? MCC_BY_BUSINESS_TYPE[opts.businessType] ?? CONNECT_BUSINESS_PROFILE.mcc
    : CONNECT_BUSINESS_PROFILE.mcc;

  const account = await stripe.accounts.create(
    {
      country: (opts.country ?? 'FR').toUpperCase(),
      ...(opts.email ? { email: opts.email } : {}),
      controller: {
        stripe_dashboard: { type: 'none' },
        requirement_collection: 'stripe',
        losses: { payments: 'stripe' },
        fees: { payer: 'application' },
      },
      // Request only what a tip recipient needs. Every extra capability drags
      // in extra verification requirements.
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        ...CONNECT_BUSINESS_PROFILE,
        mcc,
        name: opts.name,
      },
      // Weekly rather than Stripe's default daily rolling payouts: Connect
      // bills a fixed fee per payout, so 4 a month instead of ~30 keeps the
      // per-establishment cost down without the money sitting around.
      settings: {
        payouts: { schedule: { interval: 'weekly', weekly_anchor: 'monday' } },
      },
      metadata: { establishment_id: opts.establishmentId },
    },
    // Idempotent per establishment: a double-submit in the wizard, or a retry
    // after a timeout, must never leave two accounts behind — the unique index
    // on establishments.stripe_account_id would then reject the second write
    // and strand a real Stripe account with no row pointing at it.
    { idempotencyKey: `establishment-account:${opts.establishmentId}` },
  );
  return account.id;
}

// Snapshot of everything the app needs to know about a connected account's
// readiness, mirrored into `establishments` here and by the account.updated
// webhook. `details_submitted` gates finishing onboarding; the two enabled
// flags gate the public tip pages.
export type EstablishmentAccountStatus = {
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: {
    currently_due: string[];
    past_due: string[];
    pending_verification: string[];
    disabled_reason: string | null;
  };
};

export function readAccountStatus(account: Stripe.Account): EstablishmentAccountStatus {
  const req = account.requirements;
  return {
    detailsSubmitted: account.details_submitted === true,
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    requirements: {
      currently_due: req?.currently_due ?? [],
      past_due: req?.past_due ?? [],
      pending_verification: req?.pending_verification ?? [],
      disabled_reason: req?.disabled_reason ?? null,
    },
  };
}

// Creates a hosted onboarding (or update) link for a connected account.
export async function createOnboardingLink(
  accountId: string,
  urls: AccountLinkUrls,
  type: 'account_onboarding' | 'account_update' = 'account_onboarding',
): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: urls.refresh_url,
    return_url: urls.return_url,
    type,
    // Collect only what is strictly due right now (identity + bank details)
    // rather than every eventually-due field, to keep onboarding as light as
    // possible for staff. Stripe asks for anything else only if it ever becomes
    // actually required to keep paying out.
    collection_options: { fields: 'currently_due' },
  });
  return link.url;
}
