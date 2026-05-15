import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import { generateIdempotencyKey } from '@/lib/stripe/idempotency';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RATE_LIMIT = { limit: 5, windowMs: 60_000 };
const SERVICE_FEE = 25;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`create-group-intent:${ip}`, RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { establishmentId: string; amount: number; tipAmount: number; currency: string; nonce: string; customerEmail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { establishmentId, amount, tipAmount, currency, nonce, customerEmail } = body;

  const validatedEmail = customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ? customerEmail
    : undefined;

  if (
    !establishmentId ||
    typeof tipAmount !== 'number' ||
    !Number.isFinite(tipAmount) ||
    tipAmount < 50 ||
    tipAmount > 100_000_00 ||
    amount !== tipAmount + SERVICE_FEE ||
    !currency ||
    !nonce
  ) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Validate establishment and resolve platform fee
  const { data: estab } = await supabase
    .from('establishments')
    .select('id, group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .single();

  if (!estab) return NextResponse.json({ error: 'Establishment not found' }, { status: 404 });

  // Check at least one payable staff member exists
  const { data: payableStaff } = await supabase
    .from('staff_profiles')
    .select('id, stripe_account_id')
    .eq('establishment_id', establishmentId)
    .eq('is_active', true)
    .eq('onboarding_status', 'complete')
    .is('deleted_at', null)
    .not('stripe_account_id', 'is', null);

  if (!payableStaff || payableStaff.length === 0) {
    return NextResponse.json({ error: 'No payable staff in this establishment' }, { status: 404 });
  }

  let platformFeeBps = 500;
  if (estab.group_id) {
    const { data: group } = await supabase
      .from('groups')
      .select('platform_fee_bps')
      .eq('id', estab.group_id)
      .single();
    if (group && typeof group.platform_fee_bps === 'number') {
      platformFeeBps = group.platform_fee_bps;
    }
  }

  const platformFee = Math.max(0, Math.floor((tipAmount * platformFeeBps) / 10_000));
  // Platform keeps: platformFee + SERVICE_FEE. Staff receive the rest split equally.

  const idempotencyKey = generateIdempotencyKey({ staffId: establishmentId, amount, nonce });

  const { data: txn, error: txnError } = await supabase
    .from('transactions')
    .insert({
      amount,
      currency: currency.toUpperCase(),
      staff_id: null,
      establishment_id: establishmentId,
      status: 'pending',
      idempotency_key: idempotencyKey,
      metadata: {
        source: 'group_tip',
        tip_amount: tipAmount,
        service_fee: SERVICE_FEE,
        platform_fee_bps: platformFeeBps,
        platform_fee: platformFee,
      },
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
    if (!existing) return NextResponse.json({ error: 'Transaction lookup failed' }, { status: 500 });
    transactionId = existing.id;
  } else {
    transactionId = txn!.id;
  }

  const transferGroup = `grp_${transactionId}`;
  const netForStaff = tipAmount - platformFee;
  const staffIds = payableStaff.map((s) => s.id).join(',');

  const intent = await stripe.paymentIntents.create(
    {
      amount,
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      // No on_behalf_of: payment lands on platform account, transfers created by webhook
      transfer_group: transferGroup,
      ...(validatedEmail ? { receipt_email: validatedEmail } : {}),
      payment_method_options: {
        card: { request_three_d_secure: 'automatic' },
      },
      metadata: {
        transaction_id: transactionId,
        group_tip: 'true',
        establishment_id: establishmentId,
        tip_amount: String(tipAmount),
        service_fee: String(SERVICE_FEE),
        platform_fee_bps: String(platformFeeBps),
        platform_fee: String(platformFee),
        net_for_staff: String(netForStaff),
        staff_ids: staffIds,
        transfer_group: transferGroup,
      },
    },
    { idempotencyKey }
  );

  return NextResponse.json({
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    transactionId,
    staffCount: payableStaff.length,
  });
}
