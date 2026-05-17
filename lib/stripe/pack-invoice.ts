import type Stripe from 'stripe';
import { stripe } from './client';

export type PackInvoiceResult = { invoiceId: string; invoicePdfUrl: string | null };

// Builds a finalized, paid-out-of-band Stripe invoice for a SmartTag pack
// order that was paid through the embedded /checkout flow.
//
// That flow charges a bare PaymentIntent rather than a Checkout Session, so
// Stripe's `invoice_creation` (Checkout-only) cannot apply. The invoice is
// assembled here so every pack order — regardless of checkout path — has a
// real downloadable invoice. The customer already paid via the PaymentIntent,
// hence `paid_out_of_band` (no second charge).
//
// Idempotency keys on the create calls keep a webhook retry from producing a
// duplicate invoice for the same PaymentIntent.
export async function createPackInvoiceForPaymentIntent(opts: {
  paymentIntent: Stripe.PaymentIntent;
  customerId: string;
  description: string;
}): Promise<PackInvoiceResult> {
  const { paymentIntent, customerId, description } = opts;

  const invoice = await stripe.invoices.create(
    {
      customer: customerId,
      auto_advance: false,
      collection_method: 'charge_automatically',
      metadata: { payment_intent: paymentIntent.id, source: 'pack-express' },
    },
    { idempotencyKey: `pack-inv:${paymentIntent.id}` },
  );

  await stripe.invoiceItems.create(
    {
      customer: customerId,
      invoice: invoice.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      description,
    },
    { idempotencyKey: `pack-inv-item:${paymentIntent.id}` },
  );

  await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false });
  const paid = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });

  return { invoiceId: paid.id, invoicePdfUrl: paid.invoice_pdf ?? null };
}
