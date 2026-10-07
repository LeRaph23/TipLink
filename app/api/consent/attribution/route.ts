import { NextRequest, NextResponse } from 'next/server';
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_S,
  attributionFromUrl,
  serializeAttribution,
} from '@/lib/marketing/attribution';
import { CONSENT_COOKIE, parseConsent } from '@/lib/marketing/consent';

export const runtime = 'nodejs';

/**
 * Stores the campaign of the page the visitor is on, once they have accepted
 * advertising cookies.
 *
 * The proxy only remembers a campaign for visitors who already consented. A
 * first-time visitor arriving from an ad accepts on that very page, after the
 * proxy ran; the banner then posts the page's own URL here so the visit is
 * still credited. Refusal clears whatever was stored.
 */
export async function POST(request: NextRequest) {
  const consent = parseConsent(request.cookies.get(CONSENT_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });

  if (consent !== 'granted') {
    res.cookies.delete(ATTRIBUTION_COOKIE);
    return res;
  }

  const body = (await request.json().catch(() => ({}))) as { href?: unknown };
  let url: URL;
  try {
    url = new URL(typeof body.href === 'string' ? body.href : '', request.url);
  } catch {
    return res;
  }
  const attribution = attributionFromUrl(url.searchParams, url.pathname);
  if (attribution) {
    res.cookies.set(ATTRIBUTION_COOKIE, serializeAttribution(attribution), {
      maxAge: ATTRIBUTION_MAX_AGE_S,
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      path: '/',
    });
  }
  return res;
}
