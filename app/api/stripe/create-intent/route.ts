import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import { generateIdempotencyKey } from '@/lib/stripe/idempotency';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`create-intent:${ip}`, RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  let body: { staffId: string; amount: number; currency: string; nonce: string; customerEmail?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { staffId, amount, currency, nonce, customerEmail } = body;

  // Validate optional email
  const validatedEmail = customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ? customerEmail
    : undefined;

  if (
    !staffId ||
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount < 50 ||
    amount > 100_000_00 ||
    !currency ||
    !nonce
  ) {
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

  // Resolve the platform commission rate: establishment -> group -> default.
  // The group owns the commercial relationship; the rate lives on groups.
  let platformFeeBps = 200;
  if (staff.establishment_id) {
    const { data: estab } = await supabase
      .from('establishments')
      .select('group_id')
      .eq('id', staff.establishment_id)
      .single();
    if (estab?.group_id) {
      const { data: group } = await supabase
        .from('groups')
        .select('platform_fee_bps')
        .eq('id', estab.group_id)
        .single();
      if (group && typeof group.platform_fee_bps === 'number') {
        platformFeeBps = group.platform_fee_bps;
      }
    }
  }
  // application_fee_amount is withheld from the staff's transfer and
  // credited to the platform (TipLink). Rounded down so the staff never
  // comes up short by 1 cent.
  const applicationFeeAmount = Math.max(0, Math.floor((amount * platformFeeBps) / 10_000));

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

  const intent = await stripe.paymentIntents.create(
    {
      amount,
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      // `on_behalf_of` makes the connected account the settlement
      // merchant (staff bears Stripe fees). `application_fee_amount`
      // is the platform commission, routed to TipLink's balance.
      on_behalf_of: staff.stripe_account_id,
      transfer_data: { destination: staff.stripe_account_id },
      ...(applicationFeeAmount > 0 ? { application_fee_amount: applicationFeeAmount } : {}),
      ...(validatedEmail ? { receipt_email: validatedEmail } : {}),
      metadata: {
        transaction_id: transactionId,
        staff_id: staffId,
        platform_fee_bps: String(platformFeeBps),
        application_fee_amount: String(applicationFeeAmount),
      },
    },
    { idempotencyKey }
  );

  return NextResponse.json({
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    transactionId,
  });
}
