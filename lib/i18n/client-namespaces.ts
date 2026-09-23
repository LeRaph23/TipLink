import type { AbstractIntlMessages } from 'next-intl';

/**
 * Which slices of the message catalogue are sent to the browser.
 *
 * The root layout used to hand `getMessages()` — the entire 70 KB catalogue,
 * 1144 keys — to NextIntlClientProvider on every route. The tipping page, which
 * is the product's primary surface and is opened on a phone seconds after
 * scanning a sticker, uses about 4 KB of it.
 *
 * Two thirds of that was structurally unnecessary rather than merely unused:
 *
 *  - nine namespaces (legal, cgv, mentions, pricing, …) are read only through
 *    `getTranslations` in server components and can never be needed on the
 *    client at all;
 *  - `dashboard` (21 KB) and `landing` (11 KB) are each reached from exactly
 *    one subtree, so they are provided there instead of everywhere.
 *
 * `__tests__/lib/client-namespaces.test.ts` re-derives all of this from the
 * source and fails if a client component ever reaches for a namespace that is
 * not provided where it renders. That test is what makes this safe: a missing
 * namespace is a runtime throw in next-intl, not a silent fallback.
 */

/** Namespaces every route's client components may use. */
export const BASE_CLIENT_NAMESPACES = [
  'auth',
  'checkout',
  'common',
  'contact',
  'error',
  'imageUpload',
  'join',
  'onboarding',
  'order',
  'pay',
] as const;

/** Added by app/[locale]/dashboard/layout.tsx, for that subtree only. */
export const DASHBOARD_NAMESPACES = ['dashboard'] as const;

/** Added by app/[locale]/page.tsx, which is the only page rendering LandingPage. */
export const LANDING_NAMESPACES = ['landing'] as const;

/**
 * Narrows a catalogue to the given namespaces.
 *
 * Missing namespaces are skipped rather than throwing: a catalogue that has
 * lost a namespace is a content bug for the parity test to report, not a
 * reason to take a page down.
 */
export function pickNamespaces(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const picked: Record<string, unknown> = {};
  for (const ns of namespaces) {
    if (ns in messages) picked[ns] = (messages as Record<string, unknown>)[ns];
  }
  return picked as AbstractIntlMessages;
}
