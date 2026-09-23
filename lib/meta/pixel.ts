// Browser side of the Meta pixel. Nothing here runs until the visitor has
// accepted advertising cookies: `loadPixel` is only called by the consent
// banner, and every `track*` call is a no-op before it.

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let loadedFor: string | null = null;
// Events raised before the pixel could load: the purchase on the success page
// renders before the layout's consent logic has run. Flushed by loadPixel, and
// never sent at all if consent is not given.
const pending: Array<[PixelEvent, Record<string, unknown> | undefined, string | undefined]> = [];

/** Meta's standard bootstrap, written out so it can wait for consent. */
export function loadPixel(pixelId: string): void {
  if (typeof window === 'undefined' || loadedFor === pixelId) return;
  if (!window.fbq) {
    const fbq: Fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  window.fbq('consent', 'grant');
  window.fbq('init', pixelId);
  loadedFor = pixelId;
  for (const [event, params, eventId] of pending.splice(0)) trackPixel(event, params, eventId);
}

/** Withdrawn consent: stop sending, and drop the cookies Meta set. */
export function revokePixel(): void {
  if (typeof window === 'undefined') return;
  pending.length = 0;
  try {
    window.fbq?.('consent', 'revoke');
  } catch {
    // Ignored, as for every pixel call.
  }
  loadedFor = null;
  const host = window.location.hostname;
  const domains = ['', host, `.${host.split('.').slice(-2).join('.')}`];
  for (const name of ['_fbp', '_fbc']) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`;
    }
  }
}

export function isPixelLoaded(): boolean {
  return loadedFor !== null;
}

/** Like trackPixel, but held until consent loads the pixel. */
export function trackPixelWhenReady(
  event: PixelEvent,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  if (isPixelLoaded()) trackPixel(event, params, eventId);
  else pending.push([event, params, eventId]);
}

export type PixelEvent = 'PageView' | 'ViewContent' | 'InitiateCheckout' | 'Purchase';

/**
 * `eventId` must match the one the server sends through the Conversions API
 * for the same event, so Meta counts a purchase once rather than twice.
 */
export function trackPixel(
  event: PixelEvent,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  if (!isPixelLoaded() || !window.fbq) return;
  try {
    if (eventId) window.fbq('track', event, params ?? {}, { eventID: eventId });
    else if (params) window.fbq('track', event, params);
    else window.fbq('track', event);
  } catch {
    // An ad blocker or a failed script load is the normal case, never an error.
  }
}
