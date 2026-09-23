// Advertising consent: the one switch that gates the Meta pixel and the
// server-side Conversions API.
//
// Kept as a plain first-party cookie rather than in localStorage because the
// server needs it too: the checkout routes copy it onto the PaymentIntent, and
// the webhook only reports a purchase to Meta when the buyer said yes.

export const CONSENT_COOKIE = 'dt_consent';
// The CNIL recommends asking again after six months, and caps the choice's
// lifetime at thirteen.
export const CONSENT_MAX_AGE_S = 182 * 24 * 60 * 60;

export type AdConsent = 'granted' | 'denied';

export function parseConsent(raw: string | null | undefined): AdConsent | null {
  return raw === 'granted' || raw === 'denied' ? raw : null;
}

// The pixel and its banner only run on the pages an ad can lead to and the
// purchase funnel behind them. Never on the tipping page a customer reaches by
// tapping a tag, nor on the dashboards: a cookie banner there would be noise
// between a customer and a tip, for a tracker that has no business there.
const MARKETING_PREFIXES = ['/solutions', '/pricing', '/checkout', '/order', '/guides', '/comparatif'];

/** `path` is locale-less: `/`, `/solutions/tatoueur`, `/order/solo`. */
export function isMarketingPath(path: string): boolean {
  if (path === '/' || path === '') return true;
  return MARKETING_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(fr|en)(?=\/|$)/, '') || '/';
}
