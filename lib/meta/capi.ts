// Server side of Meta tracking: the Conversions API.
//
// The browser pixel misses a large share of purchases (Safari's tracking
// protection, ad blockers, a buyer who closes the tab before the success page
// renders). The webhook is the one place that sees every paid order, so it
// reports the purchase here too, under the same event id as the browser, and
// Meta keeps one of the two.
//
// Only ever called for a buyer who accepted advertising cookies: the consent
// travels on the PaymentIntent metadata (see lib/marketing/ad-context.ts).

import { createHash } from 'node:crypto';

// Graph API versions are supported for about two years after release.
const GRAPH_VERSION = 'v23.0';

export type PurchaseInput = {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
  /** The PaymentIntent id, also used as the browser event id. */
  eventId: string;
  eventTime: Date;
  eventSourceUrl: string | null;
  /** Revenue excluding VAT, in cents. */
  valueCents: number;
  currency: string;
  contentId: string;
  quantity: number;
  email: string | null;
  country: string | null;
  fbp: string | null;
  fbc: string | null;
  clientIp: string | null;
  userAgent: string | null;
};

export function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/** The request body Meta expects. Pure, so it can be tested without a network. */
export function buildPurchasePayload(input: PurchaseInput) {
  const userData: Record<string, unknown> = {};
  if (input.email) userData.em = [sha256(input.email)];
  if (input.country) userData.country = [sha256(input.country)];
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;

  return {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(input.eventTime.getTime() / 1000),
        event_id: input.eventId,
        action_source: 'website',
        ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
        user_data: userData,
        custom_data: {
          value: Math.round(input.valueCents) / 100,
          currency: input.currency.toUpperCase(),
          content_ids: [input.contentId],
          content_type: 'product',
          num_items: input.quantity,
        },
      },
    ],
    ...(input.testEventCode ? { test_event_code: input.testEventCode } : {}),
  };
}

/**
 * Best effort: a Meta outage must never fail the webhook that fulfils the
 * order, so every failure is logged and swallowed.
 */
export async function sendMetaPurchase(input: PurchaseInput): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(input.pixelId)}/events?access_token=${encodeURIComponent(input.accessToken)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildPurchasePayload(input)),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[meta-capi] purchase rejected', res.status, detail.slice(0, 300));
    }
  } catch (err) {
    console.error('[meta-capi] purchase failed', err instanceof Error ? err.message : err);
  }
}
