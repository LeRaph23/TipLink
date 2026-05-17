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

  return buildInvoice({
    paymentIntent, customerId, description,
    lineAmount: paymentIntent.amount, taxBehavior: 'inclusive', automaticTax: false,
  });
}

async function buildInvoice(opts: {
  paymentIntent: Stripe.PaymentIntent;
  customerId: string;
  description: string;
  lineAmount: number;
  taxBehavior: 'inclusive' | 'exclusive';
  automaticTax: boolean;
}): Promise<PackInvoiceResult> {
  const { paymentIntent, customerId, description, lineAmount, taxBehavior, automaticTax } = opts;
  const suffix = automaticTax ? 'tax' : 'flat';

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
      tax_behavior: taxBehavior,
    },
    { idempotencyKey: `pack-inv-item:${paymentIntent.id}:${suffix}` },
  );

  await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false });
  const paid = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });

  return { invoiceId: paid.id, invoicePdfUrl: paid.invoice_pdf ?? null };
}
