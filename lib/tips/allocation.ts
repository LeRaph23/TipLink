/**
 * How a tip is split across the people who earned it.
 *
 * This used to be inlined in the Stripe webhook, where it also decided how much
 * money to move. It no longer moves anything: the establishment receives the
 * whole tip in one transfer, and these shares are the accounting record behind
 * the payroll export. Pure and dependency-free so it can be unit-tested — an
 * off-by-one here is an employee being underpaid.
 */

export type Allocation = { staffId: string; amount: number };

/**
 * Splits `totalCents` equally across `staffIds`.
 *
 * Integer cents don't divide evenly, so the remainder goes to the first
 * recipient rather than being dropped. Callers pass a deterministically ordered
 * list (by id) so a replayed webhook produces byte-identical rows instead of
 * shuffling centimes between colleagues.
 *
 * Returns an empty array for an empty team or a non-positive total — the
 * caller decides whether that is an error worth surfacing.
 */
export function splitEqually(totalCents: number, staffIds: string[]): Allocation[] {
  if (staffIds.length === 0) return [];
  if (!Number.isFinite(totalCents) || totalCents <= 0) return [];

  const total = Math.round(totalCents);
  const n = staffIds.length;
  const baseShare = Math.floor(total / n);
  const remainder = total - baseShare * n;

  return staffIds.map((staffId, i) => ({
    staffId,
    amount: baseShare + (i === 0 ? remainder : 0),
  }));
}

/** The whole tip to a single named recipient. */
export function allocateToOne(totalCents: number, staffId: string): Allocation[] {
  return splitEqually(totalCents, [staffId]);
}
