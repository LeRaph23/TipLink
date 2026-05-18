import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { BASE_URL } from '@/lib/seo';

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

type PublicPath = {
  path: string;
  priority: number;
  changeFrequency: ChangeFrequency;
  /** Locales for which this page actually exists and returns 200. */
  locales: readonly string[];
};

// Only canonical, 200-returning public pages belong here. Pages that redirect
// (e.g. /rejoindre, /signup) or 404 in some locales must NOT be listed —
// Google flags them as "page with redirect" / "excluded by noindex".
const PUBLIC_PATHS: PublicPath[] = [
  { path: '', priority: 1.0, changeFrequency: 'weekly', locales: routing.locales },
  { path: '/pricing', priority: 0.9, changeFrequency: 'weekly', locales: routing.locales },
  { path: '/contact', priority: 0.7, changeFrequency: 'monthly', locales: routing.locales },
  // FR-only landing page — /en/devenir-ambassadeur returns 404 (notFound()).
  { path: '/devenir-ambassadeur', priority: 0.6, changeFrequency: 'monthly', locales: ['fr'] },
  { path: '/login', priority: 0.4, changeFrequency: 'yearly', locales: routing.locales },
  { path: '/cgv', priority: 0.2, changeFrequency: 'yearly', locales: routing.locales },
  { path: '/terms', priority: 0.2, changeFrequency: 'yearly', locales: routing.locales },
  { path: '/privacy', priority: 0.2, changeFrequency: 'yearly', locales: routing.locales },
  { path: '/mentions-legales', priority: 0.2, changeFrequency: 'yearly', locales: routing.locales },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_PATHS.flatMap(({ path, priority, changeFrequency, locales }) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}${path}`,
      lastModified,
      changeFrequency,
      priority,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${BASE_URL}/${l}${path}`])
        ),
      },
    }))
  );
}
