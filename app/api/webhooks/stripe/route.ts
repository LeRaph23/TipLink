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
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const transactionId = session.metadata?.transaction_id;

      if (!transactionId) {
        throw new Error(`Missing transaction_id in checkout.session metadata: ${session.id}`);
      }

      await supabase
        .from('transactions')
        .update({
          status: 'succeeded',
          stripe_session_id: session.id,
          stripe_payment_intent_id:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
        })
        .eq('id', transactionId)
        .eq('status', 'pending');

      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const transactionId = session.metadata?.transaction_id;
      if (transactionId) {
        await supabase
          .from('transactions')
          .update({ status: 'failed' })
          .eq('id', transactionId)
          .eq('status', 'pending');
      }
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

    default:
      // Unknown event types are logged but not errored
      break;
  }
}
