import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createTipperUser } from '@/lib/mangopay/users';
import { createCardRegistration } from '@/lib/mangopay/cards';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

// Mangopay card types accepted by the Checkout SDK card flow.
const CARD_TYPES = ['CB_VISA_MASTERCARD', 'MAESTRO', 'AMEX', 'BCMC'] as const;

const BodySchema = z.object({
  cardType: z.enum(CARD_TYPES).optional(),
  customerEmail: z.string().email().max(255).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
});

// Serves the Checkout SDK's `onCreateCardRegistration` callback. A CardRegistration
// requires a UserId, so the disposable PAYER user that owns the card (and will be
// the PayIn's AuthorId) is created here — its id rides back on the registration's
// UserId field for the matching `onCreatePayment` call.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`create-card-registration:${ip}`, RATE_LIMIT);
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
  const { cardType, customerEmail, firstName, lastName } = parsed.data;

  try {
    const mangopayUserId = await createTipperUser({
      firstName: firstName ?? 'Client',
      lastName: lastName ?? 'TipLink',
      // A PAYER user needs an RFC-valid email but no deliverable mailbox; when
      // the tipper supplies none, a per-checkout placeholder keeps users unique.
      email: customerEmail ?? `guest-${randomUUID()}@tipper.tiplink.app`,
    });

    const cardRegistration = await createCardRegistration(
      mangopayUserId,
      cardType ?? 'CB_VISA_MASTERCARD'
    );

    // Returned verbatim to the Checkout SDK — it reads AccessKey,
    // PreregistrationData, CardRegistrationURL and Id (UserId carries the
    // disposable PAYER id forward to create-payin).
    return NextResponse.json(cardRegistration);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mangopay error';
    console.error('[create-card-registration]', message);
    return NextResponse.json({ error: 'Failed to create card registration' }, { status: 502 });
  }
}
