'use client';

import { useEffect } from 'react';
import { trackPixelWhenReady } from '@/lib/meta/pixel';

/**
 * Browser half of the purchase event. The webhook sends the same purchase
 * through the Conversions API under the same id (the PaymentIntent), so Meta
 * keeps one. Queued, not fired: it only leaves the browser once the visitor
 * has accepted advertising cookies.
 */
export function PixelPurchase({
  eventId,
  valueCents,
  currency,
  pack,
  quantity,
}: {
  eventId: string;
  valueCents: number;
  currency: string;
  pack: string;
  quantity: number;
}) {
  useEffect(() => {
    trackPixelWhenReady(
      'Purchase',
      {
        value: Math.round(valueCents) / 100,
        currency: currency.toUpperCase(),
        content_ids: [pack],
        content_type: 'product',
        num_items: quantity,
      },
      eventId,
    );
  }, [eventId, valueCents, currency, pack, quantity]);
  return null;
}
