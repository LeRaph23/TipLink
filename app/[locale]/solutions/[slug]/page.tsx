import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { ArticleLayout } from '@/components/content/ArticleLayout';
import { JsonLd } from '@/lib/seo/JsonLd';
import {
  BASE_URL,
  buildPageMetadata,
  webPage,
  breadcrumbList,
  faqPage,
  productNode,
  personNode,
  jsonLdGraph,
} from '@/lib/seo';
import { SOLUTIONS, getSolution } from '@/content/solutions';
import { SOLUTION_BODIES } from '@/content/solutions/registry';
import { getAllPackPricing } from '@/lib/stripe/pricing';

export function generateStaticParams() {
  return SOLUTIONS.map((s) => ({ locale: 'fr', slug: s.slug }));
}

export const dynamicParams = false;

/**
 * Prices here feed Product schema markup only — they are never charged.
 *
 * getAllPackPricing() talks to Stripe, and these pages are prerendered, so a
 * Stripe outage or a rotated key at build time would otherwise fail the whole
 * build over decorative markup. Degrade to no Product node instead: a page
 * without Offer markup is a minor SEO loss, a broken deploy is not.
 *
 * Deliberately NOT applied to the checkout and order routes, where falling back
 * to a stale price would mean charging the wrong amount.
 */
async function safePackPricing() {
  try {
    return await getAllPackPricing();
  } catch (err) {
    console.error('[solutions] pricing unavailable, omitting Product schema:', err);
    return null;
  }
}

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const sol = getSolution(slug);
  if (!sol || locale !== 'fr') return {};

  return buildPageMetadata({
    locale,
    path: `/solutions/${sol.slug}`,
    title: sol.title,
    description: sol.description,
    locales: ['fr'],
  });
}

export default async function SolutionPage({ params }: Props) {
  const { locale, slug } = await params;
  if (locale !== 'fr') notFound();

  const sol = getSolution(slug);
  const load = SOLUTION_BODIES[slug];
  if (!sol || !load) notFound();

  setRequestLocale(locale);
  const [{ default: Body }, pricing] = await Promise.all([load(), safePackPricing()]);

  const url = `${BASE_URL}/fr/solutions/${sol.slug}`;
  const graph = jsonLdGraph([
    personNode(),
    webPage({ name: sol.title, description: sol.description, url, locale }),
    breadcrumbList([
      { name: 'Accueil', url: `${BASE_URL}/fr` },
      { name: 'Solutions', url: `${BASE_URL}/fr/solutions` },
      { name: sol.trade, url },
    ]),
    faqPage(sol.faq),
    // Real prices, resolved server-side from Stripe. Omitted entirely rather
    // than guessed if Stripe is unreachable at build time.
    ...(pricing
      ? [
          productNode({
            name: 'SmartTag Digitip — Solo',
            description: 'Plaque époxy NFC pré-programmée pour recevoir des pourboires sans contact.',
            priceCents: pricing.solo.unitAmount,
            currency: pricing.solo.currency,
            url: `${BASE_URL}/fr/pricing`,
            sku: 'digitip-solo',
          }),
          productNode({
            name: 'SmartTag Digitip — Duo',
            description: 'Deux plaques époxy NFC pré-programmées pour recevoir des pourboires sans contact.',
            priceCents: pricing.duo.unitAmount,
            currency: pricing.duo.currency,
            url: `${BASE_URL}/fr/pricing`,
            sku: 'digitip-duo',
          }),
        ]
      : []),
  ]);

  const relatedLinks: { label: string; href: string }[] = sol.related
    .map((s) => getSolution(s))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({ label: s.trade, href: `/solutions/${s.slug}` }));

  relatedLinks.push(
    { label: "L'exonération des pourboires jusqu'en 2028", href: '/guides/exoneration-pourboires-2026' },
    { label: 'Comparatifs des solutions', href: '/comparatif' },
  );

  return (
    <>
      <JsonLd data={graph} />
      <ArticleLayout
        meta={sol}
        hubHref="/solutions"
        hubLabel="Tous les métiers"
        relatedLinks={relatedLinks}
      >
        <Body />
      </ArticleLayout>
    </>
  );
}
