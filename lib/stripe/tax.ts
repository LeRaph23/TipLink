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
