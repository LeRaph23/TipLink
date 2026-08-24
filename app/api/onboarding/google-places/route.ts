import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { searchEstablishmentCandidates } from '@/lib/google-places';

export const runtime = 'nodejs';

// GET /api/onboarding/google-places?name=...&address=...
// Server-side proxy to Google Places (New) text search, used by the onboarding
// wizard and the dashboard to let a manager pick their establishment and attach
// a Google review link. Runs server-side so the API key never reaches the
// browser. Mirrors the /api/onboarding/geocode rate-limit + proxy pattern.
export async function GET(req: Request) {
  const ip = getClientIp(new Headers(req.headers));
  const rl = await rateLimit(`gplaces:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ candidates: [] }, { status: 429 });
  }

  const url = new URL(req.url);
  const name = url.searchParams.get('name')?.trim() ?? '';
  const address = url.searchParams.get('address')?.trim() ?? '';
  if (name.length < 2) {
    return NextResponse.json({ candidates: [] });
  }

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    // Not configured → the client falls back to the manual link field.
    return NextResponse.json({ candidates: [], unconfigured: true });
  }

  try {
    const candidates = await searchEstablishmentCandidates({ name, address });
    return NextResponse.json({ candidates });
  } catch (err) {
    // `failed` matters: an empty list because Google errored is not the same as
    // an empty list because the place isn't listed. Without the distinction the
    // UI tells the manager "no match, try another name" and sends them typing
    // variations at an endpoint that is down, with no way to tell.
    console.error('[google-places] search failed', err);
    return NextResponse.json({ candidates: [], failed: true }, { status: 502 });
  }
}
