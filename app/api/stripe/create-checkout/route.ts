import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import { generateIdempotencyKey } from '@/lib/stripe/idempotency';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: { staffId: string; amount: number; currency: string; nonce: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { staffId, amount, currency, nonce } = body;

  if (!staffId || !amount || amount < 50 || !currency || !nonce) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: staff } = await supabase
    .from('staff_profiles')
    .select('id, full_name, stripe_account_id, establishment_id, onboarding_status')
    .eq('id', staffId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .single();

  if (!staff?.stripe_account_id || staff.onboarding_status !== 'complete') {
    return NextResponse.json(
      { error: 'Staff account not found or not ready for payments' },
      { status: 404 }
    );
  }

  const idempotencyKey = generateIdempotencyKey({ staffId, amount, nonce });

  // Insert pending transaction before Stripe call for full audit trail.
  // 23505 = unique_violation (safe to ignore — idempotent replay scenario).
  const { data: txn, error: txnError } = await supabase
    .from('transactions')
    .insert({
      amount,
      currency: currency.toUpperCase(),
      staff_id: staffId,
      establishment_id: staff.establishment_id,
      status: 'pending',
      idempotency_key: idempotencyKey,
      metadata: { source: 'nfc' },
    })
    .select('id')
    .single();

  let transactionId: string;

  if (txnError) {
    if (txnError.code !== '23505') {
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
    }
    // Replay: fetch the existing pending transaction
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Transaction lookup failed' }, { status: 500 });
    }
    transactionId = existing.id;
  } else {
    transactionId = txn!.id;
  }

  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: `Tip for ${staff.full_name}` },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pay/${staffId}`,
      payment_intent_data: {
        // Zero-transit: funds go directly to staff's Express account
        transfer_data: { destination: staff.stripe_account_id },
        metadata: { transaction_id: transactionId, staff_id: staffId },
      },
      metadata: { transaction_id: transactionId },
    },
    // Stripe-level idempotency key
    { idempotencyKey }
  );

  return NextResponse.json({ sessionId: session.id, sessionUrl: session.url });
}
