import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';

// MUST be nodejs: stripe.webhooks.constructEvent() uses Node.js crypto module
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Idempotency: check if already successfully processed
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id, processed_at')
    .eq('stripe_event_id', event.id)
    .single();

  if (existing?.processed_at) {
    return NextResponse.json({ received: true });
  }

  // Log event first — ensures replay support even if handler crashes
  await supabase.from('webhook_events').upsert(
    {
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as import('@/types/database').Json,
    },
    { onConflict: 'stripe_event_id' }
  );

  try {
    await handleEvent(event, supabase);

    await supabase
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq('stripe_event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';

    await supabase
      .from('webhook_events')
      .update({ error: errorMsg })
      .eq('stripe_event_id', event.id);

    // Return 500 so Stripe retries delivery
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}

async function handleEvent(
  event: Stripe.Event,
  supabase: ReturnType<typeof createServiceClient>
) {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const transactionId = intent.metadata?.transaction_id;

      if (!transactionId) {
        throw new Error(`Missing transaction_id in payment_intent metadata: ${intent.id}`);
      }

      // Defensive: only flip to succeeded if Stripe confirms the PI is fully paid.
      if (intent.status !== 'succeeded') break;

      await supabase
        .from('transactions')
        .update({
          status: 'succeeded',
          stripe_payment_intent_id: intent.id,
        })
        .eq('id', transactionId)
        .eq('status', 'pending');

      break;
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const transactionId = intent.metadata?.transaction_id;
      if (!transactionId) break;

      await supabase
        .from('transactions')
        .update({
          status: 'failed',
          stripe_payment_intent_id: intent.id,
        })
        .eq('id', transactionId)
        .eq('status', 'pending');
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;

      if (!paymentIntentId) break;

      await supabase
        .from('transactions')
        .update({ status: 'refunded' })
        .eq('stripe_payment_intent_id', paymentIntentId)
        .eq('status', 'succeeded');
      break;
    }

    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      if (account.details_submitted && account.charges_enabled) {
        await supabase
          .from('staff_profiles')
          .update({ onboarding_status: 'complete' })
          .eq('stripe_account_id', account.id);
      }
      break;
    }

    // ============================================================
    // SmartTag pack orders (one-shot hardware purchase, mode=payment)
    // ============================================================
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Legacy subscription sessions are ignored; everything is one-shot now.
      if (session.mode !== 'payment') break;

      const groupId = session.metadata?.group_id;
      const rawPack = session.metadata?.pack;
      const pack = (['s', 'm', 'l'] as const).find((p) => p === rawPack);
      if (!groupId || !pack) {
        // Not a pack checkout (e.g. other future one-off products).
        break;
      }

      const customerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;

      const shipping = session.collected_information?.shipping_details ?? null;

      await supabase
        .from('groups')
        .update({
          stripe_customer_id: customerId ?? undefined,
          ...(shipping
            ? {
                shipping_address: {
                  name: shipping.name,
                  ...shipping.address,
                } as unknown as import('@/types/database').Json,
              }
            : {}),
        })
        .eq('id', groupId);

      const quantity = Number(session.metadata?.quantity ?? 0) || null;
      await supabase
        .from('smarttag_orders')
        .upsert(
          {
            group_id: groupId,
            pack,
            quantity: quantity ?? (pack === 's' ? 15 : pack === 'm' ? 30 : 60),
            stripe_checkout_session_id: session.id,
            status: 'pending_fulfillment',
            shipping_address: shipping
              ? ({
                  name: shipping.name,
                  ...shipping.address,
                } as unknown as import('@/types/database').Json)
              : null,
          },
          { onConflict: 'stripe_checkout_session_id' }
        );
      break;
    }

    // Legacy subscription events — kept as no-ops so historical customers
    // on the old model don't trigger webhook errors. Safe to remove once
    // all legacy subs are canceled.
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed':
    case 'invoice.paid': {
      break;
    }

    default:
      // Unknown event types are logged but not errored
      break;
  }
}
