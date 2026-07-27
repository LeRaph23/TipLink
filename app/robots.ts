import type { MetadataRoute } from 'next';
import { BASE_URL, robotsDisallow } from '@/lib/seo';

// The disallow list is derived from NOINDEX_PREFIXES in lib/seo/routes.ts so
// it cannot drift from the pages that actually set `noindex`. It previously
// missed /pro/ (commercial portal), /receipt/, /signup and the locale-prefixed
// /auth/ routes — only the bare /auth/ callback was covered.
//
// Note this is a crawl directive, not an indexing one: pages under these
// prefixes also set robots.index=false via buildPageMetadata, because a
// disallowed URL can still be indexed from an inbound link.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: robotsDisallow(),
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
