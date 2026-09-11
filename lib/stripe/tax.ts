import { stripe } from './client';

export type PackTax = {
  htAmount: number;       // pre-VAT, in cents (after any promo discount)
  taxAmount: number;      // VAT, in cents
  totalAmount: number;    // htAmount + taxAmount, in cents
  taxRatePercent: number | null;
  country: string;
  calculationId: string | null;
};

// Loose EU VAT shape (e.g. FR12345678901, DE123456789). Stripe Tax does the
// real validation — this just avoids sending obvious garbage.
const EU_VAT_RE = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

// Computes VAT for a SmartTag pack purchase using Stripe Tax, based on the
// customer's shipping country. Pack prices are stored excl. VAT (HT); Stripe
// Tax resolves the correct rate per EU country and applies reverse-charge
// when a valid EU VAT id is supplied.
export async function computePackTax(opts: {
  htAmount: number;
  currency: string;
  country: string;
  postalCode?: string | null;
  vatNumber?: string | null;
}): Promise<PackTax> {
  const { htAmount, currency, country, postalCode, vatNumber } = opts;
  const cc = country.toUpperCase();

  if (htAmount <= 0) {
    return { htAmount: Math.max(0, htAmount), taxAmount: 0, totalAmount: Math.max(0, htAmount), taxRatePercent: 0, country: cc, calculationId: null };
  }

  const vat = (vatNumber ?? '').toUpperCase().replace(/\s/g, '');

  const calc = await stripe.tax.calculations.create({
    currency: currency.toLowerCase(),
    line_items: [{ amount: htAmount, reference: 'digitip-pack', tax_behavior: 'exclusive' }],
    customer_details: {
      address: { country: cc, ...(postalCode ? { postal_code: postalCode } : {}) },
      address_source: 'shipping',
      ...(EU_VAT_RE.test(vat)
        ? { tax_ids: [{ type: 'eu_vat' as const, value: vat }] }
        : {}),
    },
  });

  const taxAmount = calc.tax_amount_exclusive;
  const totalAmount = calc.amount_total;
  const taxRatePercent = Math.round((taxAmount / htAmount) * 10000) / 100;

  return { htAmount, taxAmount, totalAmount, taxRatePercent, country: cc, calculationId: calc.id ?? null };
}


/**
 * The seller's own country, used for the provisional VAT a PaymentIntent is
 * created with before a shipping address is known.
 */
export const DEFAULT_TAX_COUNTRY = 'FR';

/** French standard rate, in basis points. */
const DEFAULT_TAX_BPS = 2000;

/**
 * Provisional VAT applied at PaymentIntent creation.
 *
 * Pack prices are stored excl. VAT, and the intent used to be created at the
 * bare HT amount: VAT was added only if the browser went on to call
 * /api/billing/pack-tax when the address changed. The only thing stopping a
 * confirmation before that was a client-side `canPay` flag. Anyone confirming
 * with the client secret before the address handler ran (or with JS partly
 * broken) paid 79 euros instead of 94,80, and Digitip still owed the 15,80 to
 * the DGFiP out of its own margin.
 *
 * So the intent is now created already taxed, at the domestic rate. This is
 * deliberately a flat local computation rather than a Stripe Tax call: it adds
 * no latency and no new failure mode to the start of checkout, and it is only
 * ever a floor. The real, address-based calculation replaces it through
 * /api/billing/pack-tax before the buyer can reach a payable total in the
 * normal flow, and a `tax_provisional` marker records which of the two a
 * PaymentIntent is currently carrying.
 *
 * Erring high is the safe direction: EU rates run from about 17 % to 27 %, so
 * a buyer in a cheaper jurisdiction is corrected downward before paying, while
 * the failure mode this replaces was charging no VAT at all.
 */
export function provisionalPackTax(htAmount: number): {
  htAmount: number;
  taxAmount: number;
  totalAmount: number;
  country: string;
} {
  const ht = Math.max(0, Math.round(htAmount));
  const taxAmount = Math.round((ht * DEFAULT_TAX_BPS) / 10_000);
  return { htAmount: ht, taxAmount, totalAmount: ht + taxAmount, country: DEFAULT_TAX_COUNTRY };
}
