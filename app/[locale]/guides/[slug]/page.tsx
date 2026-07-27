import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { ArticleLayout } from '@/components/content/ArticleLayout';
import { JsonLd } from '@/lib/seo/JsonLd';
import {
  BASE_URL,
  buildPageMetadata,
  articleNode,
  breadcrumbList,
  faqPage,
  personNode,
  jsonLdGraph,
} from '@/lib/seo';
import { GUIDES, getGuide } from '@/content/guides';
import { GUIDE_BODIES } from '@/content/guides/registry';

// Statically generated: no `force-dynamic` here. These pages have no
// request-scoped data, and shipping them as SSG is what keeps them cheap to
// crawl. If this route ever shows as ƒ (Dynamic) in `next build` output,
// something has pulled in cookies() or headers() and needs fixing.
export function generateStaticParams() {
  return GUIDES.map((g) => ({ locale: 'fr', slug: g.slug }));
}

export const dynamicParams = false;

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const guide = getGuide(slug);
  if (!guide || locale !== 'fr') return {};

  return buildPageMetadata({
    locale,
    path: `/guides/${guide.slug}`,
    title: guide.title,
    description: guide.description,
    locales: ['fr'],
    type: 'article',
    publishedTime: guide.datePublished,
    modifiedTime: guide.dateModified,
  });
}

export default async function GuidePage({ params }: Props) {
  const { locale, slug } = await params;
  // FR-only: the subject matter is French tax law, so an /en variant would be
  // duplication with no query behind it.
  if (locale !== 'fr') notFound();

  const guide = getGuide(slug);
  const load = GUIDE_BODIES[slug];
  if (!guide || !load) notFound();

  setRequestLocale(locale);
  const { default: Body } = await load();

  const url = `${BASE_URL}/fr/guides/${guide.slug}`;
  const graph = jsonLdGraph([
    personNode(),
    articleNode({
      headline: guide.title,
      description: guide.description,
      url,
      datePublished: guide.datePublished,
      dateModified: guide.dateModified,
      locale,
    }),
    breadcrumbList([
      { name: 'Accueil', url: `${BASE_URL}/fr` },
      { name: 'Guides', url: `${BASE_URL}/fr/guides` },
      { name: guide.cardTitle, url },
    ]),
    faqPage(guide.faq),
  ]);

  const relatedLinks = guide.related
    .map((s) => getGuide(s))
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
    .map((g) => ({ label: g.cardTitle, href: `/guides/${g.slug}` }));

  return (
    <>
      <JsonLd data={graph} />
      <ArticleLayout
        meta={guide}
        hubHref="/guides"
        hubLabel="Tous les guides"
        relatedLinks={relatedLinks}
      >
        <Body />
      </ArticleLayout>
    </>
  );
}
