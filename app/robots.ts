import type { MetadataRoute } from 'next';
import { BASE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/*/dashboard',
          '/*/dashboard/',
          '/*/onboarding',
          '/*/onboarding/',
          '/*/checkout',
          '/*/checkout/',
          '/*/order',
          '/*/order/',
          '/*/pay/',
          '/*/join/',
          '/*/ambassadeur/',
          // Recruitment funnel: /rejoindre redirects, /rejoindre-ambassadeur
          // is gated by a secret token — neither should be crawled.
          '/*/rejoindre',
          '/*/forgot-password',
          '/*/reset-password',
          '/s/',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
