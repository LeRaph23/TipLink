import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import { generateIdempotencyKey } from '@/lib/stripe/idempotency';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RATE_LIMIT = { limit: 5, windowMs: 60_000 };
const SERVICE_FEE = 25;

const BodySchema = z.object({
  staffId: z.string().uuid(),
  amount: z.number().int().positive(),
  tipAmount: z.number().int().min(50).max(100_000_00),
  currency: z.enum(['eur', 'EUR', 'usd', 'USD', 'gbp', 'GBP']),
  nonce: z.string().min(8).max(128),
  customerEmail: z.string().email().optional(),
  // Establishment expected by the page (resolved from the NFC sticker scan).
  // Optional for legacy /pay/[staffId] callers that don't yet send it; when
  // present the staff must belong to that establishment.
  expectedEstablishmentId: z.string().uuid().optional(),
});

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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
  }
  const { staffId, amount, tipAmount, currency, nonce, customerEmail, expectedEstablishmentId } = parsed.data;

  if (amount !== tipAmount + SERVICE_FEE) {
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
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

  // Cross-tenant guard: when the page provides the scanned establishment id,
  // refuse to charge a staff that doesn't belong to it.
  if (expectedEstablishmentId && staff.establishment_id !== expectedEstablishmentId) {
    return NextResponse.json(
      { error: 'Staff does not belong to this establishment' },
      { status: 403 }
    );
  }

  // Resolve the platform commission rate: establishment -> group -> default.
  let platformFeeBps = 500;
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
  const applicationFeeAmount = Math.max(0, Math.floor((tipAmount * platformFeeBps) / 10_000)) + SERVICE_FEE;

  const idempotencyKey = generateIdempotencyKey({ staffId, amount, nonce });

  const { data: txn, error: txnError } = await supabase
    .from('transactions')
    .insert({
      amount,
      currency: currency.toUpperCase(),
      staff_id: staffId,
      establishment_id: staff.establishment_id,
      status: 'pending',
      idempotency_key: idempotencyKey,
      metadata: { source: 'nfc', tip_amount: tipAmount, service_fee: SERVICE_FEE },
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
      transfer_data: { destination: staff.stripe_account_id },
      ...(applicationFeeAmount > 0 ? { application_fee_amount: applicationFeeAmount } : {}),
      ...(customerEmail ? { receipt_email: customerEmail } : {}),
      payment_method_options: {
        card: { request_three_d_secure: 'automatic' },
      },
      metadata: {
        transaction_id: transactionId,
        staff_id: staffId,
        tip_amount: String(tipAmount),
        service_fee: String(SERVICE_FEE),
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
