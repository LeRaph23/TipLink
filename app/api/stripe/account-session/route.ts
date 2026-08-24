import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import {
  ensureEstablishmentAccount,
  syncEstablishmentAccountStatus,
} from '@/lib/stripe/establishment-account';
import { authorizeEstablishmentAccess } from '@/lib/auth/establishment-access';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isUpstreamUnavailable } from '@/lib/errors/upstream';

export const runtime = 'nodejs';

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

const BodySchema = z.object({
  establishmentId: z.string().uuid(),
  // Signed onboarding token, for the wizard steps that run before the manager
  // has a session (scan and express modes sign the user out pending email
  // confirmation). Omitted when an authenticated admin is calling.
  token: z.string().min(8).max(512).optional(),
});

/**
 * Reads the establishment's Connect account state, straight from Stripe, and
 * mirrors it back onto the row.
 *
 * The wizard calls this after the embedded component reports it is done, to
 * decide whether onboarding may be finalised — trusting a client-side "exit"
 * callback for that would let anyone finish setup without submitting anything.
 * It doubles as the self-healing path when an `account.updated` webhook is
 * missed.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`account-status:${ip}`, RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const establishmentId = request.nextUrl.searchParams.get('establishmentId') ?? '';
  const token = request.nextUrl.searchParams.get('token');
  if (!z.string().uuid().safeParse(establishmentId).success) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const access = await authorizeEstablishmentAccess(supabase, establishmentId, token);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 404 ? 'Establishment not found' : 'Forbidden' },
      { status: access.status },
    );
  }

  const { data: estab } = await supabase
    .from('establishments')
    .select('stripe_account_id')
    .eq('id', establishmentId)
    .maybeSingle();

  if (!estab?.stripe_account_id) {
    return NextResponse.json({
      hasAccount: false,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
  }

  try {
    const status = await syncEstablishmentAccountStatus(supabase, {
      accountId: estab.stripe_account_id,
    });
    if (!status) return NextResponse.json({ error: 'Establishment not found' }, { status: 404 });
    return NextResponse.json({ hasAccount: true, ...status });
  } catch (err) {
    console.error('[account-status]', err instanceof Error ? err.message : err);
    if (isUpstreamUnavailable(err)) {
      return NextResponse.json({ error: 'connect_unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'connect_failed' }, { status: 500 });
  }
}

/**
 * Mints a Stripe Account Session so the browser can mount the Connect embedded
 * components for an establishment — onboarding inside Digitip's own UI, with no
 * redirect to Stripe.
 *
 * The establishment's connected account is created on the first call.
 *
 * Because the onboarding wizard reaches this route before the manager has a
 * session, authorization accepts either an authenticated group admin OR the
 * HMAC onboarding token already used by the express flow. Both are bound to the
 * establishment's group, so neither grants access to anyone else's account.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`account-session:${ip}`, RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
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
  const { establishmentId, token } = parsed.data;

  const supabase = createServiceClient();

  const access = await authorizeEstablishmentAccess(supabase, establishmentId, token);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 404 ? 'Establishment not found' : 'Forbidden' },
      { status: access.status },
    );
  }

  const ensured = await ensureEstablishmentAccount(supabase, establishmentId);
  if ('error' in ensured) {
    const status = ensured.error === 'not_found' ? 404 : 502;
    return NextResponse.json({ error: ensured.error }, { status });
  }

  try {
    const session = await stripe.accountSessions.create({
      account: ensured.accountId,
      components: {
        // Collect identity, business details and the payout bank account.
        account_onboarding: {
          enabled: true,
          features: { external_account_collection: true },
        },
        // Required by Stripe on accounts with no Stripe-hosted dashboard where
        // Stripe carries the losses: this is how the establishment updates its
        // details and credentials afterwards.
        account_management: {
          enabled: true,
          features: { external_account_collection: true },
        },
        // Also required in this configuration — Stripe pushes outstanding
        // verification requests through it.
        notification_banner: {
          enabled: true,
          features: { external_account_collection: true },
        },
        // Optional, but the establishment needs somewhere to see its money.
        payouts: { enabled: true },
      },
    });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('[account-session]', err instanceof Error ? err.message : err);
    if (isUpstreamUnavailable(err)) {
      return NextResponse.json({ error: 'connect_unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'connect_failed' }, { status: 500 });
  }
}
