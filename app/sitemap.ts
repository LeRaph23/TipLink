import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://digitip.app').replace(/\/$/, '');

const PUBLIC_PATHS = [
  { path: '', priority: 1.0, changeFrequency: 'weekly' as const },
  { path: '/pricing', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/contact', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/devenir-ambassadeur', priority: 0.6, changeFrequency: 'monthly' as const },
  { path: '/rejoindre', priority: 0.6, changeFrequency: 'monthly' as const },
  { path: '/rejoindre-ambassadeur', priority: 0.5, changeFrequency: 'monthly' as const },
  { path: '/login', priority: 0.4, changeFrequency: 'yearly' as const },
  { path: '/signup', priority: 0.4, changeFrequency: 'yearly' as const },
  { path: '/cgv', priority: 0.2, changeFrequency: 'yearly' as const },
  { path: '/terms', priority: 0.2, changeFrequency: 'yearly' as const },
  { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' as const },
  { path: '/mentions-legales', priority: 0.2, changeFrequency: 'yearly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_PATHS.flatMap(({ path, priority, changeFrequency }) =>
    routing.locales.map((locale) => ({
      url: `${BASE_URL}/${locale}${path}`,
      lastModified,
      changeFrequency,
      priority,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${BASE_URL}/${l}${path}`])
        ),
      },
    }))
  );
}
