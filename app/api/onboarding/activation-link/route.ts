import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { findPendingActivation } from '@/lib/onboarding/activation';
import { signOnboardingToken } from '@/lib/auth/onboarding-token';
import { getBaseUrl } from '@/lib/env';
import { sendPlaqueActivationLink } from '@/lib/email';
import { maskEmail } from '@/lib/nfc/scan-destination';
import { firstNameFrom } from '@/lib/email/lifecycle';

export const runtime = 'nodejs';

// POST /api/onboarding/activation-link  { tag }
//
// Public: whoever holds the plaque can ask for its activation link, but the
// link only ever goes to the buyer's email, never back in the response. Handing
// it to the scanner would let any customer who scans a plaque not yet set up
// take over the establishment and have its tips paid to him.
export async function POST(req: Request) {
  const ip = getClientIp(new Headers(req.headers));
  const rl = await rateLimit(`activation-link:${ip}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  let body: { tag?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const tag = typeof body.tag === 'string' ? body.tag.trim().toLowerCase() : '';
  if (tag.length < 4 || !/^[a-z0-9_-]+$/.test(tag)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const service = createServiceClient();
  const pending = await findPendingActivation(service, tag);
  if (!pending) return NextResponse.json({ error: 'not_pending' }, { status: 404 });
  if (!pending.recipient) return NextResponse.json({ error: 'no_email' }, { status: 409 });

  // Per plaque as well as per IP, so the buyer's inbox cannot be flooded.
  const perGroup = await rateLimit(`activation-link:group:${pending.groupId}`, { limit: 3, windowMs: 60 * 60_000 });
  if (!perGroup.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const { email, name } = pending.recipient;
  const setupUrl =
    `${getBaseUrl()}/fr/onboarding?group=${pending.groupId}` +
    `&token=${encodeURIComponent(signOnboardingToken(pending.groupId, email))}` +
    `&email=${encodeURIComponent(email)}`;

  try {
    await sendPlaqueActivationLink({
      to: email,
      firstName: firstNameFrom(name, 'Bonjour'),
      setupUrl,
    });
  } catch (e) {
    console.error('[activation-link] send failed', pending.groupId, e);
    return NextResponse.json({ error: 'send_failed' }, { status: 502 });
  }

  return NextResponse.json({ sentTo: maskEmail(email) });
}
