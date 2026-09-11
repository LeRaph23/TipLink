/**
 * Whether an establishment can actually receive a tip.
 *
 * This rule already existed, but only inside the `get_public_staff` /
 * `get_public_group_staff` SQL functions (migration 00074), where it is
 * evaluated when the tip PAGE renders. The two intent routes never checked it:
 * they confirmed the establishment existed and, for a group tip, that it had at
 * least one active staff member. A POST straight to /api/stripe/create-intent
 * for a salon that never finished Connect therefore charged the customer's
 * card, and the transfer then failed with `no_connect_account`.
 *
 * The webhook even documents the opposite ("the tip pages refuse to charge for
 * an unverified establishment"), which is true of the page and was not true of
 * the API behind it.
 *
 * Kept pure and dependency-free so the rule can be unit-tested and so both
 * runtimes can import it.
 */

export type EstablishmentPayability = {
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  /** Demo salons take fake payments, so they stay payable by design. */
  is_demo?: boolean | null;
};

/** Mirrors `is_payable` in migration 00074's SQL, deliberately verbatim. */
export function canAcceptTips(est: EstablishmentPayability): boolean {
  if (est.is_demo === true) return true;
  return (
    !!est.stripe_account_id &&
    est.stripe_charges_enabled === true &&
    est.stripe_payouts_enabled === true
  );
}
