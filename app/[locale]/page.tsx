import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LandingPage } from '@/components/landing/LandingPage';
import { JsonLd } from '@/lib/seo/JsonLd';
import {
  BASE_URL,
  buildPageMetadata,
  faqPage,
  productNode,
  jsonLdGraph,
  type FaqItem,
} from '@/lib/seo';
import { getAllPackPricing } from '@/lib/stripe/pricing';

// Server wrapper around the (client) landing body.
//
// The route used to BE the client component, which meant two things were
// impossible: emitting server-rendered JSON-LD for the page, and getting real
// prices into the initial HTML — they were fetched in a useEffect, so the
// Product/Offer schema had no price to state and the LCP path paid for a
// client round-trip.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return buildPageMetadata({
    locale,
    path: '',
    title: t('title'),
    description: t('description'),
  });
}

/**
 * Pricing feeds the Product schema and the on-page price labels. A Stripe
 * outage must not take the homepage down, so this degrades to null: the page
 * renders with placeholder prices and the Product node is omitted rather than
 * guessed. Checkout deliberately does not do this — there, a stale price would
 * mean charging the wrong amount.
 */
async function safePackPricing() {
  try {
    return await getAllPackPricing();
  } catch (err) {
    console.error('[landing] pricing unavailable:', err);
    return null;
  }
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, pricing] = await Promise.all([
    getTranslations({ locale, namespace: 'landing' }),
    safePackPricing(),
  ]);

  // The same seven questions the page renders, mirrored into schema. Kept in
  // sync by __tests__/seo/landing-schema.test.ts, which fails if the FAQ gains
  // or loses a question without this list following.
  const faq: FaqItem[] = ([1, 2, 3, 4, 5, 6, 7] as const).map((n) => ({
    question: t(`faq.q${n}` as Parameters<typeof t>[0]),
    answer: t(`faq.a${n}` as Parameters<typeof t>[0]),
  }));

  const graph = jsonLdGraph([
    faqPage(faq),
    ...(pricing
      ? [
          productNode({
            name: 'SmartTag Digitip — Solo',
            description:
              'Plaque époxy NFC pré-programmée pour recevoir des pourboires sans contact.',
            priceCents: pricing.solo.unitAmount,
            currency: pricing.solo.currency,
            url: `${BASE_URL}/${locale}/pricing`,
            sku: 'digitip-solo',
          }),
          productNode({
            name: 'SmartTag Digitip — Duo',
            description:
              'Deux plaques époxy NFC pré-programmées pour recevoir des pourboires sans contact.',
            priceCents: pricing.duo.unitAmount,
            currency: pricing.duo.currency,
            url: `${BASE_URL}/${locale}/pricing`,
            sku: 'digitip-duo',
          }),
        ]
      : []),
  ]);

  return (
    <>
      <JsonLd data={graph} />
      <LandingPage pricing={pricing} />
    </>
  );
}
