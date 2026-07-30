import type { Metadata } from 'next';
import { BASE_URL, pageAlternates } from './base';

export type BuildPageMetadataInput = {
  locale: string;
  /** Locale-relative, leading slash; '' for the homepage. */
  path: string;
  title: string;
  description: string;
  /** Restrict to the locales that actually return 200 (e.g. ['fr']). */
  locales?: readonly string[];
  /** Absolute or root-relative OG image. Defaults to the route-level image. */
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  /** Set on pages that must never be indexed (checkout, order, auth…). */
  noindex?: boolean;
};

/**
 * The single sanctioned way to build page metadata.
 *
 * Every indexable page needs a canonical, hreflang alternates, Open Graph and
 * Twitter tags. Previously each page assembled those by hand and most simply
 * didn't: only ten called `pageAlternates`, so every other page silently
 * inherited the homepage canonical from the locale layout and told Google it
 * was a duplicate of the homepage. Funnelling all of it through one call makes
 * that failure mode impossible — and `__tests__/seo/routes-registry.test.ts`
 * fails the build if a public page skips it.
 */
export function buildPageMetadata({
  locale,
  path,
  title,
  description,
  locales,
  image,
  imageAlt,
  type = 'website',
  publishedTime,
  modifiedTime,
  noindex = false,
}: BuildPageMetadataInput): Metadata {
  const url = `${BASE_URL}/${locale}${path}`;
  // Root-level static PNG, not a per-locale ImageResponse route: see
  // app/opengraph-image.png and the note in lib/seo/README-og.md. The `.png`
  // extension matters — the extensionless path 307-redirects into the locale
  // prefix, and social crawlers routinely refuse to follow redirects for
  // images, which would leave every share with no preview at all.
  const ogImage = image ?? `${BASE_URL}/opengraph-image.png`;

  return {
    title,
    description,
    alternates: pageAlternates(locale, path, locales),
    openGraph: {
      type,
      url,
      title,
      description,
      siteName: 'Digitip',
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
      images: [{ url: ogImage, width: 1200, height: 630, alt: imageAlt ?? title }],
      ...(type === 'article' ? { publishedTime, modifiedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    ...(noindex
      ? {
          // Both signals matter: a robots.txt Disallow alone can still leave a
          // URL indexed from an inbound link, and Google can never read a
          // noindex on a page it is not allowed to crawl.
          robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
        }
      : {}),
  };
}
