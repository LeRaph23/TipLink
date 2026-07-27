import type { MetadataRoute } from 'next';
import { BASE_URL, PUBLIC_PATHS } from '@/lib/seo';
import { GUIDES } from '@/content/guides';
import { SOLUTIONS } from '@/content/solutions';

// Built from the route registry in lib/seo/routes.ts plus the content
// registries, so a new page or article cannot be forgotten here.
//
// Sitemap sharding via generateSitemaps() is deliberately not used: the limit
// is 50,000 URLs per file and the realistic ceiling here is a few hundred. If
// that is ever crossed, shard by content type (/sitemap/guides.xml, …) rather
// than by numeric index — Search Console reports coverage per sitemap, so
// type-sharding makes the indexation rate readable per template.

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries = PUBLIC_PATHS.flatMap(({ path, priority, changeFrequency, locales }) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${BASE_URL}/${l}${path}`])
        ),
      },
    }))
  );

  // Guides and solution pages are FR-only: the subject matter is French tax law
  // and French trade practice, so an English variant would be duplication with
  // no query behind it.
  const guideEntries = GUIDES.map((g) => ({
    url: `${BASE_URL}/fr/guides/${g.slug}`,
    lastModified: new Date(g.dateModified),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  const solutionEntries = SOLUTIONS.map((s) => ({
    url: `${BASE_URL}/fr/solutions/${s.slug}`,
    lastModified: new Date(s.dateModified),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  // The /guides and /solutions hubs come from PUBLIC_PATHS above, not from here.
  return [...staticEntries, ...guideEntries, ...solutionEntries];
}
