import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Lightweight endpoint the embedded checkout calls right before
// stripe.confirmPayment(...). It attaches the customer email to the
// PaymentIntent metadata so our webhook can route the order confirmation
// through Resend with the Digitip brand — without setting `receipt_email`,
// which would also trigger Stripe's own (off-brand) receipt email.
//
// Auth is the clientSecret itself: only the page that created the PI knows
// it. We do still rate-limit per IP so a leaked secret can't be hammered.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`attach-pi-email:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { clientSecret?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.clientSecret !== 'string' || !body.clientSecret.startsWith('pi_')) {
    return NextResponse.json({ error: 'Invalid clientSecret' }, { status: 400 });
  }
  if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email) || body.email.length > 320) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  // clientSecret format: `pi_XXX_secret_YYY` — split on the canonical separator.
  const piId = body.clientSecret.split('_secret_')[0];
  if (!piId.startsWith('pi_')) {
    return NextResponse.json({ error: 'Invalid clientSecret' }, { status: 400 });
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(piId);
    if (intent.client_secret !== body.clientSecret) {
      // Mismatch — caller doesn't actually own this PI.
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Only allow attaching email to pack-express PIs we created (defense
    // in depth — a leaked Stripe key shouldn't let anyone scribble email
    // into unrelated PIs).
    if (intent.metadata?.source !== 'pack-express') {
      return NextResponse.json({ error: 'Unsupported PI' }, { status: 400 });
    }
    await stripe.paymentIntents.update(piId, {
      metadata: { ...intent.metadata, customer_email: body.email },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.error('[attach-pi-email]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
