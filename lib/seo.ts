import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

export const BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://digitip.app'
).replace(/\/$/, '');

/**
 * Builds the canonical URL + hreflang alternates for a localized page.
 *
 * The locale layout's `generateMetadata` is inherited by every child page,
 * so without a page-level override every sub-page would declare the
 * homepage as its canonical URL — which makes Google reject the declared
 * canonical and treat the page as a duplicate. Each indexable page must
 * call this with its own path.
 *
 * `path` is locale-relative and starts with '/' ('' for the homepage).
 * `locales` restricts which language versions exist (e.g. FR-only pages).
 */
export function pageAlternates(
  locale: string,
  path: string,
  locales: readonly string[] = routing.locales,
): NonNullable<Metadata['alternates']> {
  return {
    canonical: `${BASE_URL}/${locale}${path}`,
    languages: {
      ...Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}${path}`])),
      'x-default': `${BASE_URL}/${routing.defaultLocale}${path}`,
    },
  };
}
