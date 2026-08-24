// Tip fee model — the single source of truth, shared by the browser and the
// server so the amount shown to the tipper and the amount charged can never
// drift apart.
//
// The tipper pays the tip they chose PLUS the whole cost of the transaction:
//
//     total = tip + fixedCents + ceil(tip * bps / 10_000)
//
// `fixedCents` mirrors Stripe's per-transaction fixed fee (0.25 € on EEA
// cards), passed straight through. `bps` covers Stripe's percentage fee and
// the Digitip margin. The establishment therefore receives 100 % of the tip —
// nothing is deducted from it, which is what lets us say so honestly.
//
// Keep this file dependency-free: it is imported from an edge runtime page,
// from client components, and from Node route handlers.

/** Fixed part of the service fee, in cents. */
export const TIP_FEE_FIXED_CENTS = 25;

/** Variable part, in basis points of the tip (100 bps = 1 %). */
export const TIP_FEE_BPS = 500;

export type TipFeeConfig = {
  /** Fixed part in cents. Mirrors `groups.platform_fixed_fee_cents`. */
  fixedCents: number;
  /** Variable part in basis points. Mirrors `groups.platform_fee_bps`. */
  bps: number;
};

export const DEFAULT_TIP_FEE_CONFIG: TipFeeConfig = {
  fixedCents: TIP_FEE_FIXED_CENTS,
  bps: TIP_FEE_BPS,
};

/** Upper bounds, mirroring the CHECK constraints on `groups`. */
const MAX_FIXED_CENTS = 500;
const MAX_BPS = 1500;

function clampInt(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(0, Math.round(value)));
}

/**
 * Normalises a fee config coming from the database or an untrusted client.
 * Anything missing, out of range or non-numeric falls back to the default, so
 * a malformed row can never produce a nonsensical charge.
 */
export function resolveTipFeeConfig(input?: Partial<TipFeeConfig> | null): TipFeeConfig {
  return {
    fixedCents: clampInt(input?.fixedCents, DEFAULT_TIP_FEE_CONFIG.fixedCents, MAX_FIXED_CENTS),
    bps: clampInt(input?.bps, DEFAULT_TIP_FEE_CONFIG.bps, MAX_BPS),
  };
}

/**
 * Service fee added on top of the tip, in cents.
 *
 * The variable part is rounded UP to the centime: the rounding remainder is at
 * most 1 c and we would rather keep it than pay it, since the whole point of
 * the model is that the platform never eats into the tip.
 */
export function computeTipFee(tipCents: number, config?: Partial<TipFeeConfig> | null): number {
  const { fixedCents, bps } = resolveTipFeeConfig(config);
  if (!Number.isFinite(tipCents) || tipCents <= 0) return fixedCents;
  return fixedCents + Math.ceil((Math.round(tipCents) * bps) / 10_000);
}

/** Total debited from the tipper, in cents: the tip plus the service fee. */
export function computeTipTotal(tipCents: number, config?: Partial<TipFeeConfig> | null): number {
  return Math.round(tipCents) + computeTipFee(tipCents, config);
}
