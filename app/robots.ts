import type { MetadataRoute } from 'next';

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://digitip.app').replace(/\/$/, '');

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
