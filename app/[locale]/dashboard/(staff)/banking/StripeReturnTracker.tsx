'use client';

import { useEffect, useRef } from 'react';
import { trackEvent } from '@/lib/analytics';

/**
 * Records whether the user came back from Stripe's hosted KYC with a usable
 * account or not.
 *
 * The banking page is a server component, so it cannot call the browser-side
 * track(). This is the minimal client leaf that can. Without it, "started KYC"
 * and "abandoned KYC" are indistinguishable — the return URL carried
 * ?stripe=return / ?stripe=refresh all along but nothing read it.
 */
export function StripeReturnTracker({
  stripeReturn,
  isComplete,
}: {
  stripeReturn: string | undefined;
  isComplete: boolean;
}) {
  // Guards against a double fire under React strict mode in development.
  const fired = useRef(false);

  useEffect(() => {
    if (!stripeReturn || fired.current) return;
    fired.current = true;
    trackEvent(isComplete ? 'stripe_returned_complete' : 'stripe_returned_incomplete', {
      // 'refresh' means Stripe sent them back to get a fresh link (expired or
      // abandoned); 'return' means they completed Stripe's own flow, which
      // still does not guarantee the account is chargeable.
      reason: stripeReturn,
    });
  }, [stripeReturn, isComplete]);

  return null;
}
