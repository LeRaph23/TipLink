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
  establishmentId: z.string().uuid(),
  amount: z.number().int().positive(),
  tipAmount: z.number().int().min(50).max(100_000_00),
  currency: z.enum(['eur', 'EUR']),
  nonce: z.string().min(8).max(128),
  cardId: z.string().min(1).max(64),
  mangopayUserId: z.string().min(1).max(64),
  customerEmail: z.string().email().optional(),
});

// Serves the Checkout SDK's `onCreatePayment` callback for a group tip. The
// whole tip is a single PayIn into the central wallet; splitting it across the
// establishment's staff is a pure ledger operation (`group_tip_transfers`
// rows) done by the webhook — no per-staff Mangopay Transfer.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`create-group-payin:${ip}`, RATE_LIMIT);
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
  const { establishmentId, amount, tipAmount, currency, nonce, cardId, mangopayUserId, customerEmail } = parsed.data;

  if (amount !== tipAmount + SERVICE_FEE) {
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: estab } = await supabase
    .from('establishments')
    .select('id, group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .single();

  if (!estab) {
    return NextResponse.json({ error: 'Establishment not found' }, { status: 404 });
  }

  // At least one active staff member must exist to split the tip across. They
  // need no Mangopay account yet — the split is a ledger credit they can
  // withdraw once onboarded.
  const { count: staffCount } = await supabase
    .from('staff_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('establishment_id', establishmentId)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (!staffCount || staffCount === 0) {
    return NextResponse.json({ error: 'No active staff in this establishment' }, { status: 404 });
  }

  let platformFeeBps = DEFAULT_PLATFORM_FEE_BPS;
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
  const netForStaff = tipAmount - platformFee;

  const idempotencyKey = generateIdempotencyKey({ scope: establishmentId, amount, nonce });

  const { data: txn, error: txnError } = await supabase
    .from('transactions')
    .insert({
      amount,
      currency: currency.toUpperCase(),
      staff_id: null,
      establishment_id: establishmentId,
      status: 'pending',
      idempotency_key: idempotencyKey,
      platform_fee_amount: platformFee + SERVICE_FEE,
      mangopay_card_id: cardId,
      metadata: {
        source: 'group_tip',
        tip_amount: tipAmount,
        service_fee: SERVICE_FEE,
        platform_fee_bps: platformFeeBps,
        platform_fee: platformFee,
        net_for_staff: netForStaff,
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
    console.error('[create-group-payin]', message);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 502 });
  }

  await supabase
    .from('transactions')
    .update({ mangopay_payin_id: payIn.Id })
    .eq('id', transactionId);

  return NextResponse.json(payIn);
}
