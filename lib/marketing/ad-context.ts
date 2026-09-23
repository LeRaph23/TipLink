// What the checkout routes copy onto a pack PaymentIntent so the webhook can
// credit the order to a campaign and, with consent, report it to Meta.
//
// Read at intent creation because the webhook has no request of the buyer's
// to read cookies from: Stripe calls it, not the browser.

import type { NextRequest } from 'next/server';
import { ATTRIBUTION_COOKIE, attributionToMetadata, parseAttributionCookie } from './attribution';
import { CONSENT_COOKIE, parseConsent } from './consent';
import { getClientIp } from '@/lib/rate-limit';

// Meta's own cookies, set by the pixel once consent is given.
const FBP_RE = /^fb\.\d\.\d+\.\d+$/;
const FBC_RE = /^fb\.\d\.\d+\.[\w-]{1,300}$/;

export function adContextMetadata(request: NextRequest): Record<string, string> {
  const out: Record<string, string> = attributionToMetadata(
    parseAttributionCookie(request.cookies.get(ATTRIBUTION_COOKIE)?.value),
  );

  if (parseConsent(request.cookies.get(CONSENT_COOKIE)?.value) !== 'granted') {
    return out;
  }

  out.ad_consent = 'granted';
  const fbp = request.cookies.get('_fbp')?.value;
  const fbc = request.cookies.get('_fbc')?.value;
  if (fbp && FBP_RE.test(fbp)) out.meta_fbp = fbp;
  if (fbc && FBC_RE.test(fbc)) out.meta_fbc = fbc;
  const ip = getClientIp(request.headers);
  if (ip && ip !== 'unknown') out.client_ip = ip.slice(0, 64);
  const ua = request.headers.get('user-agent');
  // Stripe caps a metadata value at 500 characters.
  if (ua) out.client_ua = ua.slice(0, 500);
  return out;
}
