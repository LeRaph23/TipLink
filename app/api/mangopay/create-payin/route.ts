import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { generateIdempotencyKey } from '@/lib/mangopay/idempotency';
import { createDirectCardPayIn, getPayIn } from '@/lib/mangopay/payins';
import { platformIds } from '@/lib/mangopay/client';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { DEFAULT_PLATFORM_FEE_BPS } from '@/lib/env';

export const runtime = 'nodejs';

const RATE_LIMIT = { limit: 5, windowMs: 60_000 };
const SERVICE_FEE = 25;

const BodySchema = z.object({
  staffId: z.string().uuid(),
  amount: z.number().int().positive(),
  tipAmount: z.number().int().min(50).max(100_000_00),
  currency: z.enum(['eur', 'EUR']),
  nonce: z.string().min(8).max(128),
  // The CardId yielded by the Checkout SDK after tokenization, and the
  // disposable PAYER user that owns it (UserId of the CardRegistration).
  cardId: z.string().min(1).max(64),
  mangopayUserId: z.string().min(1).max(64),
  customerEmail: z.string().email().optional(),
  // Establishment expected by the page (resolved from the NFC sticker scan).
  expectedEstablishmentId: z.string().uuid().optional(),
});

// Serves the Checkout SDK's `onCreatePayment` callback for a single-staff tip.
// The Direct Card PayIn credits the central collection wallet; the staff's
// share is a ledger entry, so no Mangopay account or validated KYC is required
// to collect a tip — the staff onboards later to withdraw it.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`create-payin:${ip}`, RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
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
  const { staffId, amount, tipAmount, currency, nonce, cardId, mangopayUserId, customerEmail, expectedEstablishmentId } = parsed.data;

  if (amount !== tipAmount + SERVICE_FEE) {
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: staff } = await supabase
    .from('staff_profiles')
    .select('id, establishment_id')
    .eq('id', staffId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .single();

  if (!staff) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
  }

  // Cross-tenant guard: when the page provides the scanned establishment id,
  // refuse to charge a staff that doesn't belong to it.
  if (expectedEstablishmentId && staff.establishment_id !== expectedEstablishmentId) {
    return NextResponse.json(
      { error: 'Staff does not belong to this establishment' },
      { status: 403 }
    );
  }

  // Resolve the platform commission rate: group -> default.
  let platformFeeBps = DEFAULT_PLATFORM_FEE_BPS;
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
  const platformFeeAmount = Math.max(0, Math.floor((tipAmount * platformFeeBps) / 10_000)) + SERVICE_FEE;

  const idempotencyKey = generateIdempotencyKey({ scope: staffId, amount, nonce });

  const { data: txn, error: txnError } = await supabase
    .from('transactions')
    .insert({
      amount,
      currency: currency.toUpperCase(),
      staff_id: staffId,
      establishment_id: staff.establishment_id,
      status: 'pending',
      idempotency_key: idempotencyKey,
      platform_fee_amount: platformFeeAmount,
      mangopay_card_id: cardId,
      metadata: {
        source: 'nfc',
        tip_amount: tipAmount,
        service_fee: SERVICE_FEE,
        platform_fee_bps: platformFeeBps,
        ...(customerEmail ? { customer_email: customerEmail } : {}),
      },
    })
    .select('id, mangopay_payin_id')
    .single();

  let transactionId: string;

  if (txnError) {
    if (txnError.code !== '23505') {
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
    }
    // A retried submit (same nonce). Reuse the existing transaction — and if it
    // already produced a PayIn, return that one rather than charging again.
    const { data: existing } = await supabase
      .from('transactions')
      .select('id, mangopay_payin_id')
      .eq('idempotency_key', idempotencyKey)
      .single();
    if (!existing) {
      return NextResponse.json({ error: 'Transaction lookup failed' }, { status: 500 });
    }
    if (existing.mangopay_payin_id) {
      try {
        const payIn = await getPayIn(existing.mangopay_payin_id);
        return NextResponse.json(payIn);
      } catch {
        return NextResponse.json({ error: 'Failed to load existing payment' }, { status: 502 });
      }
    }
    transactionId = existing.id;
  } else {
    transactionId = txn!.id;
  }

  const { walletId } = platformIds();

  let payIn;
  try {
    payIn = await createDirectCardPayIn({
      authorId: mangopayUserId,
      creditedWalletId: walletId,
      cardId,
      debitedFunds: amount,
      idempotencyKey,
      statementDescriptor: 'TipLink',
      ...(ip !== 'unknown' ? { ipAddress: ip } : {}),
      tag: `txn:${transactionId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mangopay error';
    console.error('[create-payin]', message);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 502 });
  }

  await supabase
    .from('transactions')
    .update({ mangopay_payin_id: payIn.Id })
    .eq('id', transactionId);

  // The PayIn object is returned verbatim — the Checkout SDK drives the 3DS
  // redirect from it. The final transaction status is set by the webhook.
  return NextResponse.json(payIn);
}
