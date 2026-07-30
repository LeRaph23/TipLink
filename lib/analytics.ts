import { track } from '@vercel/analytics';

// Funnel instrumentation.
//
// @vercel/analytics was mounted in the layout but `track` was never called
// anywhere in the repo, so the only data was pageviews. That is not enough to
// see a funnel here: the onboarding wizard keeps its step in the query string
// and advances with router.replace, so every one of its ten steps collapses
// into a single /[locale]/onboarding pageview. The Stripe hand-off is a
// full-page navigation to an external domain, and the return is a query param
// nothing read — so "started KYC" and "abandoned KYC" were indistinguishable.
//
// Events are deliberately coarse and carry no personal data: Vercel Analytics
// properties are visible to anyone with dashboard access, and none of this
// needs an identifier to be actionable.

export type AnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_step_completed'
  | 'onboarding_step_skipped'
  | 'onboarding_submitted'
  | 'onboarding_failed'
  | 'stripe_link_requested'
  | 'stripe_returned_complete'
  | 'stripe_returned_incomplete'
  | 'staff_invite_sent'
  | 'staff_invite_repaired';

type Props = Record<string, string | number | boolean | null>;

/**
 * Fire-and-forget. Analytics must never break a user flow, so failures are
 * swallowed — a blocked script or an ad-blocker is the normal case, not an
 * error worth surfacing.
 */
export function trackEvent(event: AnalyticsEvent, props?: Props): void {
  try {
    track(event, props);
  } catch {
    // Intentionally ignored.
  }
}
