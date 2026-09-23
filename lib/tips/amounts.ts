/**
 * The tip itself, as opposed to what the customer's card was charged.
 *
 * Since the 00073 fee model the tipper pays `tip + fixed + bps%`, and
 * `transactions.amount` is that TOTAL. The establishment receives only the tip;
 * the rest is the service fee and never reaches them. Several manager-facing
 * screens summed `amount` and so reported a number the salon never sees —
 * about 25 c + 5 % per tip above the bank — while the payroll statement, built
 * on tip_allocations, reported the real one. Two Digitip screens disagreeing
 * about the same week is worse than either being wrong alone.
 *
 * Pure and dependency-free so it can be unit-tested.
 */

export type TipAmountSource = {
  /** `transactions.amount` — the gross charge. */
  amount: number | null;
  /** `transactions.metadata` — carries `tip_amount` since the 00073 fee model. */
  metadata: unknown;
};

/**
 * Returns the tip in cents.
 *
 * Rows written before 00073 have no `tip_amount` key, and for those `amount`
 * IS the tip: the platform fee was deducted from it rather than added on top.
 * So falling back to `amount` is correct for legacy rows rather than merely
 * convenient, and the two eras sum together honestly.
 */
export function tipAmountOf(row: TipAmountSource): number {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.tip_amount;
  // `Number(null)` is 0, so null has to be rejected before the conversion:
  // otherwise a row with no tip_amount reads as a genuine zero-euro tip and
  // silently drops out of every total, which is the same class of bug as the
  // one this helper exists to fix. A real 0 must still be honoured, so
  // "missing" and "zero" cannot share a code path.
  const tip = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (Number.isFinite(tip) && tip >= 0) return tip;
  const gross = Number(row.amount);
  return Number.isFinite(gross) && gross > 0 ? gross : 0;
}

/** Sum of {@link tipAmountOf} across rows. */
export function sumTipAmounts(rows: readonly TipAmountSource[]): number {
  return rows.reduce((total, row) => total + tipAmountOf(row), 0);
}
