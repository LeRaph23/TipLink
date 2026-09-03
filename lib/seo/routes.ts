import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

export type PublicPath = {
  /** Locale-relative, leading slash; '' for the homepage. */
  path: string;
  priority: number;
  changeFrequency: ChangeFrequency;
  /** Locales for which this page actually exists and returns 200. */
  locales: readonly string[];
};

/**
 * Every indexable public page, and the single source the sitemap is built from.
 *
 * Only canonical, 200-returning pages belong here. Pages that redirect
 * (/rejoindre, /signup) or 404 in some locales must NOT be listed — Google
 * flags them as "page with redirect" / "excluded by noindex".
 *
 * `__tests__/seo/routes-registry.test.ts` walks app/[locale] and asserts every
 * page file appears in exactly one of PUBLIC_PATHS or NOINDEX_PREFIXES, and
 * that every entry here calls buildPageMetadata. That test is what stops a new
 * route from silently inheriting the homepage canonical, and what would have
 * caught /devenir-commercial-pro being missing from the sitemap for months.
 */
export const PUBLIC_PATHS: PublicPath[] = [
  { path: '', priority: 1.0, changeFrequency: 'weekly', locales: routing.locales },
  { path: '/pricing', priority: 0.9, changeFrequency: 'weekly', locales: routing.locales },
  { path: '/contact', priority: 0.7, changeFrequency: 'monthly', locales: routing.locales },
  // Content hubs — FR-only, like the articles under them.
  { path: '/guides', priority: 0.7, changeFrequency: 'weekly', locales: ['fr'] },
  { path: '/solutions', priority: 0.7, changeFrequency: 'weekly', locales: ['fr'] },
  { path: '/comparatif', priority: 0.7, changeFrequency: 'monthly', locales: ['fr'] },
  // FR-only landing pages — the /en variants call notFound().
  { path: '/devenir-ambassadeur', priority: 0.6, changeFrequency: 'monthly', locales: ['fr'] },
  { path: '/devenir-commercial-pro', priority: 0.6, changeFrequency: 'monthly', locales: ['fr'] },
  { path: '/a-propos', priority: 0.5, changeFrequency: 'yearly', locales: ['fr'] },
  { path: '/login', priority: 0.4, changeFrequency: 'yearly', locales: routing.locales },
  { path: '/cgv', priority: 0.2, changeFrequency: 'yearly', locales: routing.locales },
  { path: '/terms', priority: 0.2, changeFrequency: 'yearly', locales: routing.locales },
  { path: '/privacy', priority: 0.2, changeFrequency: 'yearly', locales: routing.locales },
  { path: '/mentions-legales', priority: 0.2, changeFrequency: 'yearly', locales: routing.locales },
];

/**
 * Route prefixes that must never be indexed: transactional flows, authenticated
 * areas, token-gated pages. Pages under these still need
 * `buildPageMetadata({ noindex: true })` — a robots.txt Disallow alone leaves a
 * linked URL indexable, and Google cannot read a noindex it may not crawl.
 */
export const NOINDEX_PREFIXES: readonly string[] = [
  '/dashboard',
  '/onboarding',
  '/checkout',
  '/order',
  '/pay',
  '/join',
  '/receipt',
  '/rejoindre',
  '/rejoindre-ambassadeur',
  '/ambassadeur',
  '/pro',
  '/auth',
  '/signup',
  '/lp',
];

/** robots.txt disallow list, kept in step with NOINDEX_PREFIXES. */
export function robotsDisallow(): string[] {
  return [
    '/api/',
    '/auth/',
    '/s/',
    ...NOINDEX_PREFIXES.map((p) => `/*${p}`),
  ];
}
