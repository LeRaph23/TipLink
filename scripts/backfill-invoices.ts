#!/usr/bin/env npx tsx
/**
 * Backfills Stripe invoices for SmartTag pack orders that predate automatic
 * invoicing on every checkout path.
 *
 * Two kinds of orders are missing `stripe_invoice_id`:
 *   - express Checkout-Session orders created before `invoice_creation` was
 *     enabled — these get a manual invoice built from the session's
 *     PaymentIntent;
 *   - embedded `/checkout` orders (raw PaymentIntent) — same manual invoice.
 *
 * The customer already paid, so invoices are finalized and marked
 * `paid_out_of_band` (no second charge). Idempotency keys keep re-runs safe.
 *
 * Usage:
 *   npx tsx scripts/backfill-invoices.ts            # dry run — lists only
 *   npx tsx scripts/backfill-invoices.ts --apply    # actually creates invoices
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

const stripeKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeKey || !supabaseUrl || !serviceKey) {
  console.error('Missing STRIPE_SECRET_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' });
const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Order = {
  id: string;
  pack: string;
  quantity: number;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

function packDescription(pack: string, quantity: number): string {
  const name = pack === 'solo' ? 'Solo' : pack === 'duo' ? 'Duo' : pack;
  return `Digitip — Pack ${name} (${quantity} SmartTag${quantity > 1 ? 's' : ''})`;
}

// Builds a finalized, paid-out-of-band invoice for an already-paid PaymentIntent.
async function manualInvoice(
  paymentIntent: Stripe.PaymentIntent,
  customerId: string,
  description: string,
): Promise<string> {
  const invoice = await stripe.invoices.create(
    {
      customer: customerId,
      auto_advance: false,
      collection_method: 'charge_automatically',
      metadata: { payment_intent: paymentIntent.id, source: 'backfill' },
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
  return paid.id;
}

// Resolves (or creates) a Stripe customer for an already-paid PaymentIntent.
async function resolveCustomer(
  paymentIntent: Stripe.PaymentIntent,
  fallbackName: string,
): Promise<string | null> {
  if (typeof paymentIntent.customer === 'string') return paymentIntent.customer;
  if (paymentIntent.customer && 'id' in paymentIntent.customer) return paymentIntent.customer.id;

  let charge: Stripe.Charge | null = null;
  if (typeof paymentIntent.latest_charge === 'string') {
    charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
  } else if (paymentIntent.latest_charge) {
    charge = paymentIntent.latest_charge as Stripe.Charge;
  }

  const email = charge?.billing_details?.email ?? paymentIntent.receipt_email ?? undefined;
  const customer = await stripe.customers.create(
    {
      ...(email ? { email } : {}),
      name: charge?.billing_details?.name ?? fallbackName,
      metadata: { source: 'backfill', payment_intent: paymentIntent.id },
    },
    { idempotencyKey: `pack-express-customer:${paymentIntent.id}` },
  );
  return customer.id;
}

async function main() {
  console.log(APPLY ? '— BACKFILL (apply) —\n' : '— BACKFILL (dry run, pass --apply to write) —\n');

  const { data: orders, error } = await db
    .from('smarttag_orders')
    .select('id, pack, quantity, status, stripe_checkout_session_id, stripe_payment_intent_id')
    .is('stripe_invoice_id', null)
    .neq('status', 'canceled');

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const list = (orders ?? []) as Order[];
  console.log(`${list.length} order(s) without an invoice.\n`);

  let done = 0;
  let failed = 0;

  for (const order of list) {
    const description = packDescription(order.pack, order.quantity);
    try {
      let invoiceId: string | null = null;

      if (order.stripe_checkout_session_id) {
        const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
        if (session.invoice) {
          // Checkout already produced an invoice — just copy the id.
          invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice.id;
        } else if (session.payment_intent) {
          const piId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent.id;
          const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
          const customerId = typeof session.customer === 'string'
            ? session.customer
            : (await resolveCustomer(pi, description));
          if (!customerId) throw new Error('no customer');
          invoiceId = APPLY ? await manualInvoice(pi, customerId, description) : 'DRY_RUN';
        }
      } else if (order.stripe_payment_intent_id) {
        const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, {
          expand: ['latest_charge'],
        });
        const customerId = await resolveCustomer(pi, description);
        if (!customerId) throw new Error('no customer');
        invoiceId = APPLY ? await manualInvoice(pi, customerId, description) : 'DRY_RUN';
      }

      if (!invoiceId) {
        console.log(`  skip  ${order.id} — no Stripe payment reference`);
        continue;
      }

      if (APPLY && invoiceId !== 'DRY_RUN') {
        const { error: updErr } = await db
          .from('smarttag_orders')
          .update({ stripe_invoice_id: invoiceId })
          .eq('id', order.id);
        if (updErr) throw new Error(`db update failed — ${updErr.message}`);
      }

      console.log(`  ok    ${order.id} → ${invoiceId}`);
      done++;
    } catch (err) {
      failed++;
      console.error(`  fail  ${order.id} — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone: ${done} processed, ${failed} failed.`);
  if (!APPLY) console.log('Dry run — re-run with --apply to create invoices.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
