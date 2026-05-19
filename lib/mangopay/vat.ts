// In-app VAT computation for SmartTag pack sales. Mangopay provides no tax
// engine, so this replaces Stripe Tax.
//
// Model:
//  - A valid EU VAT id supplied  -> intra-EU B2B reverse charge -> 0%.
//  - Destination in the EU table -> that country's standard rate (B2C).
//  - Anything else (non-EU)      -> 0% (export).
//
// COMPLIANCE NOTE: standard rates below are dated 2026-05. They must be kept
// reviewed and updated — VAT rates are a compliance responsibility.

export type PackTax = {
  htAmount: number; // pre-VAT, in cents (after any promo discount)
  taxAmount: number; // VAT, in cents
  totalAmount: number; // htAmount + taxAmount, in cents
  taxRatePercent: number | null;
  country: string;
  calculationId: string | null; // always null — kept for shape compatibility
};

// EU standard VAT rates (percent), as of 2026-05.
const VAT_RATES: Record<string, number> = {
  AT: 20, BE: 21, BG: 20, HR: 25, CY: 19, CZ: 21, DK: 25, EE: 24,
  FI: 25.5, FR: 20, DE: 19, GR: 24, HU: 27, IE: 23, IT: 22, LV: 21,
  LT: 21, LU: 17, MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SK: 23,
  SI: 22, ES: 21, SE: 25,
};

// Loose EU VAT id shape (e.g. FR12345678901, DE123456789).
const EU_VAT_RE = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

export function computePackTax(opts: {
  htAmount: number;
  country: string;
  vatNumber?: string | null;
}): PackTax {
  const cc = (opts.country ?? '').toUpperCase();
  const htAmount = Math.max(0, Math.round(opts.htAmount));

  if (htAmount <= 0) {
    return { htAmount, taxAmount: 0, totalAmount: htAmount, taxRatePercent: 0, country: cc, calculationId: null };
  }

  const vat = (opts.vatNumber ?? '').toUpperCase().replace(/\s/g, '');
  const reverseCharge = EU_VAT_RE.test(vat);
  const ratePercent = reverseCharge ? 0 : (VAT_RATES[cc] ?? 0);

  const taxAmount = Math.round((htAmount * ratePercent) / 100);
  return {
    htAmount,
    taxAmount,
    totalAmount: htAmount + taxAmount,
    taxRatePercent: ratePercent,
    country: cc,
    calculationId: null,
  };
}
