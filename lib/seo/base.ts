import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { getBaseUrl } from '@/lib/env';

/**
 * Canonical origin for every absolute URL we publish (canonicals, hreflang,
 * sitemap, JSON-LD @ids, OG images).
 *
 * Reads the one validated variable, NEXT_PUBLIC_BASE_URL. This used to read an
 * undeclared NEXT_PUBLIC_APP_URL, which is validated nowhere and set nowhere,
 * so it always fell through to the hardcoded literal — meaning preview
 * deployments advertised production canonicals pointing at digitip.app.
 */
export const BASE_URL = getBaseUrl();

/**
 * Builds the canonical URL + hreflang alternates for a localized page.
 *
 * The locale layout's `generateMetadata` is inherited by every child page,
 * so without a page-level override every sub-page would declare the
 * homepage as its canonical URL — which makes Google reject the declared
 * canonical and treat the page as a duplicate. Each indexable page must
 * call this with its own path (in practice, via `buildPageMetadata`).
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
