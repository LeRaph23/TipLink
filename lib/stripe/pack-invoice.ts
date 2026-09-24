import type Stripe from 'stripe';
import { stripe } from './client';

export type PackInvoiceResult = { invoiceId: string; invoicePdfUrl: string | null };

// Builds a finalized, paid-out-of-band Stripe invoice for a SmartTag pack
// order paid through the embedded /checkout flow (a raw PaymentIntent, so
// Stripe's Checkout-only invoice_creation cannot apply).
//
// When `htAmount` (excl. VAT) is provided, the invoice carries an exclusive
// line item and Stripe automatic_tax breaks out the VAT — matching the amount
// charged. If automatic_tax cannot run, it falls back to a single line at the
// exact amount paid so an invoice is always produced. The customer already
// paid via the PaymentIntent, hence `paid_out_of_band` (no second charge).
export async function createPackInvoiceForPaymentIntent(opts: {
  paymentIntent: Stripe.PaymentIntent;
  customerId: string;
  description: string;
  htAmount?: number | null;
}): Promise<PackInvoiceResult> {
  const { paymentIntent, customerId, description, htAmount } = opts;

  if (htAmount != null && htAmount > 0) {
    try {
      return await buildInvoice({
        paymentIntent, customerId, description,
        lineAmount: htAmount, taxBehavior: 'exclusive', automaticTax: true,
      });
    } catch (err) {
      console.error('[pack-invoice] automatic_tax invoice failed, falling back to flat invoice', err);
    }
  }

  // The amount charged already includes VAT (metadata written by the pack
  // intent routes): the fallback invoice must show it too, at the French rate,
  // rather than a single VAT-less line.
  const chargedVat = Number(paymentIntent.metadata?.tax_amount ?? 0) > 0;
  return buildInvoice({
    paymentIntent, customerId, description,
    lineAmount: paymentIntent.amount, taxBehavior: 'inclusive', automaticTax: false,
    taxRateId: chargedVat ? await frenchVatInclusiveRate() : undefined,
  });
}

/** A reusable Stripe tax rate "TVA 20 %" (inclusive, France), created once. */
async function frenchVatInclusiveRate(): Promise<string> {
  const existing = await stripe.taxRates.list({ active: true, inclusive: true, limit: 100 });
  const found = existing.data.find((r) => r.metadata?.digitip === 'fr-vat-20-inclusive');
  if (found) return found.id;
  const created = await stripe.taxRates.create(
    {
      display_name: 'TVA',
      description: 'TVA France 20 %',
      jurisdiction: 'FR',
      country: 'FR',
      percentage: 20,
      inclusive: true,
      tax_type: 'vat',
      metadata: { digitip: 'fr-vat-20-inclusive' },
    },
    { idempotencyKey: 'digitip-fr-vat-20-inclusive' },
  );
  return created.id;
}

async function buildInvoice(opts: {
  paymentIntent: Stripe.PaymentIntent;
  customerId: string;
  description: string;
  lineAmount: number;
  taxBehavior: 'inclusive' | 'exclusive';
  automaticTax: boolean;
  taxRateId?: string;
}): Promise<PackInvoiceResult> {
  const { paymentIntent, customerId, description, lineAmount, taxBehavior, automaticTax, taxRateId } = opts;
  const suffix = automaticTax ? 'tax' : taxRateId ? 'vat20' : 'flat';

  const invoice = await stripe.invoices.create(
    {
      customer: customerId,
      auto_advance: false,
      collection_method: 'charge_automatically',
      ...(automaticTax ? { automatic_tax: { enabled: true } } : {}),
      metadata: { payment_intent: paymentIntent.id, source: 'pack-express' },
    },
    { idempotencyKey: `pack-inv:${paymentIntent.id}:${suffix}` },
  );

  await stripe.invoiceItems.create(
    {
      customer: customerId,
      invoice: invoice.id,
      amount: lineAmount,
      currency: paymentIntent.currency,
      description,
      ...(taxRateId ? { tax_rates: [taxRateId] } : { tax_behavior: taxBehavior }),
    },
    { idempotencyKey: `pack-inv-item:${paymentIntent.id}:${suffix}` },
  );

  if (automaticTax) {
    // Stripe Tax recomputes the VAT here. If it disagrees with what was
    // charged (e.g. no registration: 0 % while the buyer paid 20 %), an
    // invoice for a different total must not go out; the caller falls back.
    const draft = await stripe.invoices.retrieve(invoice.id);
    if (draft.total !== paymentIntent.amount) {
      await stripe.invoices.del(invoice.id);
      throw new Error(`automatic tax invoice total ${draft.total} != charged ${paymentIntent.amount}`);
    }
  }

  await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false });
  const paid = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });

  return { invoiceId: paid.id, invoicePdfUrl: paid.invoice_pdf ?? null };
}
